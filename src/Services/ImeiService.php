<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\ImeiStatus;
use Atoms\Domain\ImeiStatusMachine;
use Atoms\Domain\ImeiValidator;
use Atoms\Domain\VariantLabel;
use Atoms\Domain\WarrantyPolicy;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class ImeiService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly AuditLogger $audit = new AuditLogger(),
        private readonly ImeiStatusMachine $machine = new ImeiStatusMachine(),
        private readonly ImeiValidator $validator = new ImeiValidator()
    ) {
    }

    /**
     * @param array<string, mixed> $data
     */
    public function register(array $data): array
    {
        $product = (new ProductService())->get((int) $data['product_id']);
        $trackMode = (new ProductService())->trackMode($product);
        $raw = (string) ($data['imei'] ?? $data['serial_number'] ?? $data['unit_code'] ?? '');
        $unit = (new \Atoms\Domain\UnitValidator())->assertUnitCode($raw, $trackMode);
        $this->assertUnique($unit);
        $variantId = !empty($data['variant_id'])
            ? (int) $data['variant_id']
            : (new ProductService())->soleActiveVariantId((int) $data['product_id']);

        $status = strtolower(trim((string) ($data['status'] ?? ImeiStatus::Available->value)));
        if (!in_array($status, [ImeiStatus::Available->value, ImeiStatus::Reserved->value], true)) {
            throw new DomainException('Registration supports available or reserved status only.');
        }
        $toStatus = ImeiStatus::from($status);
        $event    = $status === ImeiStatus::Reserved->value ? 'inbound_expected' : 'purchase_received';

        $id = $this->db->insert('imeis', [
            'imei'           => $unit,
            'serial_number'  => sanitize_text_field((string) ($data['serial_number'] ?? ($trackMode === 'serial' ? $unit : ''))),
            'product_id'     => (int) $data['product_id'],
            'variant_id'     => $variantId,
            'branch_id'      => (int) $data['branch_id'],
            'status'         => $toStatus->value,
            'source_type'    => sanitize_key((string) ($data['source_type'] ?? 'purchase')),
            'source_id'      => !empty($data['source_id']) ? (int) $data['source_id'] : null,
            'cost_price'     => (int) ($data['cost_price'] ?? 0),
            'condition_grade'=> sanitize_text_field((string) ($data['condition_grade'] ?? '')),
            'notes'          => sanitize_textarea_field((string) ($data['notes'] ?? '')),
            'created_at'     => $this->db->now(),
            'updated_at'     => $this->db->now(),
        ]);

        $this->recordEvent($id, $event, null, $toStatus, null, (int) $data['branch_id'], $data['source_type'] ?? 'purchase', isset($data['source_id']) ? (int) $data['source_id'] : null, $status === ImeiStatus::Reserved->value ? 'Inbound manifest — awaiting receipt' : 'IMEI registered');
        $this->audit->log('imei.registered', 'imei', $id, null, ['imei' => $unit, 'track_mode' => $trackMode], (int) $data['branch_id']);

        return $this->getById($id);
    }

    public function getById(int $id): array
    {
        $row = $this->db->find('imeis', $id);
        if (!$row) {
            throw new DomainException('IMEI not found.');
        }

        return $this->hydrate($row);
    }

    public function getByImei(string $imei): array
    {
        global $wpdb;
        $digits = $this->validator->normalize($imei);
        $table  = $this->db->table('imeis');
        $row    = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE imei = %s", $digits), ARRAY_A);
        if (!$row) {
            throw new DomainException('IMEI not found.');
        }

        return $this->hydrate($row);
    }

    public function history(int $imeiId): array
    {
        global $wpdb;
        $imei   = $this->getById($imeiId);
        $events = $wpdb->get_results(
            $wpdb->prepare(
                'SELECT * FROM ' . $this->db->table('imei_events') . ' WHERE imei_id = %d ORDER BY id ASC',
                $imeiId
            ),
            ARRAY_A
        ) ?: [];

        return [
            'imei'   => $imei,
            'events' => $events,
        ];
    }

    public function search(string $query): array
    {
        global $wpdb;
        $like  = '%' . $wpdb->esc_like($query) . '%';
        $imeis = $this->db->table('imeis');
        $cust  = $this->db->table('customers');
        $sales = $this->db->table('sales');
        $items = $this->db->table('sale_items');

        $sql = "SELECT DISTINCT i.*
                FROM {$imeis} i
                LEFT JOIN {$items} si ON si.imei_id = i.id
                LEFT JOIN {$sales} s ON s.id = si.sale_id
                LEFT JOIN {$cust} c ON c.id = s.customer_id
                WHERE i.imei LIKE %s
                   OR i.serial_number LIKE %s
                   OR s.invoice_number LIKE %s
                   OR c.name LIKE %s
                   OR c.phone LIKE %s
                ORDER BY i.id DESC
                LIMIT 50";

        $rows = $wpdb->get_results($wpdb->prepare($sql, $like, $like, $like, $like, $like), ARRAY_A) ?: [];

        return array_map(fn($row) => $this->hydrate($row), $rows);
    }

    /**
     * Faulty IMEIs with no open repair ticket — the return escalation queue.
     *
     * @return list<array<string, mixed>>
     */
    public function faultyLines(?int $branchId = null, ?int $minDays = null): array
    {
        global $wpdb;
        $imeis    = $this->db->table('imeis');
        $repairs  = $this->db->table('repairs');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $where    = "i.status = 'faulty' AND r.id IS NULL";
        $params   = [];
        if ($branchId) {
            $where   .= ' AND i.branch_id = %d';
            $params[] = $branchId;
        }
        if ($minDays !== null) {
            $where   .= ' AND DATEDIFF(NOW(), i.updated_at) >= %d';
            $params[] = max(0, $minDays);
        }
        $sql = "SELECT i.id, i.imei, i.branch_id, i.updated_at,
                       DATEDIFF(NOW(), i.updated_at) AS days,
                       p.name AS product_name, v.color, v.storage, v.variant_name
                FROM {$imeis} i
                LEFT JOIN {$repairs} r ON r.imei_id = i.id AND r.status NOT IN ('completed','returned')
                INNER JOIN {$products} p ON p.id = i.product_id
                LEFT JOIN {$variants} v ON v.id = i.variant_id
                WHERE {$where}
                ORDER BY days DESC, i.id DESC
                LIMIT 50";
        $rows = $params !== []
            ? ($wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [])
            : ($wpdb->get_results($sql, ARRAY_A) ?: []);
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $row['variant_label'] = $labels->format($row);
            $label                = (string) ($row['variant_label'] ?? '');
            $name                 = (string) ($row['product_name'] ?? '');
            $row['device_summary'] = trim($row['imei'] . ($name !== '' ? ' · ' . $name : '') . ($label !== '' ? ' · ' . $label : ''));
        }
        unset($row);

        return $rows;
    }

    /**
     * Recently registered IMEIs for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $where    = 'i.created_at >= DATE_SUB(NOW(), INTERVAL %d DAY)';
        $params   = [max(1, $days)];
        if ($branchId) {
            $where   .= ' AND i.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT i.id, i.imei, i.serial_number, i.status, i.source_type, i.cost_price, i.created_at,
                       p.name AS product_name, v.color, v.storage, v.variant_name,
                       DATEDIFF(NOW(), i.created_at) AS days
                FROM {$imeis} i
                INNER JOIN {$products} p ON p.id = i.product_id
                LEFT JOIN {$variants} v ON v.id = i.variant_id
                WHERE {$where}
                ORDER BY i.created_at DESC
                LIMIT 30";
        $rows   = $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $label = $labels->format($row);
            $name  = (string) ($row['product_name'] ?? '');
            $row['variant_label']  = $label;
            $row['device_summary'] = trim(
                ($row['imei'] ?? '') . ($name !== '' ? ' · ' . $name : '') . ($label !== '' ? ' · ' . $label : '')
            );
        }
        unset($row);

        return $rows;
    }

    public function applyEvent(
        int $imeiId,
        string $event,
        string $referenceType,
        int $referenceId,
        ?int $toBranchId = null,
        string $notes = ''
    ): array {
        $row    = $this->getById($imeiId);
        $from   = ImeiStatus::from((string) $row['status']);
        $to     = $this->machine->apply($from, $event);
        $branch = $toBranchId ?: (int) $row['branch_id'];

        $this->db->update('imeis', [
            'status'     => $to->value,
            'branch_id'  => $branch,
            'updated_at' => $this->db->now(),
        ], ['id' => $imeiId]);

        $this->recordEvent(
            $imeiId,
            $event,
            $from,
            $to,
            (int) $row['branch_id'],
            $branch,
            $referenceType,
            $referenceId,
            $notes
        );

        $this->audit->log('imei.transition', 'imei', $imeiId, ['status' => $from->value], ['status' => $to->value, 'event' => $event], $branch);

        return $this->getById($imeiId);
    }

    public function assertSellable(array $imei, int $branchId): void
    {
        $this->assertCompletable($imei, $branchId, false);
    }

    public function assertCompletable(array $imei, int $branchId, bool $fromApproval): void
    {
        $status = ImeiStatus::from((string) $imei['status']);
        if ($fromApproval) {
            if ($status !== ImeiStatus::Reserved) {
                throw new DomainException(sprintf('Approved sale expected IMEI %s to be reserved.', $imei['imei']));
            }
        } elseif (!$status->isSellable()) {
            throw new DomainException(sprintf('Cannot sell IMEI %s — status is %s.', $imei['imei'], $status->label()));
        }
        if ((int) $imei['branch_id'] !== $branchId) {
            throw new DomainException('This device belongs to another branch.');
        }
    }

    public function assertUnique(string $imei): void
    {
        global $wpdb;
        $exists = $wpdb->get_var(
            $wpdb->prepare('SELECT id FROM ' . $this->db->table('imeis') . ' WHERE imei = %s', $imei)
        );
        if ($exists) {
            throw new DomainException('Duplicate IMEI is not allowed: ' . $imei);
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function stockByProduct(?int $branchId = null): array
    {
        global $wpdb;
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $branches = $this->db->table('branches');
        $variants = $this->db->table('product_variants');
        $where    = "i.status = 'available'";
        $params   = [];
        if ($branchId) {
            $where   .= ' AND i.branch_id = %d';
            $params[] = $branchId;
        }

        $sql = "SELECT p.id AS product_id, p.name, p.brand, p.sku, p.low_stock_threshold, p.track_mode,
                       v.id AS variant_id, v.color, v.storage, v.variant_name,
                       i.branch_id, b.name AS branch_name, COUNT(*) AS qty
                FROM {$imeis} i
                INNER JOIN {$products} p ON p.id = i.product_id
                INNER JOIN {$branches} b ON b.id = i.branch_id
                LEFT JOIN {$variants} v ON v.id = i.variant_id
                WHERE {$where}
                GROUP BY p.id, v.id, i.branch_id
                ORDER BY p.name, v.variant_name, b.name";

        $rows = $params
            ? $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A)
            : $wpdb->get_results($sql, ARRAY_A);

        $labels = new VariantLabel();
        foreach ($rows ?: [] as &$row) {
            $row['variant_label'] = $labels->format($row);
        }
        unset($row);

        return $rows ?: [];
    }

    private function hydrate(array $row): array
    {
        global $wpdb;
        $product = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . $this->db->table('products') . ' WHERE id = %d', (int) $row['product_id']), ARRAY_A);
        $branch  = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . $this->db->table('branches') . ' WHERE id = %d', (int) $row['branch_id']), ARRAY_A);
        $variant = null;
        if (!empty($row['variant_id'])) {
            $variant = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . $this->db->table('product_variants') . ' WHERE id = %d', (int) $row['variant_id']), ARRAY_A);
        }
        $row['product'] = $product;
        $row['branch']  = $branch;
        $row['variant'] = $variant;
        $row['variant_label'] = (new VariantLabel())->format(is_array($variant) ? $variant : null);
        $row['selling_min'] = (new VariantLabel())->minimum(
            is_array($product) ? $product : [],
            is_array($variant) ? $variant : null
        )->minor();
        $row['status_label'] = ImeiStatus::from((string) $row['status'])->label();
        $row = array_merge($row, $this->warrantyCover($row, is_array($product) ? $product : null));

        return $row;
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed>|null $product
     * @return array<string, mixed>
     */
    private function warrantyCover(array $row, ?array $product): array
    {
        global $wpdb;
        $policy = new WarrantyPolicy();
        $days   = (int) ($product['warranty_days'] ?? 0);
        $sale   = $wpdb->get_row(
            $wpdb->prepare(
                'SELECT s.posted_at, s.invoice_number
                 FROM ' . $this->db->table('sale_items') . ' si
                 INNER JOIN ' . $this->db->table('sales') . ' s ON s.id = si.sale_id
                 WHERE si.imei_id = %d AND s.status = %s
                 ORDER BY s.posted_at DESC, s.id DESC LIMIT 1',
                (int) $row['id'],
                'completed'
            ),
            ARRAY_A
        );
        $soldAt  = is_array($sale) ? (string) ($sale['posted_at'] ?? '') : '';
        $asOf    = $this->db->now();
        $expires = $soldAt !== '' ? $policy->expiresOn($soldAt, $days) : null;

        return [
            'warranty_days'    => $days,
            'sold_at'          => $soldAt !== '' ? $soldAt : null,
            'warranty_expires' => $expires,
            'in_warranty'      => $soldAt !== '' && $policy->covers($soldAt, $days, $asOf),
            'last_invoice'     => is_array($sale) ? (string) ($sale['invoice_number'] ?? '') : '',
        ];
    }

    private function recordEvent(
        int $imeiId,
        string $event,
        ?ImeiStatus $from,
        ImeiStatus $to,
        ?int $fromBranch,
        ?int $toBranch,
        ?string $referenceType,
        ?int $referenceId,
        string $notes
    ): void {
        $this->db->insert('imei_events', [
            'imei_id'        => $imeiId,
            'event_type'     => $event,
            'from_status'    => $from?->value,
            'to_status'      => $to->value,
            'from_branch_id' => $fromBranch,
            'to_branch_id'   => $toBranch,
            'reference_type' => $referenceType,
            'reference_id'   => $referenceId,
            'user_id'        => $this->context->userId(),
            'notes'          => $notes,
            'created_at'     => $this->db->now(),
        ]);
    }
}
