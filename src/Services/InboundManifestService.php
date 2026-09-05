<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Support\Context;
use Atoms\Support\Db;

/**
 * Pre-arrival supplier manifests — expected PO lines and reserved IMEIs before physical receipt.
 */
final class InboundManifestService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly PurchaseService $purchases = new PurchaseService(),
        private readonly ImportService $import = new ImportService(),
        private readonly SupplierService $suppliers = new SupplierService(),
        private readonly ProductService $products = new ProductService(),
        private readonly BranchService $branches = new BranchService()
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function desk(?int $branchId = null): array
    {
        $branchId = $branchId ?: $this->context->defaultBranchId();
        if ($branchId) {
            $this->context->assertBranchAccess($branchId);
        }
        $branch = $branchId ? $this->branches->get($branchId) : null;

        return [
            'orders'        => $this->openQueue($branchId),
            'suppliers'     => array_map(static fn(array $s): array => [
                'id'   => (int) $s['id'],
                'name' => (string) $s['name'],
            ], $this->suppliers->all()),
            'products'      => array_map(static fn(array $p): array => [
                'id'          => (int) $p['id'],
                'name'        => (string) $p['name'],
                'sku'         => (string) ($p['sku'] ?? ''),
                'track_mode'  => (string) ($p['track_mode'] ?? 'imei'),
                'cost'        => (int) ($p['default_cost_price'] ?? 0),
            ], $this->products->search('')),
            'import_types'  => $this->import->inboundCatalog(),
            'branch_id'     => $branchId,
            'branch_code'   => $branch['code'] ?? '',
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function openQueue(?int $branchId = null): array
    {
        global $wpdb;
        $purchases = $this->db->table('purchases');
        $suppliers = $this->db->table('suppliers');
        $items     = $this->db->table('purchase_items');
        $imeis     = $this->db->table('imeis');
        $where     = "p.status IN ('ordered', 'inspecting', 'draft')";
        $params    = [];
        if ($branchId) {
            $where    .= ' AND p.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT p.*, s.name AS supplier_name,
                       (SELECT COALESCE(SUM(quantity), 0) FROM {$items} WHERE purchase_id = p.id) AS units,
                       (SELECT COALESCE(SUM(received_qty), 0) FROM {$items} WHERE purchase_id = p.id) AS received,
                       (SELECT COUNT(*) FROM {$imeis} i WHERE i.source_type = 'purchase' AND i.source_id = p.id AND i.status = 'reserved') AS inbound_reserved
                FROM {$purchases} p
                INNER JOIN {$suppliers} s ON s.id = p.supplier_id
                WHERE {$where}
                ORDER BY p.expected_arrival IS NULL, p.expected_arrival ASC, p.id DESC
                LIMIT 80";

        $rows = $params
            ? ($wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [])
            : ($wpdb->get_results($sql, ARRAY_A) ?: []);

        return array_map(static function (array $row): array {
            $row['inbound_reserved'] = (int) ($row['inbound_reserved'] ?? 0);
            $row['units']            = (int) ($row['units'] ?? 0);
            $row['received']         = (int) ($row['received'] ?? 0);

            return $row;
        }, $rows);
    }

    /**
     * @param array<string, mixed> $data
     */
    public function createShipment(array $data): array
    {
        if (empty($data['items']) || !is_array($data['items'])) {
            throw new DomainException('Add at least one product line to the expected shipment.');
        }

        return $this->purchases->create($data);
    }

    /**
     * @param list<array<string, mixed>> $imeis
     */
    public function preRegisterUnits(int $purchaseId, array $imeis): array
    {
        return $this->purchases->preRegisterImeis($purchaseId, $imeis);
    }

    /**
     * @param array<string, mixed> $data
     */
    public function preRegisterOne(array $data): array
    {
        $imei = trim((string) ($data['imei'] ?? ''));
        if ($imei === '') {
            throw new DomainException('IMEI is required.');
        }
        $productId = (int) ($data['product_id'] ?? 0);
        if ($productId <= 0) {
            throw new DomainException('Product is required.');
        }
        $purchaseId = (int) ($data['purchase_id'] ?? 0);
        if ($purchaseId <= 0) {
            throw new DomainException('Select an open purchase order.');
        }

        return $this->purchases->preRegisterImeis($purchaseId, [[
            'imei'            => $imei,
            'serial_number'   => trim((string) ($data['serial_number'] ?? '')),
            'product_id'      => $productId,
            'variant_id'      => !empty($data['variant_id']) ? (int) $data['variant_id'] : null,
            'condition_grade' => sanitize_text_field((string) ($data['condition_grade'] ?? 'new')) ?: 'new',
        ]]);
    }

    /**
     * @return array<string, mixed>
     */
    public function importManifest(string $type, string $csv): array
    {
        return $this->import->runInbound($type, $csv);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function importCatalog(): array
    {
        return $this->import->inboundCatalog();
    }

    /**
     * @return array{csv: string, filename: string, type: string}
     */
    public function importTemplate(string $type): array
    {
        return $this->import->template($type);
    }
}
