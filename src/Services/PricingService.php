<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\Money;
use Atoms\Domain\PriceBulkUpdate;
use Atoms\Domain\PricingPolicy;
use Atoms\Support\Context;
use Atoms\Support\Db;

/**
 * Dynamic Pricing Management — bulk updates, market broadcast, history, schedules, approvals.
 */
final class PricingService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly AuditLogger $audit = new AuditLogger(),
        private readonly PriceBulkUpdate $policy = new PriceBulkUpdate(),
        private readonly PricingPolicy $rules = new PricingPolicy()
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function dashboard(): array
    {
        global $wpdb;
        $history = $this->db->table('price_history');
        $sched   = $this->db->table('price_schedules');
        $approvals = $this->db->table('approvals');
        $today   = current_time('Y-m-d');

        $todayCount = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$history} WHERE DATE(created_at) = %s AND status = 'applied'",
            $today
        ));
        $upToday = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$history} WHERE DATE(created_at) = %s AND status = 'applied' AND new_price > old_price",
            $today
        ));
        $downToday = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$history} WHERE DATE(created_at) = %s AND status = 'applied' AND new_price < old_price",
            $today
        ));
        $productsTouched = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(DISTINCT product_id) FROM {$history} WHERE DATE(created_at) = %s AND status = 'applied'",
            $today
        ));
        $pendingApprovals = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$approvals} WHERE status = 'pending' AND type = 'price_bulk'"
        );
        $scheduled = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM {$sched} WHERE status = 'pending'"
        );

        $recent = $wpdb->get_results(
            "SELECT h.*, p.name AS product_name, p.sku
             FROM {$history} h
             LEFT JOIN {$this->db->table('products')} p ON p.id = h.product_id
             WHERE h.status = 'applied'
             ORDER BY h.id DESC LIMIT 12",
            ARRAY_A
        ) ?: [];

        return [
            'today_changes'      => $todayCount,
            'products_updated'   => $productsTouched,
            'upward'             => $upToday,
            'downward'           => $downToday,
            'pending_approvals'  => $pendingApprovals,
            'scheduled_pending'  => $scheduled,
            'reduction_threshold_pct' => $this->reductionThreshold(),
            'recent'             => array_map([$this, 'presentHistory'], $recent),
        ];
    }

    /**
     * @return array{items: list<array<string, mixed>>, total: int}
     */
    public function currentPrices(array $args = []): array
    {
        global $wpdb;
        $table = $this->db->table('products');
        $q     = trim((string) ($args['q'] ?? ''));
        $brand = trim((string) ($args['brand'] ?? ''));
        $cat   = trim((string) ($args['category'] ?? ''));
        $limit = min(200, max(1, (int) ($args['limit'] ?? 100)));
        $where = ['is_active = 1'];
        $params = [];
        if ($q !== '') {
            $like = '%' . $wpdb->esc_like($q) . '%';
            $where[] = '(name LIKE %s OR sku LIKE %s OR brand LIKE %s)';
            array_push($params, $like, $like, $like);
        }
        if ($brand !== '') {
            $where[] = 'brand = %s';
            $params[] = $brand;
        }
        if ($cat !== '') {
            $where[] = 'category = %s';
            $params[] = $cat;
        }
        $sql = "SELECT id, sku, name, brand, category, track_mode,
                       default_cost_price, min_selling_price, current_selling_price, market_price, updated_at
                FROM {$table} WHERE " . implode(' AND ', $where) . ' ORDER BY name ASC LIMIT %d';
        $countSql = "SELECT COUNT(*) FROM {$table} WHERE " . implode(' AND ', $where);
        $total = $params !== []
            ? (int) $wpdb->get_var($wpdb->prepare($countSql, ...$params))
            : (int) $wpdb->get_var($countSql);
        $params[] = $limit;
        $rows = $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];

        return [
            'items' => array_map(static function (array $row): array {
                $row['id'] = (int) $row['id'];
                foreach (['default_cost_price', 'min_selling_price', 'current_selling_price', 'market_price'] as $col) {
                    $row[$col] = (int) ($row[$col] ?? 0);
                }
                return $row;
            }, $rows),
            'total' => $total,
        ];
    }

    /**
     * Preview or apply a bulk catalog price change.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function bulkUpdate(array $data): array
    {
        if (!current_user_can('atoms_manage_pricing') && !current_user_can('atoms_manage_products')) {
            throw new DomainException('You cannot manage pricing.');
        }

        $mode      = $this->policy->normalizeMode((string) ($data['mode'] ?? ''));
        $applyTo   = $this->policy->normalizeApplyTo((string) ($data['apply_to'] ?? 'both'));
        $field     = $this->policy->normalizeField((string) ($data['field'] ?? 'current'));
        $value     = (float) ($data['value'] ?? 0);
        $dryRun    = !empty($data['dry_run']);
        $reason    = sanitize_text_field((string) ($data['reason'] ?? ''));
        $effective = trim((string) ($data['effective_at'] ?? ''));
        $branchId  = isset($data['branch_id']) && $data['branch_id'] !== '' && $data['branch_id'] !== null
            ? (int) $data['branch_id']
            : null;
        $force     = !empty($data['force']) && current_user_can('atoms_approve');

        if ($mode === 'set' && $value < 0) {
            throw new DomainException('Enter the new price in naira.');
        }
        if ($mode === 'percent' && $value == 0.0) {
            throw new DomainException('Enter a percent change, for example 5 or -3.');
        }
        if ($mode === 'amount' && $value == 0.0) {
            throw new DomainException('Enter the naira amount to add or subtract.');
        }
        if ($branchId) {
            $this->context->assertBranchAccess($branchId);
        }

        $products = $this->matchingProducts($data);
        if ($products === []) {
            throw new DomainException('No products match this price update.');
        }

        $column = $this->policy->columnForField($field);
        $vColumn = $this->policy->variantColumnForField($field);
        $threshold = $this->reductionThreshold();
        $changes = [];
        $needsApproval = false;
        $updated = 0;
        $variantsUpdated = 0;

        foreach ($products as $product) {
            $id = (int) $product['id'];
            $rowChange = [
                'id'   => $id,
                'name' => (string) ($product['name'] ?? ''),
                'sku'  => (string) ($product['sku'] ?? ''),
                'field' => $field,
                'variants' => [],
            ];

            if ($applyTo === 'products' || $applyTo === 'both') {
                $old = $this->resolveAmount($product, $column, $field, $branchId);
                $new = $this->policy->nextMinor($old, $mode, $value);
                $rowChange['from'] = $old;
                $rowChange['to'] = $new;
                $rowChange['direction'] = $this->policy->direction($old, $new);
                if ($new !== $old) {
                    if ($this->rules->requiresApproval($old, $new, $threshold)) {
                        $needsApproval = true;
                        $rowChange['requires_approval'] = true;
                    }
                    $updated++;
                }
            }

            if (($applyTo === 'variants' || $applyTo === 'both') && $vColumn) {
                foreach ($product['variants'] ?? [] as $variant) {
                    $vId = (int) ($variant['id'] ?? 0);
                    $vOld = (int) ($variant[$vColumn] ?? 0);
                    if ($field === 'min' && $vOld <= 0) {
                        continue;
                    }
                    if ($field !== 'min' && $vOld <= 0 && $field !== 'current') {
                        // Allow setting current from zero via set mode
                        if ($mode !== 'set') {
                            continue;
                        }
                    }
                    $vNew = $this->policy->nextMinor($vOld, $mode, $value);
                    if ($vNew === $vOld) {
                        continue;
                    }
                    if ($this->rules->requiresApproval($vOld, $vNew, $threshold)) {
                        $needsApproval = true;
                    }
                    $rowChange['variants'][] = [
                        'id' => $vId,
                        'label' => (string) ($variant['label'] ?? ''),
                        'from' => $vOld,
                        'to' => $vNew,
                    ];
                    $variantsUpdated++;
                }
            }

            if (
                (isset($rowChange['from']) && ($rowChange['from'] ?? 0) !== ($rowChange['to'] ?? 0))
                || ($rowChange['variants'] ?? []) !== []
            ) {
                $changes[] = $rowChange;
            }
        }

        if ($changes === []) {
            return [
                'updated' => 0,
                'variants_updated' => 0,
                'dry_run' => $dryRun,
                'changes' => [],
                'field' => $field,
            ];
        }

        if ($dryRun) {
            return [
                'updated' => $updated,
                'variants_updated' => $variantsUpdated,
                'dry_run' => true,
                'changes' => $changes,
                'field' => $field,
                'requires_approval' => $needsApproval && !$force,
                'effective_at' => $effective !== '' ? $effective : null,
            ];
        }

        // Future activation → schedule
        if ($effective !== '' && strtotime($effective) > time()) {
            $scheduleId = $this->db->insert('price_schedules', [
                'name'         => sanitize_text_field((string) ($data['name'] ?? 'Scheduled price update')),
                'payload'      => wp_json_encode(array_merge($data, ['dry_run' => false, 'effective_at' => ''])),
                'effective_at' => gmdate('Y-m-d H:i:s', strtotime($effective)),
                'status'       => 'pending',
                'created_by'   => $this->context->userId(),
                'branch_id'    => $branchId,
                'created_at'   => $this->db->now(),
            ]);
            $this->audit->log('pricing.scheduled', 'price_schedule', $scheduleId, null, [
                'effective_at' => $effective,
                'rows'         => count($changes),
            ], $branchId);

            return [
                'scheduled' => true,
                'schedule_id' => $scheduleId,
                'effective_at' => $effective,
                'updated' => 0,
                'variants_updated' => 0,
                'dry_run' => false,
                'changes' => $changes,
                'field' => $field,
            ];
        }

        if ($needsApproval && !$force) {
            $approvalId = (new ApprovalService())->request('price_bulk', [
                'bulk'    => array_merge($data, ['dry_run' => false, 'force' => true, 'effective_at' => '']),
                'preview' => [
                    'updated' => $updated,
                    'variants_updated' => $variantsUpdated,
                    'changes' => array_slice($changes, 0, 40),
                    'field' => $field,
                    'reason' => $reason,
                ],
            ], $branchId);

            return [
                'pending_approval' => true,
                'approval_id' => $approvalId,
                'updated' => 0,
                'variants_updated' => 0,
                'dry_run' => false,
                'changes' => $changes,
                'field' => $field,
                'message' => 'Large price reduction queued for approval.',
            ];
        }

        return $this->applyChanges($changes, $field, $column, $vColumn, $applyTo, $reason, $mode, $branchId, (string) ($data['change_type'] ?? 'bulk'));
    }

    /**
     * Apply an approved bulk payload (called from ApprovalService).
     *
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function applyApprovedBulk(array $payload): array
    {
        $bulk = $payload['bulk'] ?? $payload;
        if (!is_array($bulk)) {
            throw new DomainException('Invalid price approval payload.');
        }
        $bulk['dry_run'] = false;
        $bulk['force'] = true;
        $bulk['effective_at'] = '';

        return $this->bulkUpdate($bulk);
    }

    /**
     * Market price broadcast via CSV.
     * Expected headers: sku|product_id, current_price|market_price|min_price|cost_price, reason
     *
     * @return array<string, mixed>
     */
    public function importCsv(string $csv, array $opts = []): array
    {
        if (!current_user_can('atoms_manage_pricing') && !current_user_can('atoms_manage_products')) {
            throw new DomainException('You cannot manage pricing.');
        }
        $dryRun = !empty($opts['dry_run']);
        $defaultField = $this->policy->normalizeField((string) ($opts['field'] ?? 'market'));
        $reason = sanitize_text_field((string) ($opts['reason'] ?? 'Market price broadcast'));
        $lines = preg_split('/\R/', trim($csv)) ?: [];
        if (count($lines) < 2) {
            throw new DomainException('CSV needs a header row and at least one data row.');
        }
        $header = array_map(static fn($h) => strtolower(trim((string) $h)), str_getcsv(array_shift($lines)));
        $map = array_flip($header);
        $changes = [];
        $errors = [];

        foreach ($lines as $i => $line) {
            if (trim($line) === '') {
                continue;
            }
            $cols = str_getcsv($line);
            $sku = trim((string) ($cols[$map['sku'] ?? -1] ?? ''));
            $pid = (int) ($cols[$map['product_id'] ?? -1] ?? 0);
            $product = null;
            if ($pid > 0) {
                $product = $this->db->find('products', $pid);
            } elseif ($sku !== '') {
                global $wpdb;
                $product = $wpdb->get_row(
                    $wpdb->prepare('SELECT * FROM ' . $this->db->table('products') . ' WHERE sku = %s LIMIT 1', $sku),
                    ARRAY_A
                );
            }
            if (!$product) {
                $errors[] = 'Row ' . ($i + 2) . ': product not found.';
                continue;
            }

            $targets = [];
            foreach ([
                'current_price' => 'current',
                'current_selling_price' => 'current',
                'market_price' => 'market',
                'min_price' => 'min',
                'min_selling_price' => 'min',
                'cost_price' => 'cost',
                'default_cost_price' => 'cost',
                'price' => $defaultField,
            ] as $key => $field) {
                if (!isset($map[$key])) {
                    continue;
                }
                $raw = trim((string) ($cols[$map[$key]] ?? ''));
                if ($raw === '') {
                    continue;
                }
                $targets[$field] = Money::fromMajor($raw)->minor();
            }
            if ($targets === []) {
                $errors[] = 'Row ' . ($i + 2) . ': no price column.';
                continue;
            }

            foreach ($targets as $field => $newMinor) {
                $column = $this->policy->columnForField($field);
                $old = (int) ($product[$column] ?? 0);
                if ($old === $newMinor) {
                    continue;
                }
                $changes[] = [
                    'id' => (int) $product['id'],
                    'name' => (string) ($product['name'] ?? ''),
                    'sku' => (string) ($product['sku'] ?? ''),
                    'field' => $field,
                    'from' => $old,
                    'to' => $newMinor,
                    'direction' => $this->policy->direction($old, $newMinor),
                    'variants' => [],
                    '_column' => $column,
                ];
            }
        }

        if ($dryRun) {
            return [
                'dry_run' => true,
                'updated' => count($changes),
                'errors' => $errors,
                'changes' => $changes,
            ];
        }

        $applied = 0;
        foreach ($changes as $change) {
            $column = (string) $change['_column'];
            $this->db->update('products', [
                $column => (int) $change['to'],
                'updated_at' => $this->db->now(),
            ], ['id' => (int) $change['id']]);
            $this->recordHistory([
                'product_id' => (int) $change['id'],
                'variant_id' => null,
                'branch_id' => null,
                'field' => (string) $change['field'],
                'old_price' => (int) $change['from'],
                'new_price' => (int) $change['to'],
                'change_type' => 'import',
                'reason' => $reason,
                'status' => 'applied',
            ]);
            $this->audit->log('pricing.import', 'product', (int) $change['id'], [
                $column => (int) $change['from'],
            ], [
                $column => (int) $change['to'],
                'reason' => $reason,
            ]);
            $applied++;
        }

        return [
            'dry_run' => false,
            'updated' => $applied,
            'errors' => $errors,
            'changes' => $changes,
        ];
    }

    /**
     * @return array{items: list<array<string, mixed>>, total: int}
     */
    public function history(array $args = []): array
    {
        global $wpdb;
        $table = $this->db->table('price_history');
        $products = $this->db->table('products');
        $limit = min(200, max(1, (int) ($args['limit'] ?? 50)));
        $productId = (int) ($args['product_id'] ?? 0);
        $where = ['1=1'];
        $params = [];
        if ($productId > 0) {
            $where[] = 'h.product_id = %d';
            $params[] = $productId;
        }
        $sql = "SELECT h.*, p.name AS product_name, p.sku
                FROM {$table} h
                LEFT JOIN {$products} p ON p.id = h.product_id
                WHERE " . implode(' AND ', $where) . '
                ORDER BY h.id DESC LIMIT %d';
        $params[] = $limit;
        $rows = $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];

        return [
            'items' => array_map([$this, 'presentHistory'], $rows),
            'total' => count($rows),
        ];
    }

    /**
     * Activate due scheduled price updates.
     */
    public function activateDueSchedules(): int
    {
        global $wpdb;
        $table = $this->db->table('price_schedules');
        $now = $this->db->now();
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE status = 'pending' AND effective_at <= %s ORDER BY id ASC LIMIT 20",
                $now
            ),
            ARRAY_A
        ) ?: [];
        $done = 0;
        foreach ($rows as $row) {
            $payload = json_decode((string) ($row['payload'] ?? ''), true) ?: [];
            try {
                $this->bulkUpdate(array_merge(is_array($payload) ? $payload : [], [
                    'dry_run' => false,
                    'force' => true,
                    'effective_at' => '',
                ]));
                $this->db->update('price_schedules', [
                    'status' => 'applied',
                    'applied_at' => $now,
                ], ['id' => (int) $row['id']]);
                $done++;
            } catch (\Throwable $e) {
                $this->db->update('price_schedules', [
                    'status' => 'failed',
                    'applied_at' => $now,
                ], ['id' => (int) $row['id']]);
            }
        }

        return $done;
    }

    /**
     * Upsert optional branch-specific selling prices.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function setBranchPrice(array $data): array
    {
        if (!current_user_can('atoms_manage_pricing') && !current_user_can('atoms_manage_products')) {
            throw new DomainException('You cannot manage pricing.');
        }
        $productId = (int) ($data['product_id'] ?? 0);
        $branchId = (int) ($data['branch_id'] ?? 0);
        if ($productId <= 0 || $branchId <= 0) {
            throw new DomainException('Product and branch are required.');
        }
        $this->context->assertBranchAccess($branchId);
        $product = $this->db->find('products', $productId);
        if (!$product) {
            throw new DomainException('Product not found.');
        }

        $fields = [];
        foreach (['current_selling_price' => 'current_selling_price', 'min_selling_price' => 'min_selling_price', 'market_price' => 'market_price', 'cost_price' => 'cost_price'] as $in => $col) {
            if (!array_key_exists($in, $data) && !array_key_exists(str_replace('_selling', '', $in), $data)) {
                continue;
            }
            $raw = $data[$in] ?? $data[str_replace('_selling_price', '', $in)] ?? null;
            if ($raw === null || $raw === '') {
                continue;
            }
            $fields[$col] = Money::fromMajor($raw)->minor();
        }
        if ($fields === []) {
            throw new DomainException('Provide at least one branch price.');
        }

        global $wpdb;
        $table = $this->db->table('product_branch_prices');
        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE product_id = %d AND branch_id = %d AND variant_id IS NULL LIMIT 1",
            $productId,
            $branchId
        ), ARRAY_A);

        $now = $this->db->now();
        if ($existing) {
            $this->db->update('product_branch_prices', array_merge($fields, ['updated_at' => $now]), ['id' => (int) $existing['id']]);
            $id = (int) $existing['id'];
            foreach ($fields as $col => $new) {
                $old = (int) ($existing[$col] ?? 0);
                if ($old === $new) {
                    continue;
                }
                $this->recordHistory([
                    'product_id' => $productId,
                    'variant_id' => null,
                    'branch_id' => $branchId,
                    'field' => $this->fieldFromColumn($col),
                    'old_price' => $old,
                    'new_price' => $new,
                    'change_type' => 'branch',
                    'reason' => sanitize_text_field((string) ($data['reason'] ?? 'Branch price update')),
                    'status' => 'applied',
                ]);
            }
        } else {
            $id = $this->db->insert('product_branch_prices', array_merge([
                'product_id' => $productId,
                'variant_id' => null,
                'branch_id' => $branchId,
                'current_selling_price' => (int) ($fields['current_selling_price'] ?? 0),
                'min_selling_price' => (int) ($fields['min_selling_price'] ?? 0),
                'market_price' => (int) ($fields['market_price'] ?? 0),
                'cost_price' => (int) ($fields['cost_price'] ?? 0),
                'created_at' => $now,
                'updated_at' => $now,
            ], $fields));
            foreach ($fields as $col => $new) {
                $this->recordHistory([
                    'product_id' => $productId,
                    'variant_id' => null,
                    'branch_id' => $branchId,
                    'field' => $this->fieldFromColumn($col),
                    'old_price' => 0,
                    'new_price' => $new,
                    'change_type' => 'branch',
                    'reason' => sanitize_text_field((string) ($data['reason'] ?? 'Branch price set')),
                    'status' => 'applied',
                ]);
            }
        }

        return $this->db->find('product_branch_prices', $id) ?: [];
    }

    /**
     * @param list<array<string, mixed>> $changes
     * @return array<string, mixed>
     */
    private function applyChanges(
        array $changes,
        string $field,
        string $column,
        ?string $vColumn,
        string $applyTo,
        string $reason,
        string $mode,
        ?int $branchId,
        string $changeType
    ): array {
        $updated = 0;
        $variantsUpdated = 0;

        foreach ($changes as $change) {
            $id = (int) $change['id'];
            if (($applyTo === 'products' || $applyTo === 'both') && isset($change['to'], $change['from']) && (int) $change['to'] !== (int) $change['from']) {
                if ($branchId) {
                    $this->setBranchPrice([
                        'product_id' => $id,
                        'branch_id' => $branchId,
                        $column => ((int) $change['to']) / 100,
                        'reason' => $reason !== '' ? $reason : 'Bulk branch price update',
                    ]);
                } else {
                    $this->db->update('products', [
                        $column => (int) $change['to'],
                        'updated_at' => $this->db->now(),
                    ], ['id' => $id]);
                    $this->recordHistory([
                        'product_id' => $id,
                        'variant_id' => null,
                        'branch_id' => null,
                        'field' => $field,
                        'old_price' => (int) $change['from'],
                        'new_price' => (int) $change['to'],
                        'change_type' => $changeType,
                        'reason' => $reason !== '' ? $reason : ('Bulk ' . $mode),
                        'status' => 'applied',
                    ]);
                    $this->audit->log('pricing.bulk', 'product', $id, [$column => (int) $change['from']], [
                        $column => (int) $change['to'],
                        'mode' => $mode,
                        'field' => $field,
                        'reason' => $reason,
                    ]);
                }
                $updated++;
            }

            if (($applyTo === 'variants' || $applyTo === 'both') && $vColumn) {
                foreach ($change['variants'] ?? [] as $variant) {
                    $vId = (int) ($variant['id'] ?? 0);
                    if ($vId <= 0) {
                        continue;
                    }
                    $this->db->update('product_variants', [
                        $vColumn => (int) $variant['to'],
                        'updated_at' => $this->db->now(),
                    ], ['id' => $vId]);
                    $this->recordHistory([
                        'product_id' => $id,
                        'variant_id' => $vId,
                        'branch_id' => $branchId,
                        'field' => $field,
                        'old_price' => (int) $variant['from'],
                        'new_price' => (int) $variant['to'],
                        'change_type' => $changeType,
                        'reason' => $reason !== '' ? $reason : ('Bulk ' . $mode),
                        'status' => 'applied',
                    ]);
                    $variantsUpdated++;
                }
            }
        }

        return [
            'updated' => $updated,
            'variants_updated' => $variantsUpdated,
            'dry_run' => false,
            'changes' => $changes,
            'field' => $field,
            'pending_approval' => false,
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return list<array<string, mixed>>
     */
    private function matchingProducts(array $data): array
    {
        global $wpdb;
        $scope = $this->policy->normalizeScope((string) ($data['scope'] ?? 'selected'));
        $table = $this->db->table('products');
        $where = ['is_active = 1'];
        $params = [];

        if ($scope === 'selected') {
            $ids = array_values(array_unique(array_filter(array_map('intval', (array) ($data['product_ids'] ?? [])))));
            if ($ids === []) {
                throw new DomainException('Select one or more products, or choose a brand / category / batch filter.');
            }
            $where[] = 'id IN (' . implode(',', array_fill(0, count($ids), '%d')) . ')';
            $params = array_merge($params, $ids);
        } elseif ($scope === 'brand') {
            $brand = sanitize_text_field((string) ($data['brand'] ?? ''));
            if ($brand === '') {
                throw new DomainException('Choose a brand.');
            }
            $where[] = 'brand = %s';
            $params[] = $brand;
        } elseif ($scope === 'category') {
            $category = sanitize_text_field((string) ($data['category'] ?? ''));
            if ($category === '') {
                throw new DomainException('Choose a category.');
            }
            $where[] = 'category = %s';
            $params[] = $category;
        } elseif ($scope === 'track') {
            $track = sanitize_text_field((string) ($data['track_mode'] ?? 'imei'));
            $where[] = 'track_mode = %s';
            $params[] = $track;
        } elseif ($scope === 'recent_inbound') {
            $days = max(1, min(60, (int) ($data['inbound_days'] ?? 7)));
            $imeis = $this->db->table('imeis');
            $where[] = "id IN (SELECT DISTINCT product_id FROM {$imeis} WHERE created_at >= DATE_SUB(NOW(), INTERVAL %d DAY))";
            $params[] = $days;
        }

        $sql = 'SELECT * FROM ' . $table . ' WHERE ' . implode(' AND ', $where) . ' ORDER BY name ASC LIMIT 500';
        $rows = $params !== []
            ? $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A)
            : $wpdb->get_results($sql, ARRAY_A);
        $rows = $rows ?: [];

        $variantTable = $this->db->table('product_variants');
        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $variants = $wpdb->get_results($wpdb->prepare(
                "SELECT * FROM {$variantTable} WHERE product_id = %d AND is_active = 1",
                $row['id']
            ), ARRAY_A) ?: [];
            $row['variants'] = array_map(static function (array $v): array {
                $v['id'] = (int) $v['id'];
                $v['label'] = trim((string) (($v['variant_name'] ?? '') ?: trim(($v['color'] ?? '') . ' / ' . ($v['storage'] ?? ''), ' /')));
                foreach (['min_selling_price', 'cost_price', 'current_selling_price', 'market_price'] as $col) {
                    if (array_key_exists($col, $v)) {
                        $v[$col] = (int) ($v[$col] ?? 0);
                    }
                }
                return $v;
            }, $variants);
        }
        unset($row);

        return $rows;
    }

    /**
     * @param array<string, mixed> $product
     */
    private function resolveAmount(array $product, string $column, string $field, ?int $branchId): int
    {
        if ($branchId) {
            global $wpdb;
            $row = $wpdb->get_row($wpdb->prepare(
                'SELECT * FROM ' . $this->db->table('product_branch_prices') . ' WHERE product_id = %d AND branch_id = %d AND variant_id IS NULL LIMIT 1',
                (int) $product['id'],
                $branchId
            ), ARRAY_A);
            if ($row && isset($row[$column])) {
                return (int) $row[$column];
            }
        }
        $amount = (int) ($product[$column] ?? 0);
        // If current price was never set, fall back to min so percent/amount still work.
        if ($field === 'current' && $amount <= 0) {
            return (int) ($product['min_selling_price'] ?? 0);
        }

        return $amount;
    }

    /**
     * @param array<string, mixed> $row
     */
    private function recordHistory(array $row): int
    {
        return $this->db->insert('price_history', [
            'product_id'   => (int) $row['product_id'],
            'variant_id'   => $row['variant_id'] !== null ? (int) $row['variant_id'] : null,
            'branch_id'    => $row['branch_id'] !== null ? (int) $row['branch_id'] : null,
            'field'        => (string) $row['field'],
            'old_price'    => (int) $row['old_price'],
            'new_price'    => (int) $row['new_price'],
            'change_type'  => (string) $row['change_type'],
            'reason'       => (string) ($row['reason'] ?? ''),
            'status'       => (string) ($row['status'] ?? 'applied'),
            'created_by'   => $this->context->userId(),
            'approved_by'  => isset($row['approved_by']) ? (int) $row['approved_by'] : null,
            'created_at'   => $this->db->now(),
        ]);
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function presentHistory(array $row): array
    {
        $userId = (int) ($row['created_by'] ?? 0);
        $user = $userId ? get_userdata($userId) : false;
        $row['id'] = (int) ($row['id'] ?? 0);
        $row['product_id'] = (int) ($row['product_id'] ?? 0);
        $row['old_price'] = (int) ($row['old_price'] ?? 0);
        $row['new_price'] = (int) ($row['new_price'] ?? 0);
        $row['created_by_name'] = $user ? $user->display_name : ($userId ? 'User #' . $userId : '');
        $row['direction'] = $this->policy->direction((int) $row['old_price'], (int) $row['new_price']);

        return $row;
    }

    private function fieldFromColumn(string $column): string
    {
        return match ($column) {
            'current_selling_price' => 'current',
            'market_price' => 'market',
            'cost_price', 'default_cost_price' => 'cost',
            default => 'min',
        };
    }

    private function reductionThreshold(): float
    {
        $ops = get_option(SettingsService::OPTION, []);
        if (!is_array($ops)) {
            $ops = [];
        }
        $pct = (float) ($ops['price_reduction_approval_pct'] ?? PricingPolicy::DEFAULT_REDUCTION_APPROVAL_PCT);

        return $this->rules->clampReductionPct($pct);
    }
}
