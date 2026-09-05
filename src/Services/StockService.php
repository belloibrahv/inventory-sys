<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\Money;
use Atoms\Support\Context;
use Atoms\Support\Db;

/** Quantity-based stock for accessories and other non-serialized products. */
final class StockService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly ProductService $products = new ProductService(),
        private readonly AuditLogger $audit = new AuditLogger()
    ) {
    }

    public function adjust(int $branchId, int $productId, ?int $variantId, int $delta, string $reason = ''): array
    {
        $this->context->assertBranchAccess($branchId);
        $product = $this->products->get($productId);
        if ($this->products->trackMode($product) !== 'quantity') {
            throw new DomainException('This product is tracked by unit (IMEI/serial), not quantity.');
        }
        if ($delta === 0) {
            return $this->get($branchId, $productId, $variantId);
        }

        $row = $this->findRow($branchId, $productId, $variantId);
        $next = max(0, (int) ($row['qty_on_hand'] ?? 0) + $delta);
        if ($row) {
            $this->db->update('branch_stock', [
                'qty_on_hand' => $next,
                'updated_at'  => $this->db->now(),
            ], ['id' => (int) $row['id']]);
        } else {
            $this->db->insert('branch_stock', [
                'branch_id'   => $branchId,
                'product_id'  => $productId,
                'variant_id'  => $variantId,
                'qty_on_hand' => $next,
                'avg_cost'    => (int) ($product['default_cost_price'] ?? 0),
                'created_at'  => $this->db->now(),
                'updated_at'  => $this->db->now(),
            ]);
        }

        $this->audit->log('stock.adjusted', 'product', $productId, null, [
            'branch_id'  => $branchId,
            'variant_id' => $variantId,
            'delta'      => $delta,
            'qty'        => $next,
            'reason'     => $reason,
        ], $branchId);

        return $this->get($branchId, $productId, $variantId);
    }

    public function set(int $branchId, int $productId, ?int $variantId, int $qty, int $avgCostMinor = 0): array
    {
        $this->context->assertBranchAccess($branchId);
        $product = $this->products->get($productId);
        if ($this->products->trackMode($product) !== 'quantity') {
            throw new DomainException('This product is tracked by unit (IMEI/serial), not quantity.');
        }
        $qty = max(0, $qty);
        $row = $this->findRow($branchId, $productId, $variantId);
        $cost = $avgCostMinor > 0 ? $avgCostMinor : (int) ($product['default_cost_price'] ?? 0);
        if ($row) {
            $this->db->update('branch_stock', [
                'qty_on_hand' => $qty,
                'avg_cost'    => $cost,
                'updated_at'  => $this->db->now(),
            ], ['id' => (int) $row['id']]);
        } else {
            $this->db->insert('branch_stock', [
                'branch_id'   => $branchId,
                'product_id'  => $productId,
                'variant_id'  => $variantId,
                'qty_on_hand' => $qty,
                'avg_cost'    => $cost,
                'created_at'  => $this->db->now(),
                'updated_at'  => $this->db->now(),
            ]);
        }

        return $this->get($branchId, $productId, $variantId);
    }

    /**
     * @return array{branch_id: int, product_id: int, variant_id: ?int, qty_on_hand: int, avg_cost: int}
     */
    public function get(int $branchId, int $productId, ?int $variantId): array
    {
        $row = $this->findRow($branchId, $productId, $variantId);

        return [
            'branch_id'   => $branchId,
            'product_id'  => $productId,
            'variant_id'  => $variantId,
            'qty_on_hand' => (int) ($row['qty_on_hand'] ?? 0),
            'avg_cost'    => (int) ($row['avg_cost'] ?? 0),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listForBranch(int $branchId): array
    {
        global $wpdb;
        $stock = $this->db->table('branch_stock');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.*, p.name, p.sku, p.category, p.track_mode, v.color, v.storage, v.variant_name
                 FROM {$stock} s
                 INNER JOIN {$products} p ON p.id = s.product_id
                 LEFT JOIN {$variants} v ON v.id = s.variant_id
                 WHERE s.branch_id = %d AND s.qty_on_hand > 0
                 ORDER BY p.name",
                $branchId
            ),
            ARRAY_A
        ) ?: [];

        return array_map(static function (array $row): array {
            $row['qty_on_hand'] = (int) $row['qty_on_hand'];
            $row['avg_cost'] = (int) $row['avg_cost'];

            return $row;
        }, $rows);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function stockRows(?int $branchId = null): array
    {
        global $wpdb;
        $stock    = $this->db->table('branch_stock');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $branches = $this->db->table('branches');
        $where    = 's.qty_on_hand > 0 AND p.is_active = 1';
        $params   = [];
        if ($branchId) {
            $where   .= ' AND s.branch_id = %d';
            $params[] = $branchId;
        }

        $sql = "SELECT s.branch_id, b.name AS branch_name, s.product_id, p.name, p.brand, p.sku,
                       p.low_stock_threshold, p.track_mode,
                       s.variant_id, v.color, v.storage, v.variant_name,
                       s.qty_on_hand AS qty
                FROM {$stock} s
                INNER JOIN {$products} p ON p.id = s.product_id
                INNER JOIN {$branches} b ON b.id = s.branch_id
                LEFT JOIN {$variants} v ON v.id = s.variant_id
                WHERE {$where}
                ORDER BY p.name, b.name";

        $rows = $params
            ? $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A)
            : $wpdb->get_results($sql, ARRAY_A);

        $labels = new \Atoms\Domain\VariantLabel();
        foreach ($rows ?: [] as &$row) {
            $row['qty'] = (int) $row['qty'];
            $row['variant_label'] = $labels->format($row);
        }
        unset($row);

        return $rows ?: [];
    }

    private function findRow(int $branchId, int $productId, ?int $variantId): ?array
    {
        global $wpdb;
        $table = $this->db->table('branch_stock');
        if ($variantId) {
            $row = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT * FROM {$table} WHERE branch_id = %d AND product_id = %d AND variant_id = %d LIMIT 1",
                    $branchId,
                    $productId,
                    $variantId
                ),
                ARRAY_A
            );
        } else {
            $row = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT * FROM {$table} WHERE branch_id = %d AND product_id = %d AND variant_id IS NULL LIMIT 1",
                    $branchId,
                    $productId
                ),
                ARRAY_A
            );
        }

        return $row ?: null;
    }
}
