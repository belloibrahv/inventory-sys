<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\Money;
use Atoms\Domain\VariantLabel;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class SupplierService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly AuditLogger $audit = new AuditLogger(),
        private readonly LedgerService $ledger = new LedgerService(),
        private readonly Context $context = new Context(),
        private readonly ImeiService $imeis = new ImeiService()
    ) {
    }

    /**
     * @param array<string, mixed> $data
     */
    public function save(?int $id, array $data): array
    {
        $payload = [
            'name'           => sanitize_text_field((string) $data['name']),
            'contact_person' => sanitize_text_field((string) ($data['contact_person'] ?? '')),
            'phone'          => sanitize_text_field((string) ($data['phone'] ?? '')),
            'email'          => sanitize_email((string) ($data['email'] ?? '')),
            'address'        => sanitize_textarea_field((string) ($data['address'] ?? '')),
            'notes'          => sanitize_textarea_field((string) ($data['notes'] ?? '')),
            'is_active'      => 1,
            'updated_at'     => $this->db->now(),
        ];
        if ($payload['name'] === '') {
            throw new DomainException('Supplier name is required.');
        }

        if ($id) {
            $this->db->update('suppliers', $payload, ['id' => $id]);
            return $this->get($id);
        }

        $payload['created_at'] = $this->db->now();
        $newId = $this->db->insert('suppliers', $payload);
        $this->audit->log('supplier.created', 'supplier', $newId, null, $payload);

        return $this->get($newId);
    }

    public function findByName(string $name, string $phone = ''): ?array
    {
        global $wpdb;
        $name  = sanitize_text_field($name);
        $phone = sanitize_text_field($phone);
        if ($name === '') {
            return null;
        }
        if ($phone !== '') {
            $id = $wpdb->get_var(
                $wpdb->prepare(
                    'SELECT id FROM ' . $this->db->table('suppliers') . ' WHERE name = %s AND phone = %s ORDER BY id ASC LIMIT 1',
                    $name,
                    $phone
                )
            );
            if ($id) {
                return $this->get((int) $id);
            }
        }
        $id = $wpdb->get_var(
            $wpdb->prepare(
                'SELECT id FROM ' . $this->db->table('suppliers') . ' WHERE name = %s ORDER BY id ASC LIMIT 1',
                $name
            )
        );

        return $id ? $this->get((int) $id) : null;
    }

    public function get(int $id): array
    {
        $row = $this->db->find('suppliers', $id);
        if (!$row) {
            throw new DomainException('Supplier not found.');
        }
        $row['balance'] = $this->ledger->balance('supplier', $id)->minor();
        $row['ledger']  = (new LedgerEnricher())->supplierEntries($this->ledger->entries('supplier', $id));
        $row['returns'] = $this->deviceReturns($id);
        if ((int) $row['balance'] > 0) {
            $row['open_purchases'] = (new AnalyticsService())->payableLines(null, $id);
        } else {
            $row['open_purchases'] = [];
        }
        $row['payments'] = $this->payments($id);

        return $row;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function payments(int $supplierId): array
    {
        global $wpdb;
        $payments  = $this->db->table('supplier_payments');
        $purchases = $this->db->table('purchases');

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT sp.*, pu.invoice_number AS purchase_invoice
                 FROM {$payments} sp
                 LEFT JOIN {$purchases} pu ON pu.id = sp.purchase_id
                 WHERE sp.supplier_id = %d AND sp.status = 'posted'
                 ORDER BY sp.posted_at DESC, sp.id DESC
                 LIMIT 50",
                $supplierId
            ),
            ARRAY_A
        ) ?: [];
    }

    /**
     * Recently posted supplier payments for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentPaymentLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $payments  = $this->db->table('supplier_payments');
        $suppliers = $this->db->table('suppliers');
        $purchases = $this->db->table('purchases');
        $where     = "sp.status = 'posted' AND sp.posted_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
        $params    = [max(1, $days)];
        if ($branchId) {
            $where   .= ' AND sp.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT sp.id, sp.supplier_id, sp.purchase_id, sp.amount, sp.method, sp.posted_at,
                       s.name AS supplier_name, pu.invoice_number AS purchase_invoice,
                       DATEDIFF(NOW(), sp.posted_at) AS days
                FROM {$payments} sp
                INNER JOIN {$suppliers} s ON s.id = sp.supplier_id
                LEFT JOIN {$purchases} pu ON pu.id = sp.purchase_id
                WHERE {$where}
                ORDER BY sp.posted_at DESC
                LIMIT 30";

        return $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];
    }

    /**
     * Recently posted supplier returns for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentReturnLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $ledger    = $this->db->table('ledgers');
        $suppliers = $this->db->table('suppliers');
        $imeis     = $this->db->table('imeis');
        $products  = $this->db->table('products');
        $variants  = $this->db->table('product_variants');
        $where     = "le.party_type = 'supplier' AND le.reference_type = 'supplier_return' AND le.entry_type = 'credit'
                      AND le.posted_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
        $params    = [max(1, $days)];
        if ($branchId) {
            $where   .= ' AND le.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT le.id, le.party_id AS supplier_id, le.reference_id AS imei_id, le.amount, le.posted_at, le.branch_id,
                       s.name AS supplier_name,
                       i.imei, p.name AS product_name, v.color, v.storage, v.variant_name,
                       DATEDIFF(NOW(), le.posted_at) AS days
                FROM {$ledger} le
                INNER JOIN {$suppliers} s ON s.id = le.party_id
                INNER JOIN {$imeis} i ON i.id = le.reference_id
                INNER JOIN {$products} p ON p.id = i.product_id
                LEFT JOIN {$variants} v ON v.id = i.variant_id
                WHERE {$where}
                ORDER BY le.posted_at DESC
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
     * @return list<array<string, mixed>>
     */
    public function deviceReturns(int $supplierId): array
    {
        global $wpdb;
        $ledger   = $this->db->table('ledgers');
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $rows     = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT le.posted_at, le.amount, i.imei, i.serial_number, p.name AS product_name, v.color, v.storage, v.variant_name
                 FROM {$ledger} le
                 INNER JOIN {$imeis} i ON i.id = le.reference_id
                 INNER JOIN {$products} p ON p.id = i.product_id
                 LEFT JOIN {$variants} v ON v.id = i.variant_id
                 WHERE le.party_type = 'supplier' AND le.party_id = %d AND le.reference_type = 'supplier_return'
                 ORDER BY le.posted_at DESC, le.id DESC
                 LIMIT 50",
                $supplierId
            ),
            ARRAY_A
        ) ?: [];
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $row['variant_label'] = $labels->format($row);
        }
        unset($row);

        return $rows;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function all(): array
    {
        global $wpdb;
        $rows = $wpdb->get_results('SELECT * FROM ' . $this->db->table('suppliers') . ' WHERE is_active = 1 ORDER BY name', ARRAY_A) ?: [];
        foreach ($rows as &$row) {
            $row['balance'] = $this->ledger->balance('supplier', (int) $row['id'])->minor();
        }
        unset($row);

        return $rows;
    }

    public function archive(int $id): array
    {
        $this->get($id);
        $balance = $this->ledger->balance('supplier', $id);
        if (!$balance->isZero()) {
            throw new DomainException('Clear what we owe this supplier before archiving.');
        }
        $this->db->update('suppliers', [
            'is_active'  => 0,
            'updated_at' => $this->db->now(),
        ], ['id' => $id]);
        $this->audit->log('supplier.archived', 'supplier', $id, ['is_active' => 1], ['is_active' => 0]);

        return $this->get($id);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function archived(): array
    {
        global $wpdb;
        $rows = $wpdb->get_results('SELECT * FROM ' . $this->db->table('suppliers') . ' WHERE is_active = 0 ORDER BY updated_at DESC LIMIT 40', ARRAY_A) ?: [];
        foreach ($rows as &$row) {
            $row['balance'] = $this->ledger->balance('supplier', (int) $row['id'])->minor();
        }
        unset($row);

        return $rows;
    }

    public function restore(int $id): array
    {
        $this->get($id);
        global $wpdb;
        $active = (int) $wpdb->get_var(
            $wpdb->prepare('SELECT is_active FROM ' . $this->db->table('suppliers') . ' WHERE id = %d', $id)
        );
        if ($active === 1) {
            throw new DomainException('Supplier is already active.');
        }
        $this->db->update('suppliers', [
            'is_active'  => 1,
            'updated_at' => $this->db->now(),
        ], ['id' => $id]);
        $this->audit->log('supplier.restored', 'supplier', $id, ['is_active' => 0], ['is_active' => 1]);

        return $this->get($id);
    }

    /**
     * @param array<string, mixed> $data
     */
    public function pay(array $data): array
    {
        $supplierId = (int) $data['supplier_id'];
        $amount     = Money::fromMajor($data['amount'] ?? 0);
        $branchId   = (int) ($data['branch_id'] ?? $this->context->defaultBranchId());
        if (!$branchId) {
            throw new DomainException('Branch is required.');
        }
        $this->context->assertBranchAccess($branchId);
        if ($amount->isZero() || $amount->isNegative()) {
            throw new DomainException('Payment amount must be greater than zero.');
        }
        $this->get($supplierId);

        return $this->db->transaction(function () use ($data, $supplierId, $amount, $branchId) {
            $id = $this->db->insert('supplier_payments', [
                'supplier_id' => $supplierId,
                'purchase_id' => !empty($data['purchase_id']) ? (int) $data['purchase_id'] : null,
                'amount'      => $amount->minor(),
                'method'      => sanitize_key((string) ($data['method'] ?? 'transfer')),
                'branch_id'   => $branchId,
                'status'      => 'posted',
                'notes'       => sanitize_textarea_field((string) ($data['notes'] ?? '')),
                'posted_by'   => $this->context->userId(),
                'posted_at'   => $this->db->now(),
                'created_at'  => $this->db->now(),
            ]);
            $this->ledger->post(
                'supplier',
                $supplierId,
                'credit',
                $amount,
                'supplier_payment',
                $id,
                'Supplier payment',
                $branchId
            );
            $this->audit->log('supplier.payment', 'supplier_payment', $id, null, ['amount' => $amount->minor()], $branchId);

            return $this->db->find('supplier_payments', $id);
        });
    }

    /**
     * Send a purchased device back to the supplier. Credits the supplier ledger by cost.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function returnDevice(array $data): array
    {
        $imei = $this->imeis->getByImei((string) ($data['imei'] ?? ''));
        $branchId = (int) ($data['branch_id'] ?? $imei['branch_id']);
        $this->context->assertBranchAccess($branchId);

        if ((string) $imei['source_type'] !== 'purchase' || empty($imei['source_id'])) {
            throw new DomainException('Only devices received from a purchase can be returned to a supplier.');
        }

        $purchase = $this->db->find('purchases', (int) $imei['source_id']);
        if (!$purchase) {
            throw new DomainException('Original purchase was not found.');
        }

        $supplierId = (int) $purchase['supplier_id'];
        if (!empty($data['supplier_id']) && (int) $data['supplier_id'] !== $supplierId) {
            throw new DomainException('This device was not purchased from that supplier.');
        }
        $this->get($supplierId);

        $cost = new Money((int) $imei['cost_price']);

        return $this->db->transaction(function () use ($imei, $branchId, $supplierId, $cost, $purchase) {
            $updated = $this->imeis->applyEvent(
                (int) $imei['id'],
                'supplier_return',
                'supplier_return',
                $supplierId,
                $branchId,
                'Returned to supplier from purchase ' . $purchase['invoice_number']
            );
            if ($cost->greaterThan(Money::zero())) {
                $this->ledger->post(
                    'supplier',
                    $supplierId,
                    'credit',
                    $cost,
                    'supplier_return',
                    (int) $imei['id'],
                    'Supplier return IMEI ' . $imei['imei'],
                    $branchId
                );
            }
            $this->audit->log(
                'supplier.return',
                'imei',
                (int) $imei['id'],
                ['status' => $imei['status']],
                ['status' => $updated['status'], 'supplier_id' => $supplierId],
                $branchId
            );

            return [
                'imei'        => $updated,
                'supplier_id' => $supplierId,
                'credited'    => $cost->minor(),
            ];
        });
    }
}
