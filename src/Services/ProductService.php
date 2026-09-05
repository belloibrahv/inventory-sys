<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\LowStockPolicy;
use Atoms\Domain\Money;
use Atoms\Domain\PriceBulkUpdate;
use Atoms\Domain\VariantLabel;
use Atoms\Domain\VariantResolver;
use Atoms\Domain\WarrantyPolicy;
use Atoms\Support\Db;

final class ProductService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly AuditLogger $audit = new AuditLogger()
    ) {
    }

    /**
     * @param array<string, mixed> $data
     */
    public function save(?int $id, array $data): array
    {
        $old = $id ? $this->get($id) : null;
        $payload = [
            'sku'                  => sanitize_text_field((string) $data['sku']),
            'name'                 => sanitize_text_field((string) $data['name']),
            'brand'                => sanitize_text_field((string) ($data['brand'] ?? '')),
            'category'             => sanitize_text_field((string) ($data['category'] ?? '')),
            'description'          => sanitize_textarea_field((string) ($data['description'] ?? '')),
            'is_serialized'        => $this->isSerializedFromData($data),
            'track_mode'           => (new \Atoms\Domain\UnitValidator())->normalizeTrackMode((string) ($data['track_mode'] ?? $this->inferTrackMode($data))),
            'min_selling_price'    => Money::fromMajor($data['min_selling_price'] ?? 0)->minor(),
            'current_selling_price'=> Money::fromMajor($data['current_selling_price'] ?? $data['min_selling_price'] ?? 0)->minor(),
            'market_price'         => Money::fromMajor($data['market_price'] ?? 0)->minor(),
            'default_cost_price'   => Money::fromMajor($data['default_cost_price'] ?? 0)->minor(),
            'low_stock_threshold'  => (int) ($data['low_stock_threshold'] ?? 2),
            'warranty_days'        => $this->warrantyDays($data, $old),
            'is_active'            => empty($data['is_active']) && isset($data['is_active']) ? 0 : 1,
            'updated_at'           => $this->db->now(),
        ];

        if ($id) {
            $this->db->update('products', $payload, ['id' => $id]);
            $this->audit->log('product.updated', 'product', $id, $old, $payload);
            $productId = $id;
        } else {
            $payload['created_at'] = $this->db->now();
            $productId = $this->db->insert('products', $payload);
            $this->audit->log('product.created', 'product', $productId, null, $payload);
        }

        if (!empty($data['variants']) && is_array($data['variants'])) {
            $this->syncVariants($productId, $data['variants']);
        }

        return $this->get($productId);
    }

    public function findBySku(string $sku): ?array
    {
        global $wpdb;
        $sku = sanitize_text_field($sku);
        if ($sku === '') {
            return null;
        }
        $id = $wpdb->get_var(
            $wpdb->prepare('SELECT id FROM ' . $this->db->table('products') . ' WHERE sku = %s', $sku)
        );

        return $id ? $this->get((int) $id) : null;
    }

    public function get(int $id): array
    {
        $row = $this->db->find('products', $id);
        if (!$row) {
            throw new DomainException('Product not found.');
        }
        $row['variants'] = $this->variantsFor([(int) $id], false)[(int) $id] ?? [];

        return $row;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function search(string $q = ''): array
    {
        global $wpdb;
        $table = $this->db->table('products');
        if ($q === '') {
            $rows = $wpdb->get_results("SELECT * FROM {$table} WHERE is_active = 1 ORDER BY name LIMIT 200", ARRAY_A) ?: [];
        } else {
            $like = '%' . $wpdb->esc_like($q) . '%';
            $rows = $wpdb->get_results(
                $wpdb->prepare("SELECT * FROM {$table} WHERE is_active = 1 AND (name LIKE %s OR sku LIKE %s OR brand LIKE %s) ORDER BY name LIMIT 50", $like, $like, $like),
                ARRAY_A
            ) ?: [];
        }

        return $this->withVariants($rows, true);
    }

    public function archive(int $id): array
    {
        $old = $this->get($id);
        global $wpdb;
        $available = (int) $wpdb->get_var(
            $wpdb->prepare(
                'SELECT COUNT(*) FROM ' . $this->db->table('imeis') . ' WHERE product_id = %d AND status = %s',
                $id,
                'available'
            )
        );
        if ($available > 0) {
            throw new DomainException(sprintf(
                'Cannot archive %s — %d device(s) are still available in stock.',
                (string) $old['name'],
                $available
            ));
        }
        $this->db->update('products', [
            'is_active'  => 0,
            'updated_at' => $this->db->now(),
        ], ['id' => $id]);
        $this->audit->log('product.archived', 'product', $id, ['is_active' => 1], ['is_active' => 0]);

        return $this->get($id);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function archived(): array
    {
        global $wpdb;
        $table = $this->db->table('products');
        $rows  = $wpdb->get_results("SELECT * FROM {$table} WHERE is_active = 0 ORDER BY updated_at DESC LIMIT 40", ARRAY_A) ?: [];

        return $this->withVariants($rows, false);
    }

    public function restore(int $id): array
    {
        $row = $this->get($id);
        if (!empty($row['is_active'])) {
            throw new DomainException('Product is already in the catalog.');
        }
        $this->db->update('products', [
            'is_active'  => 1,
            'updated_at' => $this->db->now(),
        ], ['id' => $id]);
        $this->audit->log('product.restored', 'product', $id, ['is_active' => 0], ['is_active' => 1]);

        return $this->get($id);
    }

    /**
     * @param array<string, mixed> $data
     * @return array{updated: int, variants_updated: int, dry_run: bool, changes: list<array<string, mixed>>}
     */
    public function bulkUpdatePrices(array $data): array
    {
        // Backward-compatible entry: inventory UI historically updated floors only.
        if (!isset($data['field']) || $data['field'] === '' || $data['field'] === 'floor') {
            $data['field'] = 'min';
        }

        return (new PricingService())->bulkUpdate($data);
    }

    /**
     * @param array<string, mixed> $data
     * @return list<array<string, mixed>>
     */
    private function matchingForPriceUpdate(array $data): array
    {
        global $wpdb;
        $policy = new PriceBulkUpdate();
        $scope  = $policy->normalizeScope((string) ($data['scope'] ?? 'selected'));
        $table  = $this->db->table('products');
        $where  = ['is_active = 1'];
        $params = [];

        if ($scope === 'selected') {
            $ids = array_values(array_unique(array_filter(array_map('intval', (array) ($data['product_ids'] ?? [])))));
            if ($ids === []) {
                throw new DomainException('Select one or more products, or choose a brand / category / tracking filter.');
            }
            $where[] = 'id IN (' . implode(',', array_fill(0, count($ids), '%d')) . ')';
            $params  = array_merge($params, $ids);
        } elseif ($scope === 'brand') {
            $brand = sanitize_text_field((string) ($data['brand'] ?? ''));
            if ($brand === '') {
                throw new DomainException('Choose a brand for this bulk update.');
            }
            $where[]  = 'brand = %s';
            $params[] = $brand;
        } elseif ($scope === 'category') {
            $category = sanitize_text_field((string) ($data['category'] ?? ''));
            if ($category === '') {
                throw new DomainException('Choose a category for this bulk update.');
            }
            $where[]  = 'category = %s';
            $params[] = $category;
        } elseif ($scope === 'track') {
            $track = (new \Atoms\Domain\UnitValidator())->normalizeTrackMode((string) ($data['track_mode'] ?? ''));
            $where[]  = 'track_mode = %s';
            $params[] = $track;
        }

        $sql  = "SELECT * FROM {$table} WHERE " . implode(' AND ', $where) . ' ORDER BY name LIMIT 500';
        $rows = $params
            ? $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A)
            : $wpdb->get_results($sql, ARRAY_A);

        return $this->withVariants($rows ?: [], true);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function lowStockAlerts(?int $branchId = null): array
    {
        global $wpdb;
        $policy   = new LowStockPolicy();
        $labels   = new VariantLabel();
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $branches = $this->db->table('branches');
        $variants = $this->db->table('product_variants');
        $where    = "p.is_active = 1 AND i.status = 'available'";
        $params   = [];
        if ($branchId) {
            $where   .= ' AND i.branch_id = %d';
            $params[] = $branchId;
        }

        $sql = "SELECT p.id AS product_id, p.name, p.sku, p.low_stock_threshold,
                       v.id AS variant_id, v.color, v.storage, v.variant_name,
                       i.branch_id, b.name AS branch_name, COUNT(i.id) AS qty
                FROM {$products} p
                INNER JOIN {$imeis} i ON i.product_id = p.id
                INNER JOIN {$branches} b ON b.id = i.branch_id
                LEFT JOIN {$variants} v ON v.id = i.variant_id
                WHERE {$where}
                GROUP BY p.id, v.id, i.branch_id, p.name, p.sku, p.low_stock_threshold, v.color, v.storage, v.variant_name, b.name
                ORDER BY qty ASC, p.name";

        $rows = $params
            ? $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A)
            : $wpdb->get_results($sql, ARRAY_A);

        $alerts = [];
        foreach ($rows ?: [] as $row) {
            $qty       = (int) $row['qty'];
            $threshold = (int) $row['low_stock_threshold'];
            if (!$policy->isLow($qty, $threshold)) {
                continue;
            }
            $row['variant_label'] = $labels->format($row);
            $row['is_low']        = true;
            $row['track_mode']    = (string) ($row['track_mode'] ?? 'imei');
            $alerts[]             = $row;
        }

        $stock    = $this->db->table('branch_stock');
        $qtyWhere = "p.is_active = 1 AND p.track_mode = 'quantity'";
        $qtyParams = [];
        if ($branchId) {
            $qtyWhere   .= ' AND s.branch_id = %d';
            $qtyParams[] = $branchId;
        }
        $qtySql = "SELECT p.id AS product_id, p.name, p.sku, p.low_stock_threshold, p.track_mode,
                          v.id AS variant_id, v.color, v.storage, v.variant_name,
                          s.branch_id, b.name AS branch_name, s.qty_on_hand AS qty
                   FROM {$stock} s
                   INNER JOIN {$products} p ON p.id = s.product_id
                   INNER JOIN {$branches} b ON b.id = s.branch_id
                   LEFT JOIN {$variants} v ON v.id = s.variant_id
                   WHERE {$qtyWhere}
                   ORDER BY qty ASC, p.name";
        $qtyRows = $qtyParams
            ? $wpdb->get_results($wpdb->prepare($qtySql, ...$qtyParams), ARRAY_A)
            : $wpdb->get_results($qtySql, ARRAY_A);
        foreach ($qtyRows ?: [] as $row) {
            $qty       = (int) $row['qty'];
            $threshold = (int) $row['low_stock_threshold'];
            if (!$policy->isLow($qty, $threshold)) {
                continue;
            }
            $row['variant_label'] = $labels->format($row);
            $row['is_low']        = true;
            $row['track_mode']    = 'quantity';
            $alerts[]             = $row;
        }

        if ($branchId) {
            $zeroQtySql = "SELECT p.id AS product_id, p.name, p.sku, p.low_stock_threshold, p.track_mode,
                                  NULL AS variant_id, '' AS color, '' AS storage, '' AS variant_name,
                                  %d AS branch_id, (SELECT name FROM {$branches} WHERE id = %d) AS branch_name,
                                  0 AS qty
                           FROM {$products} p
                           WHERE p.is_active = 1 AND p.track_mode = 'quantity'
                           AND NOT EXISTS (
                               SELECT 1 FROM {$stock} s
                               WHERE s.product_id = p.id AND s.branch_id = %d
                           )";
            $zeroRows = $wpdb->get_results($wpdb->prepare($zeroQtySql, $branchId, $branchId, $branchId), ARRAY_A) ?: [];
            foreach ($zeroRows as $row) {
                if (!$policy->isLow(0, (int) $row['low_stock_threshold'])) {
                    continue;
                }
                $row['variant_label'] = '';
                $row['is_low']        = true;
                $row['track_mode']    = 'quantity';
                $alerts[]             = $row;
            }
        }

        $emptyWhere = 'p.is_active = 1 AND (p.track_mode IS NULL OR p.track_mode = \'imei\' OR p.track_mode = \'serial\')';
        $emptySql   = "SELECT p.id AS product_id, p.name, p.sku, p.low_stock_threshold,
                              NULL AS variant_id, '' AS color, '' AS storage, '' AS variant_name,
                              %d AS branch_id, (SELECT name FROM {$branches} WHERE id = %d) AS branch_name,
                              0 AS qty
                       FROM {$products} p
                       WHERE {$emptyWhere}
                       AND NOT EXISTS (
                           SELECT 1 FROM {$imeis} i
                           WHERE i.product_id = p.id AND i.status = 'available' AND i.branch_id = %d
                       )";
        if ($branchId) {
            $emptyRows = $wpdb->get_results($wpdb->prepare($emptySql, $branchId, $branchId, $branchId), ARRAY_A) ?: [];
            foreach ($emptyRows as $row) {
                if (!$policy->isLow(0, (int) $row['low_stock_threshold'])) {
                    continue;
                }
                $row['variant_label'] = '';
                $row['is_low']          = true;
                $alerts[]               = $row;
            }
        }

        return $alerts;
    }

    /**
     * @param array<string, mixed> $variant
     */
    public function addVariant(int $productId, array $variant): array
    {
        $this->get($productId);
        $this->syncVariants($productId, [$variant]);
        $this->audit->log('product.variant_added', 'product', $productId, null, $variant);

        return $this->get($productId);
    }

    public function soleActiveVariantId(int $productId): ?int
    {
        $active = [];
        foreach ($this->get($productId)['variants'] ?? [] as $variant) {
            if ((int) ($variant['is_active'] ?? 1) === 1) {
                $active[] = (int) $variant['id'];
            }
        }

        return count($active) === 1 ? $active[0] : null;
    }

    public function resolveVariantId(int $productId, string $color = '', string $storage = ''): ?int
    {
        return (new VariantResolver())->resolve($this->get($productId)['variants'] ?? [], $color, $storage);
    }

    /**
     * @param array<string, mixed> $product
     * @return array<string, mixed>|null
     */
    public function variantOf(array $product, mixed $variantId): ?array
    {
        if (!$variantId) {
            return null;
        }
        foreach ($product['variants'] ?? [] as $variant) {
            if ((int) $variant['id'] === (int) $variantId) {
                return $variant;
            }
        }

        return null;
    }

    /**
     * @param list<array<string, mixed>> $variants
     */
    private function syncVariants(int $productId, array $variants): void
    {
        $labels = new VariantLabel();
        foreach ($variants as $variant) {
            $color   = sanitize_text_field((string) ($variant['color'] ?? ''));
            $storage = sanitize_text_field((string) ($variant['storage'] ?? ''));
            $named   = sanitize_text_field((string) ($variant['variant_name'] ?? ''));
            $payload = [
                'product_id'        => $productId,
                'sku'               => sanitize_text_field((string) ($variant['sku'] ?? '')),
                'color'             => $color,
                'storage'           => $storage,
                'variant_name'      => $named !== '' ? $named : $labels->format(['color' => $color, 'storage' => $storage]),
                'min_selling_price' => $this->optionalMajor($variant['min_selling_price'] ?? null),
                'cost_price'        => $this->optionalMajor($variant['cost_price'] ?? null),
                'is_active'         => isset($variant['is_active']) && ($variant['is_active'] === 0 || $variant['is_active'] === '0' || $variant['is_active'] === false) ? 0 : 1,
                'updated_at'        => $this->db->now(),
            ];
            if (!empty($variant['id'])) {
                $this->db->update('product_variants', $payload, ['id' => (int) $variant['id']]);
            } else {
                $payload['created_at'] = $this->db->now();
                $this->db->insert('product_variants', $payload);
            }
        }
    }

    private function optionalMajor(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        $minor = Money::fromMajor($value)->minor();

        return $minor > 0 ? $minor : null;
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array<string, mixed>>
     */
    private function withVariants(array $rows, bool $activeOnly): array
    {
        if ($rows === []) {
            return [];
        }
        $ids  = array_map(static fn($row) => (int) $row['id'], $rows);
        $byId = $this->variantsFor($ids, $activeOnly);
        foreach ($rows as &$row) {
            $row['variants'] = $byId[(int) $row['id']] ?? [];
        }
        unset($row);

        return $rows;
    }

    /**
     * @param list<int> $productIds
     * @return array<int, list<array<string, mixed>>>
     */
    private function variantsFor(array $productIds, bool $activeOnly): array
    {
        global $wpdb;
        $productIds = array_values(array_filter(array_unique($productIds)));
        if ($productIds === []) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($productIds), '%d'));
        $sql          = 'SELECT * FROM ' . $this->db->table('product_variants') . " WHERE product_id IN ({$placeholders})";
        if ($activeOnly) {
            $sql .= ' AND is_active = 1';
        }
        $sql .= ' ORDER BY id';
        $rows = $wpdb->get_results($wpdb->prepare($sql, ...$productIds), ARRAY_A) ?: [];
        $out  = [];
        $lab  = new VariantLabel();
        foreach ($rows as $row) {
            $row['label'] = $lab->format($row);
            $out[(int) $row['product_id']][] = $row;
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $data
     * @param array<string, mixed>|null $old
     */
    private function warrantyDays(array $data, ?array $old): int
    {
        $policy = new WarrantyPolicy();
        if (array_key_exists('warranty_days', $data) && $data['warranty_days'] !== '' && $data['warranty_days'] !== null) {
            return $policy->clampDays((int) $data['warranty_days']);
        }
        if ($old) {
            return $policy->clampDays((int) ($old['warranty_days'] ?? $this->defaultWarrantyDays()));
        }

        return $this->defaultWarrantyDays();
    }

    private function defaultWarrantyDays(): int
    {
        $ops = (new SettingsService())->get();

        return (new WarrantyPolicy())->clampDays((int) ($ops['warranty_days'] ?? 365));
    }

    /**
     * @param array<string, mixed> $product
     */
    public function trackMode(array $product): string
    {
        if (!empty($product['track_mode'])) {
            return (new \Atoms\Domain\UnitValidator())->normalizeTrackMode((string) $product['track_mode']);
        }
        if (empty($product['is_serialized'])) {
            return 'quantity';
        }
        $cat = strtolower((string) ($product['category'] ?? ''));
        if (str_contains($cat, 'phone') || str_contains($cat, 'device')) {
            return 'imei';
        }

        return 'serial';
    }

    /**
     * @param array<string, mixed> $data
     */
    private function inferTrackMode(array $data): string
    {
        if (isset($data['track_mode']) && $data['track_mode'] !== '') {
            return (string) $data['track_mode'];
        }
        if (isset($data['is_serialized']) && !(bool) $data['is_serialized']) {
            return 'quantity';
        }
        $cat = strtolower((string) ($data['category'] ?? 'Phone'));
        if (str_contains($cat, 'phone') || str_contains($cat, 'device') || str_contains($cat, 'tablet')) {
            return 'imei';
        }
        if (str_contains($cat, 'accessory') || str_contains($cat, 'charger') || str_contains($cat, 'cable')) {
            return 'quantity';
        }

        return 'serial';
    }

    /**
     * @param array<string, mixed> $data
     */
    private function isSerializedFromData(array $data): int
    {
        $mode = $this->inferTrackMode($data);

        return $mode === 'quantity' ? 0 : 1;
    }
}
