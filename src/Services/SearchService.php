<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\WholesalePolicy;
use Atoms\Support\Db;

final class SearchService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly ImeiService $imeis = new ImeiService()
    ) {
    }

    /**
     * @return array<string, list<array<string, mixed>>>
     */
    public function query(string $q): array
    {
        $q = trim($q);
        $empty = ['customers' => [], 'sales' => [], 'products' => [], 'imeis' => [], 'suppliers' => []];
        if (strlen($q) < 2) {
            return $empty;
        }

        global $wpdb;
        $like = '%' . $wpdb->esc_like($q) . '%';

        $customers = $wpdb->get_results(
            $wpdb->prepare('SELECT id, name, phone FROM ' . $this->db->table('customers') . ' WHERE is_active = 1 AND (name LIKE %s OR phone LIKE %s) LIMIT 8', $like, $like),
            ARRAY_A
        ) ?: [];

        $sales = $wpdb->get_results(
            $wpdb->prepare('SELECT id, invoice_number, total, status, sale_type FROM ' . $this->db->table('sales') . ' WHERE invoice_number LIKE %s LIMIT 8', $like),
            ARRAY_A
        ) ?: [];
        $wholesale = new WholesalePolicy();
        foreach ($sales as &$sale) {
            $sale['sale_type_label'] = $wholesale->label((string) ($sale['sale_type'] ?? 'retail'));
        }
        unset($sale);

        $products = $wpdb->get_results(
            $wpdb->prepare(
                'SELECT DISTINCT p.id, p.name, p.sku, p.brand
                 FROM ' . $this->db->table('products') . ' p
                 LEFT JOIN ' . $this->db->table('product_variants') . ' v ON v.product_id = p.id AND v.is_active = 1
                 WHERE p.is_active = 1
                   AND (p.name LIKE %s OR p.sku LIKE %s OR p.brand LIKE %s
                        OR v.color LIKE %s OR v.storage LIKE %s OR v.variant_name LIKE %s)
                 ORDER BY p.name ASC
                 LIMIT 8',
                $like,
                $like,
                $like,
                $like,
                $like,
                $like
            ),
            ARRAY_A
        ) ?: [];
        if ($products !== []) {
            $catalog = new ProductService();
            foreach ($products as &$product) {
                $full = $catalog->get((int) $product['id']);
                $labels = array_values(array_filter(array_map(
                    static fn(array $v): string => trim((string) ($v['label'] ?? '')),
                    $full['variants'] ?? []
                )));
                $product['variant_summary'] = $labels !== [] ? implode(', ', array_slice($labels, 0, 3)) : '';
            }
            unset($product);
        }

        $suppliers = $wpdb->get_results(
            $wpdb->prepare('SELECT id, name, phone FROM ' . $this->db->table('suppliers') . ' WHERE is_active = 1 AND (name LIKE %s OR phone LIKE %s) LIMIT 8', $like, $like),
            ARRAY_A
        ) ?: [];

        $imeis = [];
        try {
            $imeis = array_slice($this->imeis->search($q), 0, 8);
        } catch (\Throwable) {
            $imeis = [];
        }

        return compact('customers', 'sales', 'products', 'imeis', 'suppliers');
    }
}
