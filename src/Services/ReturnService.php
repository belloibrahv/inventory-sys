<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\Money;
use Atoms\Domain\ReturnTypes;
use Atoms\Domain\VariantLabel;
use Atoms\Domain\WarrantyPolicy;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class ReturnService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly AuditLogger $audit = new AuditLogger(),
        private readonly ImeiService $imeis = new ImeiService(),
        private readonly LedgerService $ledger = new LedgerService(),
        private readonly SaleService $sales = new SaleService(),
        private readonly RepairService $repairs = new RepairService()
    ) {
    }

    /**
     * Scan the device. The posted invoice is found from the IMEI — staff do not type it.
     *
     * @return array<string, mixed>
     */
    public function locate(string $imei): array
    {
        $row = $this->imeis->getByImei($imei);
        if (($row['status'] ?? '') !== 'sold') {
            throw new DomainException('Only a sold device can be returned. Status is ' . ($row['status'] ?? 'unknown') . '.');
        }
        global $wpdb;
        $saleId = $wpdb->get_var(
            $wpdb->prepare(
                'SELECT s.id
                 FROM ' . $this->db->table('sale_items') . ' si
                 INNER JOIN ' . $this->db->table('sales') . ' s ON s.id = si.sale_id
                 WHERE si.imei_id = %d AND s.status = %s
                 ORDER BY s.posted_at DESC, s.id DESC LIMIT 1',
                (int) $row['id'],
                'completed'
            )
        );
        if (!$saleId) {
            throw new DomainException('This IMEI is not on a posted invoice.');
        }
        $sale = $this->sales->get((int) $saleId);
        $this->context->assertBranchAccess((int) $sale['branch_id']);
        $item = $this->matchSaleItem($sale['items'], (string) $row['imei']);

        return [
            'imei'              => $this->imeis->history((int) $row['id'])['imei'],
            'sale'              => $sale,
            'item'              => $item,
            'variant_label'     => (string) ($item['variant_label'] ?? $row['variant_label'] ?? ''),
            'invoice_number'    => (string) $sale['invoice_number'],
            'in_warranty'       => !empty($item['in_warranty']),
            'warranty_expires'  => $item['warranty_expires'] ?? null,
        ];
    }

    /**
     * @param array<string, mixed> $data
     */
    public function create(array $data): array
    {
        if (empty($data['sale_id']) && empty($data['items'][0]['imei'])) {
            throw new DomainException('Scan the returned IMEI to locate the invoice.');
        }
        if (empty($data['sale_id']) && !empty($data['items'][0]['imei'])) {
            $found = $this->locate((string) $data['items'][0]['imei']);
            $data['sale_id'] = (int) $found['sale']['id'];
        }
        $sale = $this->sales->get((int) $data['sale_id']);
        if ($sale['status'] !== 'completed') {
            throw new DomainException('Only completed sales can be returned.');
        }
        $this->context->assertBranchAccess((int) $sale['branch_id']);

        $type       = sanitize_key((string) ($data['return_type'] ?? ReturnTypes::GOOD));
        $resolution = sanitize_key((string) ($data['resolution'] ?? ReturnTypes::RESOLUTION_REFUND));
        $event      = ReturnTypes::imeiEvent($type);
        $items      = $data['items'] ?? [];
        if ($items === []) {
            throw new DomainException('Select at least one item to return.');
        }
        if ($type === ReturnTypes::WARRANTY) {
            $this->assertWarrantyCover($sale, $items);
        }

        return $this->db->transaction(function () use ($data, $sale, $type, $resolution, $event, $items) {
            $refund = Money::zero();
            $id     = $this->db->insert('returns', [
                'sale_id'              => (int) $sale['id'],
                'customer_id'          => $sale['customer_id'] ?: null,
                'branch_id'            => (int) $sale['branch_id'],
                'return_type'          => $type,
                'reason'               => sanitize_textarea_field((string) ($data['reason'] ?? '')),
                'resolution'           => $resolution,
                'status'               => 'completed',
                'inspection_notes'     => sanitize_textarea_field((string) ($data['inspection_notes'] ?? '')),
                'refund_amount'        => 0,
                'replacement_imei_id'  => !empty($data['replacement_imei']) ? null : null,
                'created_by'           => $this->context->userId(),
                'posted_at'            => $this->db->now(),
                'created_at'           => $this->db->now(),
                'updated_at'           => $this->db->now(),
            ]);

            $deviceLines = [];
            foreach ($items as $line) {
                $saleItem = $this->matchSaleItem($sale['items'], (string) $line['imei']);
                $this->imeis->applyEvent((int) $saleItem['imei_id'], $event, 'return', $id, (int) $sale['branch_id'], (string) ($data['reason'] ?? ''));
                $this->db->insert('return_items', [
                    'return_id'    => $id,
                    'sale_item_id' => (int) $saleItem['id'],
                    'imei_id'      => (int) $saleItem['imei_id'],
                    'return_type'  => $type,
                    'resolution'   => $resolution,
                ]);
                $refund = $refund->add(new Money((int) $saleItem['selling_price']));
                $label  = (string) ($saleItem['variant_label'] ?? '');
                $name   = (string) ($saleItem['product_name'] ?? '');
                $deviceLines[] = trim((string) $line['imei'] . ($name !== '' ? ' · ' . $name : '') . ($label !== '' ? ' · ' . $label : ''));
            }

            if ($resolution === ReturnTypes::RESOLUTION_REPLACEMENT) {
                if (empty($data['replacement_imei'])) {
                    throw new DomainException('A replacement IMEI is required.');
                }
                $replacement = $this->imeis->getByImei((string) $data['replacement_imei']);
                $this->imeis->assertSellable($replacement, (int) $sale['branch_id']);
                $this->imeis->applyEvent((int) $replacement['id'], 'complete_sale', 'return_replacement', $id, (int) $sale['branch_id'], 'Replacement for return #' . $id);
                $this->db->update('returns', ['replacement_imei_id' => (int) $replacement['id']], ['id' => $id]);
                $refund = Money::zero();
            }

            if (in_array($resolution, [ReturnTypes::RESOLUTION_REFUND, ReturnTypes::RESOLUTION_CREDIT], true) && $refund->greaterThan(Money::zero()) && !empty($sale['customer_id'])) {
                $this->ledger->post(
                    'customer',
                    (int) $sale['customer_id'],
                    'credit',
                    $refund,
                    'return',
                    $id,
                    'Return against ' . $sale['invoice_number'],
                    (int) $sale['branch_id']
                );
            }

            $this->db->update('returns', [
                'refund_amount' => $refund->minor(),
                'updated_at'    => $this->db->now(),
            ], ['id' => $id]);

            $this->audit->log('return.created', 'return', $id, null, [
                'sale'    => $sale['invoice_number'],
                'type'    => $type,
                'devices' => implode('; ', $deviceLines),
            ], (int) $sale['branch_id']);
            if ($type === ReturnTypes::FAULTY) {
                (new NotifyService())->push(
                    'return_escalation',
                    'Faulty return posted',
                    'IMEI from ' . $sale['invoice_number'] . ' is isolated as faulty. Open a repair or return it to the supplier.',
                    ['branch_id' => (int) $sale['branch_id'], 'reference_type' => 'return', 'reference_id' => $id]
                );
            }

            $row = $this->get($id);
            if ($type === ReturnTypes::WARRANTY) {
                $tickets = [];
                foreach ($items as $line) {
                    $tickets[] = $this->repairs->receive([
                        'imei'              => (string) $line['imei'],
                        'customer_id'       => $sale['customer_id'] ?: null,
                        'branch_id'         => (int) $sale['branch_id'],
                        'fault_description' => (string) ($data['reason'] ?? '') !== '' ? (string) $data['reason'] : 'Warranty return',
                        'source'            => 'warranty',
                    ]);
                }
                $row['repairs'] = $tickets;
            }

            return $row;
        });
    }

    public function get(int $id): array
    {
        $row = $this->db->find('returns', $id);
        if (!$row) {
            throw new DomainException('Return not found.');
        }
        global $wpdb;
        $variants = $this->db->table('product_variants');
        $row['items'] = $wpdb->get_results(
            $wpdb->prepare(
                'SELECT ri.*, i.imei, i.serial_number, p.name AS product_name, v.color, v.storage, v.variant_name
                 FROM ' . $this->db->table('return_items') . ' ri
                 INNER JOIN ' . $this->db->table('imeis') . ' i ON i.id = ri.imei_id
                 INNER JOIN ' . $this->db->table('products') . ' p ON p.id = i.product_id
                 LEFT JOIN ' . $variants . ' v ON v.id = i.variant_id
                 WHERE ri.return_id = %d',
                $id
            ),
            ARRAY_A
        ) ?: [];
        $labels = new VariantLabel();
        foreach ($row['items'] as &$item) {
            $item['variant_label'] = $labels->format($item);
        }
        unset($item);

        $sale = $this->sales->get((int) $row['sale_id']);
        $row['invoice_number'] = (string) ($sale['invoice_number'] ?? '');
        $row['customer']       = $sale['customer'] ?? null;
        if (!empty($row['replacement_imei_id'])) {
            $row['replacement'] = $this->imeis->getById((int) $row['replacement_imei_id']);
        }

        return $row;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function list(?int $branchId = null): array
    {
        global $wpdb;
        $returns = $this->db->table('returns');
        $sales   = $this->db->table('sales');
        $items   = $this->db->table('return_items');
        $imeis   = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $sql     = "SELECT r.*, s.invoice_number, i.imei, p.name AS product_name, v.color, v.storage, v.variant_name
                    FROM {$returns} r
                    INNER JOIN {$sales} s ON s.id = r.sale_id
                    INNER JOIN (
                        SELECT return_id, MIN(id) AS first_item_id
                        FROM {$items}
                        GROUP BY return_id
                    ) fx ON fx.return_id = r.id
                    INNER JOIN {$items} ri ON ri.id = fx.first_item_id
                    INNER JOIN {$imeis} i ON i.id = ri.imei_id
                    INNER JOIN {$products} p ON p.id = i.product_id
                    LEFT JOIN {$variants} v ON v.id = i.variant_id";
        if ($branchId) {
            $rows = $wpdb->get_results($wpdb->prepare("{$sql} WHERE r.branch_id = %d ORDER BY r.id DESC LIMIT 100", $branchId), ARRAY_A) ?: [];
        } else {
            $rows = $wpdb->get_results("{$sql} ORDER BY r.id DESC LIMIT 100", ARRAY_A) ?: [];
        }

        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $row['variant_label'] = $labels->format($row);
        }
        unset($row);

        return $rows;
    }

    /**
     * Recently posted returns with device context for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $returns  = $this->db->table('returns');
        $sales    = $this->db->table('sales');
        $items    = $this->db->table('return_items');
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $cust     = $this->db->table('customers');
        $where    = "r.status = 'completed' AND r.posted_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
        $params   = [max(1, $days)];
        if ($branchId) {
            $where   .= ' AND r.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT r.id, r.branch_id, r.return_type, r.resolution, r.refund_amount, r.posted_at,
                       s.invoice_number, c.name AS customer_name,
                       i.imei, p.name AS product_name, v.color, v.storage, v.variant_name,
                       DATEDIFF(NOW(), r.posted_at) AS days
                FROM {$returns} r
                INNER JOIN {$sales} s ON s.id = r.sale_id
                LEFT JOIN {$cust} c ON c.id = r.customer_id
                INNER JOIN (
                    SELECT return_id, MIN(id) AS first_item_id
                    FROM {$items}
                    GROUP BY return_id
                ) fx ON fx.return_id = r.id
                INNER JOIN {$items} ri ON ri.id = fx.first_item_id
                INNER JOIN {$imeis} i ON i.id = ri.imei_id
                INNER JOIN {$products} p ON p.id = i.product_id
                LEFT JOIN {$variants} v ON v.id = i.variant_id
                WHERE {$where}
                ORDER BY r.posted_at DESC
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

    /**
     * @param list<array<string, mixed>> $items
     */
    private function matchSaleItem(array $items, string $imei): array
    {
        foreach ($items as $item) {
            if ((string) $item['imei'] === preg_replace('/\D+/', '', $imei)) {
                return $item;
            }
        }
        throw new DomainException('IMEI ' . $imei . ' was not on this invoice.');
    }

    /**
     * @param array<string, mixed> $sale
     * @param list<array<string, mixed>> $items
     */
    private function assertWarrantyCover(array $sale, array $items): void
    {
        $policy = new WarrantyPolicy();
        $soldAt = (string) ($sale['posted_at'] ?? $sale['created_at'] ?? '');
        $asOf   = $this->db->now();
        foreach ($items as $line) {
            $saleItem = $this->matchSaleItem($sale['items'] ?? [], (string) $line['imei']);
            $days     = (int) ($saleItem['warranty_days'] ?? 0);
            if ($policy->covers($soldAt, $days, $asOf)) {
                continue;
            }
            $expires = $policy->expiresOn($soldAt, $days);
            throw new DomainException(
                $expires === null
                    ? 'This product has no warranty cover. Use a faulty or good-condition return.'
                    : 'Warranty expired on ' . $expires . '. Use a faulty return instead.'
            );
        }
    }
}
