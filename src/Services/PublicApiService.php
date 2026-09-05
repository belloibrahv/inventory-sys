<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\ImeiValidator;
use Atoms\Domain\LowStockPolicy;
use Atoms\Domain\Money;
use Atoms\Domain\WarrantyPolicy;
use DateTimeImmutable;
use wpdb;

final class PublicApiService
{
    private wpdb $db;

    public function __construct(?wpdb $db = null)
    {
        global $wpdb;
        $this->db = $db ?? $wpdb;
    }

    /**
     * Check warranty status of an IMEI for frontend / Elementor widgets.
     * Safe for public exposure: does not expose customer PII or internal cost data.
     *
     * @return array<string, mixed>
     */
    public function checkWarranty(string $rawImei): array
    {
        $imei = preg_replace('/\D/', '', $rawImei);
        if (!(new ImeiValidator())->isValid($imei)) {
            return [
                'success' => false,
                'status'  => 'invalid',
                'message' => 'Please enter a valid 15-digit IMEI number.',
            ];
        }

        $p = $this->db->prefix . 'atoms_';
        $sql = "SELECT i.id, i.imei, i.status, i.variant_id,
                       v.variant_name AS variant_label, v.color, v.storage,
                       pr.name AS product_name, pr.brand, pr.warranty_days,
                       b.name AS branch_name,
                       s.posted_at AS sold_at
                FROM {$p}imeis i
                LEFT JOIN {$p}product_variants v ON v.id = i.variant_id
                LEFT JOIN {$p}products pr ON pr.id = i.product_id
                LEFT JOIN {$p}branches b ON b.id = i.branch_id
                LEFT JOIN {$p}sale_items si ON si.imei_id = i.id
                LEFT JOIN {$p}sales s ON s.id = si.sale_id AND s.status = 'completed'
                WHERE i.imei = %s
                ORDER BY s.posted_at DESC, s.id DESC
                LIMIT 1";

        $row = $this->db->get_row($this->db->prepare($sql, $imei), ARRAY_A);

        if (!$row) {
            return [
                'success' => false,
                'status'  => 'not_found',
                'message' => 'No device found matching this IMEI in official records.',
            ];
        }

        $settings = (new SettingsService())->get();
        $policy   = new WarrantyPolicy();
        $warrantyDays = (int) ($row['warranty_days'] ?? $settings['warranty_days'] ?? 365);

        $deviceName = trim(($row['brand'] ? $row['brand'] . ' ' : '') . ($row['product_name'] ?? 'Device'));
        $specs = trim(($row['color'] ?? '') . ' ' . ($row['storage'] ?? ''));

        if ($row['status'] !== 'sold' || empty($row['sold_at'])) {
            return [
                'success'      => true,
                'status'       => 'in_inventory',
                'is_valid'     => true,
                'device_name'  => $deviceName,
                'specs'        => $specs,
                'branch'       => $row['branch_name'] ?? 'Abu Twins Store',
                'warranty'     => 'Unregistered / In Store',
                'message'      => 'This is an authentic Abu Twins device registered in our system and available in store.',
            ];
        }

        $soldAt = new DateTimeImmutable((string) $row['sold_at']);
        $now    = new DateTimeImmutable('now');
        $active = $policy->covers($soldAt->format('Y-m-d H:i:s'), $warrantyDays, $now->format('Y-m-d H:i:s'));
        $diff   = $now->diff($soldAt);
        $daysPassed = (int) $diff->days;
        $daysRemaining = max(0, $warrantyDays - $daysPassed);

        $expiresAt = $soldAt->modify("+{$warrantyDays} days");

        return [
            'success'        => true,
            'status'         => $active ? 'active' : 'expired',
            'is_valid'       => true,
            'device_name'    => $deviceName,
            'specs'          => $specs,
            'purchase_date'  => $soldAt->format('M d, Y'),
            'expires_date'   => $expiresAt->format('M d, Y'),
            'days_remaining' => $daysRemaining,
            'coverage_days'  => $warrantyDays,
            'branch'         => $row['branch_name'] ?? 'Abu Twins Retail',
            'message'        => $active
                ? "Active Warranty: Covered for {$daysRemaining} more days."
                : "Warranty Expired on {$expiresAt->format('M d, Y')}.",
        ];
    }

    /**
     * Search available stock for public frontend catalog without exposing cost or supplier info.
     *
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    public function catalog(array $params = []): array
    {
        $p = $this->db->prefix . 'atoms_';
        $q = trim((string) ($params['q'] ?? ''));
        $brand = trim((string) ($params['brand'] ?? ''));
        $branchId = !empty($params['branch_id']) ? (int) $params['branch_id'] : null;

        $where = ['pr.is_active = 1'];
        $args  = [];

        if ($q !== '') {
            $where[] = '(pr.name LIKE %s OR pr.brand LIKE %s OR pr.sku LIKE %s)';
            $wild = '%' . $this->db->esc_like($q) . '%';
            $args[] = $wild;
            $args[] = $wild;
            $args[] = $wild;
        }

        if ($brand !== '') {
            $where[] = 'pr.brand = %s';
            $args[]  = $brand;
        }

        $whereSql = implode(' AND ', $where);

        $sql = "SELECT pr.id, pr.name, pr.brand, pr.category, pr.track_mode, pr.low_stock_threshold,
                       v.id AS variant_id, v.variant_name, v.color, v.storage,
                       COALESCE(v.min_selling_price, pr.min_selling_price) AS min_selling_price
                FROM {$p}products pr
                LEFT JOIN {$p}product_variants v ON v.product_id = pr.id AND v.is_active = 1
                WHERE {$whereSql}
                ORDER BY pr.brand ASC, pr.name ASC, v.storage ASC";

        $rows = $args
            ? $this->db->get_results($this->db->prepare($sql, ...$args), ARRAY_A)
            : $this->db->get_results($sql, ARRAY_A);

        $grouped = [];

        foreach ($rows ?: [] as $r) {
            $pid = (int) $r['id'];
            if (!isset($grouped[$pid])) {
                $grouped[$pid] = [
                    'id'                  => $pid,
                    'name'                => $r['name'],
                    'brand'               => $r['brand'],
                    'category'            => $r['category'] ?? 'Phone',
                    'track_mode'          => (string) ($r['track_mode'] ?? 'imei'),
                    'low_stock_threshold' => (int) ($r['low_stock_threshold'] ?? 0),
                    'variants'            => [],
                ];
            }

            if ($r['variant_id']) {
                $vid = (int) $r['variant_id'];
                $grouped[$pid]['variants'][$vid] = $this->variantCatalogRow($r, $vid);
            } elseif (($r['track_mode'] ?? 'imei') === 'quantity') {
                $grouped[$pid]['variants'][0] = $this->variantCatalogRow($r, 0, 'Standard');
            }
        }

        $imeiWhere = "i.status = 'available'";
        if ($branchId) {
            $imeiWhere .= ' AND i.branch_id = ' . (int) $branchId;
        }
        $imeiCounts = $this->db->get_results(
            "SELECT i.product_id, i.variant_id, COUNT(*) AS cnt
             FROM {$p}imeis i
             INNER JOIN {$p}products pr ON pr.id = i.product_id
             WHERE {$imeiWhere} AND pr.is_active = 1
             GROUP BY i.product_id, i.variant_id",
            ARRAY_A
        ) ?: [];

        foreach ($imeiCounts as $c) {
            $pid = (int) $c['product_id'];
            $vid = (int) ($c['variant_id'] ?? 0);
            if (!isset($grouped[$pid])) {
                continue;
            }
            if (!isset($grouped[$pid]['variants'][$vid])) {
                $grouped[$pid]['variants'][$vid] = [
                    'id'        => $vid,
                    'label'     => '',
                    'color'     => null,
                    'storage'   => null,
                    'price'     => 0,
                    'price_fmt' => (new Money(0))->format(),
                    'in_stock'  => 0,
                ];
            }
            $grouped[$pid]['variants'][$vid]['in_stock'] = (int) $c['cnt'];
        }

        $qtyWhere = "p.is_active = 1 AND p.track_mode = 'quantity' AND s.qty_on_hand > 0";
        $qtyArgs  = [];
        if ($branchId) {
            $qtyWhere .= ' AND s.branch_id = %d';
            $qtyArgs[] = $branchId;
        }
        $qtySql = "SELECT s.product_id, s.variant_id, s.qty_on_hand AS cnt,
                          p.name, p.brand, p.category, p.min_selling_price, p.low_stock_threshold,
                          v.variant_name, v.color, v.storage,
                          COALESCE(v.min_selling_price, p.min_selling_price) AS variant_price
                   FROM {$p}branch_stock s
                   INNER JOIN {$p}products p ON p.id = s.product_id
                   LEFT JOIN {$p}product_variants v ON v.id = s.variant_id
                   WHERE {$qtyWhere}";
        $qtyRows = $qtyArgs
            ? $this->db->get_results($this->db->prepare($qtySql, ...$qtyArgs), ARRAY_A)
            : $this->db->get_results($qtySql, ARRAY_A);

        foreach ($qtyRows ?: [] as $c) {
            $pid = (int) $c['product_id'];
            $vid = $c['variant_id'] ? (int) $c['variant_id'] : 0;
            if (!isset($grouped[$pid])) {
                $grouped[$pid] = [
                    'id'                  => $pid,
                    'name'                => $c['name'],
                    'brand'               => $c['brand'],
                    'category'            => $c['category'] ?? 'Accessory',
                    'track_mode'          => 'quantity',
                    'low_stock_threshold' => (int) ($c['low_stock_threshold'] ?? 0),
                    'variants'            => [],
                ];
            }
            if (!isset($grouped[$pid]['variants'][$vid])) {
                $grouped[$pid]['variants'][$vid] = $this->variantCatalogRow([
                    'variant_name'      => $c['variant_name'],
                    'color'             => $c['color'],
                    'storage'           => $c['storage'],
                    'min_selling_price' => $c['variant_price'] ?? $c['min_selling_price'],
                ], $vid, $vid ? null : 'Standard');
            }
            $grouped[$pid]['variants'][$vid]['in_stock'] = (int) $c['cnt'];
        }

        $policy = new LowStockPolicy();
        $list   = [];
        foreach ($grouped as $pData) {
            $pData['variants'] = array_values($pData['variants']);
            $pData['total_stock'] = array_sum(array_column($pData['variants'], 'in_stock'));
            $threshold = (int) ($pData['low_stock_threshold'] ?? 0);
            $pData['is_low_stock'] = $policy->isLow($pData['total_stock'], $threshold);
            foreach ($pData['variants'] as $idx => $variant) {
                $pData['variants'][$idx]['is_low_stock'] = $policy->isLow(
                    (int) ($variant['in_stock'] ?? 0),
                    $threshold
                );
            }
            unset($pData['low_stock_threshold']);
            if ($pData['total_stock'] > 0) {
                $list[] = $pData;
            }
        }

        return [
            'success' => true,
            'items'   => $list,
            'count'   => count($list),
        ];
    }

    /**
     * Estimate trade-in / swap valuation based on model and condition.
     *
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    public function estimateSwap(array $params): array
    {
        $brand     = sanitize_text_field((string) ($params['brand'] ?? ''));
        $model     = sanitize_text_field((string) ($params['model'] ?? ''));
        $storage   = sanitize_text_field((string) ($params['storage'] ?? ''));
        $condition = sanitize_text_field((string) ($params['condition'] ?? 'good')); // pristine, good, fair, broken
        $hasBox    = !empty($params['has_box']);
        $hasCharger= !empty($params['has_charger']);

        $p = $this->db->prefix . 'atoms_';
        $sql = "SELECT v.min_selling_price, pr.name
                FROM {$p}product_variants v
                JOIN {$p}products pr ON pr.id = v.product_id
                WHERE pr.brand LIKE %s AND pr.name LIKE %s
                ORDER BY v.min_selling_price DESC LIMIT 1";

        $matched = $this->db->get_row(
            $this->db->prepare(
                $sql,
                '%' . $this->db->esc_like($brand) . '%',
                '%' . $this->db->esc_like($model) . '%'
            ),
            ARRAY_A
        );

        $basePrice = $matched ? (int) $matched['min_selling_price'] : 15000000;

        $multipliers = [
            'pristine' => 0.75,
            'good'     => 0.65,
            'fair'     => 0.50,
            'broken'   => 0.25,
        ];

        $mult = $multipliers[$condition] ?? 0.60;
        if ($hasBox) {
            $mult += 0.03;
        }
        if ($hasCharger) {
            $mult += 0.02;
        }

        $estimatedVal = (int) round($basePrice * $mult);
        $minVal       = (int) round($estimatedVal * 0.90);
        $maxVal       = (int) round($estimatedVal * 1.10);

        return [
            'success'        => true,
            'device'         => trim("{$brand} {$model} {$storage}"),
            'condition'      => ucfirst($condition),
            'estimated_kobo' => $estimatedVal,
            'estimated_min'  => (new Money($minVal))->format(),
            'estimated_max'  => (new Money($maxVal))->format(),
            'estimated_fmt'  => (new Money($estimatedVal))->format(),
            'valuation_note' => 'Estimated valuation range is subject to physical verification in store.',
            'whatsapp_cta'   => 'Get Instant Cash or Swap in Store',
        ];
    }

    /**
     * Get public branches directory.
     *
     * @return array<string, mixed>
     */
    public function branches(): array
    {
        $p = $this->db->prefix . 'atoms_';
        $rows = $this->db->get_results("SELECT id, name, code, address, phone FROM {$p}branches WHERE is_active = 1 ORDER BY name ASC", ARRAY_A);

        $settings = (new SettingsService())->get();
        $waPhone  = preg_replace('/\D/', '', (string) ($settings['whatsapp_phone'] ?? ''));

        $items = array_map(static function (array $r) use ($waPhone): array {
            $phone = (string) ($r['phone'] ?? $waPhone);
            $cleanPhone = preg_replace('/\D/', '', $phone);

            return [
                'id'       => (int) $r['id'],
                'name'     => $r['name'],
                'code'     => $r['code'],
                'address'  => $r['address'] ?? 'Store location',
                'phone'    => $phone,
                'whatsapp' => $cleanPhone ? "https://wa.me/{$cleanPhone}" : '',
            ];
        }, $rows ?: []);

        return [
            'success' => true,
            'items'   => $items,
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function variantCatalogRow(array $row, int $variantId, ?string $fallbackLabel = null): array
    {
        $label = trim((string) ($row['variant_name'] ?? ''));
        if ($label === '') {
            $label = trim(($row['color'] ?? '') . ' ' . ($row['storage'] ?? ''));
        }
        if ($label === '' && $fallbackLabel !== null) {
            $label = $fallbackLabel;
        }
        $price = (int) ($row['min_selling_price'] ?? 0);

        return [
            'id'        => $variantId,
            'label'     => $label,
            'color'     => $row['color'] ?? null,
            'storage'   => $row['storage'] ?? null,
            'price'     => $price,
            'price_fmt' => (new Money($price))->format(),
            'in_stock'  => 0,
        ];
    }
}
