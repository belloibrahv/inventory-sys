<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\ImeiValidator;
use Atoms\Domain\StockCountVariance;
use Atoms\Domain\VariantLabel;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class StockCountService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly AuditLogger $audit = new AuditLogger(),
        private readonly ImeiService $imeis = new ImeiService(),
        private readonly StockService $stock = new StockService(),
        private readonly StockCountVariance $variance = new StockCountVariance(),
        private readonly ImeiValidator $validator = new ImeiValidator()
    ) {
    }

    /**
     * @param array<string, mixed> $data
     */
    public function open(array $data): array
    {
        $branchId = (int) ($data['branch_id'] ?? $this->context->defaultBranchId());
        $this->context->assertBranchAccess($branchId);
        if ($this->openIdForBranch($branchId)) {
            throw new DomainException('This branch already has an open stock count. Finish or cancel it first.');
        }

        return $this->db->transaction(function () use ($branchId) {
            $id = $this->db->insert('stock_counts', [
                'branch_id'    => $branchId,
                'status'       => 'open',
                'expected_qty' => 0,
                'counted_qty'  => 0,
                'missing_qty'  => 0,
                'extra_qty'    => 0,
                'counted_by'   => $this->context->userId(),
                'created_at'   => $this->db->now(),
                'updated_at'   => $this->db->now(),
            ]);

            $snapshot = $this->snapshot($branchId);
            foreach ($snapshot as $imei) {
                $this->db->insert('stock_count_lines', [
                    'count_id'         => $id,
                    'imei_id'          => (int) $imei['id'],
                    'imei'             => $imei['imei'],
                    'track_mode'       => 'imei',
                    'expected_status'  => $imei['status'],
                    'found_status'     => null,
                    'expected'         => 1,
                    'counted'          => 0,
                    'expected_qty'     => 1,
                    'counted_qty'      => 0,
                    'variance'         => StockCountVariance::MISSING,
                    'created_at'       => $this->db->now(),
                    'updated_at'       => $this->db->now(),
                ]);
            }

            foreach ($this->snapshotQuantity($branchId) as $row) {
                $variantId = !empty($row['variant_id']) ? (int) $row['variant_id'] : null;
                $this->db->insert('stock_count_lines', [
                    'count_id'     => $id,
                    'imei_id'      => null,
                    'imei'         => $this->quantityLineKey((int) $row['product_id'], $variantId),
                    'track_mode'   => 'quantity',
                    'product_id'   => (int) $row['product_id'],
                    'variant_id'   => $variantId,
                    'expected'     => 1,
                    'counted'      => 0,
                    'expected_qty' => (int) $row['qty_on_hand'],
                    'counted_qty'  => 0,
                    'variance'     => StockCountVariance::MISSING,
                    'created_at'   => $this->db->now(),
                    'updated_at'   => $this->db->now(),
                ]);
            }

            $this->refreshTotals($id);
            $this->audit->log('stock_count.opened', 'stock_count', $id, null, ['expected' => count($snapshot)], $branchId);

            return $this->get($id);
        });
    }

    /**
     * @param array<string, mixed> $data
     */
    public function scan(int $id, array $data): array
    {
        $count = $this->requireStatus($id, 'open');
        $branchId = (int) $count['branch_id'];
        $this->context->assertBranchAccess($branchId);
        $raw = trim((string) ($data['imei'] ?? ''));
        if ($raw === '') {
            throw new DomainException('Scan value is required.');
        }

        foreach ($count['lines'] as $line) {
            if (($line['track_mode'] ?? 'imei') !== 'quantity' || (string) $line['imei'] !== $raw) {
                continue;
            }

            return $this->countQuantity($id, [
                'product_id'  => (int) $line['product_id'],
                'variant_id'  => !empty($line['variant_id']) ? (int) $line['variant_id'] : null,
                'counted_qty' => max(0, (int) ($data['counted_qty'] ?? $line['expected_qty'] ?? 0)),
            ]);
        }

        $raw = $this->validator->assertValid($raw);

        $imei = null;
        try {
            $imei = $this->imeis->getByImei($raw);
        } catch (DomainException) {
            $imei = null;
        }

        $onSnapshot = false;
        $existing   = null;
        foreach ($count['lines'] as $line) {
            if ((string) $line['imei'] === $raw) {
                $existing = $line;
                $onSnapshot = (int) $line['expected'] === 1;
                break;
            }
        }

        $kind = $this->variance->classify($imei, $branchId, $onSnapshot);
        $now  = $this->db->now();

        if ($existing) {
            $this->db->update('stock_count_lines', [
                'counted'      => 1,
                'found_status' => $imei['status'] ?? null,
                'variance'     => $kind,
                'updated_at'   => $now,
            ], ['id' => (int) $existing['id']]);
        } else {
            $this->db->insert('stock_count_lines', [
                'count_id'        => $id,
                'imei_id'         => $imei ? (int) $imei['id'] : null,
                'imei'            => $raw,
                'expected_status' => null,
                'found_status'    => $imei['status'] ?? null,
                'expected'        => 0,
                'counted'         => 1,
                'variance'        => $kind,
                'created_at'      => $now,
                'updated_at'      => $now,
            ]);
        }

        $this->refreshTotals($id);
        $this->audit->log('stock_count.scanned', 'stock_count', $id, null, ['imei' => $raw, 'variance' => $kind], $branchId);

        return $this->get($id);
    }

    /**
     * @param array<string, mixed> $data
     */
    public function countQuantity(int $id, array $data): array
    {
        $count = $this->requireStatus($id, 'open');
        $branchId = (int) $count['branch_id'];
        $this->context->assertBranchAccess($branchId);
        $productId = (int) ($data['product_id'] ?? 0);
        $variantId = !empty($data['variant_id']) ? (int) $data['variant_id'] : null;
        $countedQty = max(0, (int) ($data['counted_qty'] ?? 0));
        if ($productId <= 0) {
            throw new DomainException('Product is required for quantity count.');
        }

        $existing = null;
        foreach ($count['lines'] as $line) {
            if (($line['track_mode'] ?? 'imei') !== 'quantity') {
                continue;
            }
            if ((int) ($line['product_id'] ?? 0) !== $productId) {
                continue;
            }
            $lineVariant = !empty($line['variant_id']) ? (int) $line['variant_id'] : null;
            if ($lineVariant !== $variantId) {
                continue;
            }
            $existing = $line;
            break;
        }
        if (!$existing) {
            throw new DomainException('This accessory is not on the current stock count snapshot.');
        }

        $expectedQty = (int) ($existing['expected_qty'] ?? 0);
        $variance = $this->variance->classifyQuantity($expectedQty, $countedQty);
        $now = $this->db->now();
        $this->db->update('stock_count_lines', [
            'counted'     => 1,
            'counted_qty' => $countedQty,
            'variance'    => $variance,
            'updated_at'  => $now,
        ], ['id' => (int) $existing['id']]);

        $this->refreshTotals($id);
        $this->audit->log('stock_count.quantity', 'stock_count', $id, null, [
            'product_id'  => $productId,
            'variant_id'  => $variantId,
            'counted_qty' => $countedQty,
            'variance'    => $variance,
        ], $branchId);

        return $this->get($id);
    }

    public function submit(int $id, string $reason = ''): array
    {
        $count = $this->requireStatus($id, 'open');
        $this->context->assertBranchAccess((int) $count['branch_id']);
        $this->refreshTotals($id);
        $count = $this->get($id);
        $summary = $this->variance->summary($count['lines']);
        $reason = sanitize_textarea_field($reason);

        if (!$this->variance->needsApproval($summary)) {
            return $this->post($id, $reason);
        }
        if ($reason === '') {
            throw new DomainException('A reason is required when the count does not match the system.');
        }

        $missingLines = [];
        foreach ($count['lines'] as $line) {
            if (($line['track_mode'] ?? 'imei') === 'quantity') {
                $expectedQty = (int) ($line['expected_qty'] ?? 0);
                $countedQty = (int) ($line['counted_qty'] ?? 0);
                if ($countedQty >= $expectedQty) {
                    continue;
                }
                $missingLines[] = [
                    'imei'          => (string) ($line['imei'] ?? ''),
                    'product_name'  => (string) ($line['product_name'] ?? ''),
                    'variant_label' => (string) ($line['variant_label'] ?? ''),
                    'expected_qty'  => $expectedQty,
                    'counted_qty'   => $countedQty,
                ];
                continue;
            }
            if (($line['variance'] ?? '') !== StockCountVariance::MISSING || (int) ($line['expected'] ?? 0) !== 1) {
                continue;
            }
            $missingLines[] = [
                'imei'          => (string) ($line['imei'] ?? ''),
                'product_name'  => (string) ($line['product_name'] ?? ''),
                'variant_label' => (string) ($line['variant_label'] ?? ''),
            ];
        }

        $approvalId = (new ApprovalService())->request('stock_adjustment', [
            'count_id'      => $id,
            'reason'        => $reason,
            'summary'       => $summary,
            'missing_lines' => $missingLines,
            'branch_id'     => (int) $count['branch_id'],
        ], (int) $count['branch_id']);

        $this->db->update('stock_counts', [
            'status'      => 'pending_approval',
            'reason'      => $reason,
            'approval_id' => $approvalId,
            'updated_at'  => $this->db->now(),
        ], ['id' => $id]);
        $this->audit->log('stock_count.submitted', 'stock_count', $id, $count, ['approval_id' => $approvalId], (int) $count['branch_id']);

        return $this->get($id);
    }

    /**
     * @param array<string, mixed> $payload
     */
    public function postApproved(array $payload): array
    {
        return $this->post((int) $payload['count_id'], (string) ($payload['reason'] ?? ''));
    }

    public function reject(int $id): void
    {
        $count = $this->db->find('stock_counts', $id);
        if (!$count) {
            throw new DomainException('Stock count not found.');
        }
        $this->db->update('stock_counts', [
            'status'     => 'rejected',
            'updated_at' => $this->db->now(),
        ], ['id' => $id]);
        $this->audit->log('stock_count.rejected', 'stock_count', $id, $count, ['status' => 'rejected'], (int) $count['branch_id']);
    }

    public function cancel(int $id): array
    {
        $count = $this->requireStatus($id, 'open');
        $this->context->assertBranchAccess((int) $count['branch_id']);
        $this->db->update('stock_counts', [
            'status'     => 'cancelled',
            'updated_at' => $this->db->now(),
        ], ['id' => $id]);
        $this->audit->log('stock_count.cancelled', 'stock_count', $id, $count, ['status' => 'cancelled'], (int) $count['branch_id']);

        return $this->get($id);
    }

    public function get(int $id): array
    {
        $row = $this->db->find('stock_counts', $id);
        if (!$row) {
            throw new DomainException('Stock count not found.');
        }
        global $wpdb;
        $variants = $this->db->table('product_variants');
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $lines    = $this->db->table('stock_count_lines');
        $row['lines'] = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT scl.*, i.serial_number, p.name AS product_name, v.color, v.storage, v.variant_name
                 FROM {$lines} scl
                 LEFT JOIN {$imeis} i ON i.id = scl.imei_id
                 LEFT JOIN {$products} p ON p.id = COALESCE(i.product_id, scl.product_id)
                 LEFT JOIN {$variants} v ON v.id = COALESCE(i.variant_id, scl.variant_id)
                 WHERE scl.count_id = %d
                 ORDER BY scl.track_mode ASC, scl.id ASC",
                $id
            ),
            ARRAY_A
        ) ?: [];
        $labels = new VariantLabel();
        foreach ($row['lines'] as &$line) {
            $line['variant_label'] = $labels->format($line);
        }
        unset($line);
        $row['summary'] = $this->variance->summary($row['lines']);

        return $row;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function list(?int $branchId = null): array
    {
        global $wpdb;
        $table = $this->db->table('stock_counts');
        if ($branchId) {
            return $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE branch_id = %d ORDER BY id DESC LIMIT 50", $branchId), ARRAY_A) ?: [];
        }

        return $wpdb->get_results("SELECT * FROM {$table} ORDER BY id DESC LIMIT 50", ARRAY_A) ?: [];
    }

    /**
     * Open or pending-approval stock counts still in progress.
     *
     * @return list<array<string, mixed>>
     */
    public function openLines(?int $branchId = null): array
    {
        global $wpdb;
        $counts   = $this->db->table('stock_counts');
        $branches = $this->db->table('branches');
        $lines    = $this->db->table('stock_count_lines');
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $where    = "sc.status IN ('open','pending_approval')";
        $params   = [];
        if ($branchId) {
            $where   .= ' AND sc.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT sc.id, sc.branch_id, sc.status, sc.expected_qty, sc.counted_qty, sc.missing_qty, sc.extra_qty,
                       sc.created_at, b.name AS branch_name,
                       DATEDIFF(NOW(), sc.created_at) AS days
                FROM {$counts} sc
                LEFT JOIN {$branches} b ON b.id = sc.branch_id
                WHERE {$where}
                ORDER BY sc.created_at ASC
                LIMIT 30";
        $rows = $params !== []
            ? ($wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [])
            : ($wpdb->get_results($sql, ARRAY_A) ?: []);
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $missing = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT scl.imei, p.name AS product_name, v.color, v.storage, v.variant_name
                     FROM {$lines} scl
                     LEFT JOIN {$imeis} i ON i.id = scl.imei_id
                     LEFT JOIN {$products} p ON p.id = i.product_id
                     LEFT JOIN {$variants} v ON v.id = i.variant_id
                     WHERE scl.count_id = %d AND scl.variance = 'missing'
                     ORDER BY scl.id ASC
                     LIMIT 5",
                    (int) $row['id']
                ),
                ARRAY_A
            ) ?: [];
            $bits = [];
            foreach ($missing as $line) {
                $label = $labels->format($line);
                $name  = (string) ($line['product_name'] ?? '');
                $bit   = trim($line['imei'] . ($name !== '' ? ' · ' . $name : '') . ($label !== '' ? ' · ' . $label : ''));
                if ($bit !== '') {
                    $bits[] = $bit;
                }
            }
            $row['missing_summary'] = implode('; ', $bits);
        }
        unset($row);

        return $rows;
    }

    /**
     * Recently posted stock counts for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $counts   = $this->db->table('stock_counts');
        $branches = $this->db->table('branches');
        $where    = "sc.status = 'posted' AND sc.posted_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
        $params   = [max(1, $days)];
        if ($branchId) {
            $where   .= ' AND sc.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT sc.id, sc.branch_id, sc.status, sc.expected_qty, sc.counted_qty, sc.missing_qty, sc.extra_qty,
                       sc.posted_at, b.name AS branch_name,
                       DATEDIFF(NOW(), sc.posted_at) AS days
                FROM {$counts} sc
                LEFT JOIN {$branches} b ON b.id = sc.branch_id
                WHERE {$where}
                ORDER BY sc.posted_at DESC
                LIMIT 30";

        return $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];
    }

    private function post(int $id, string $reason): array
    {
        $count = $this->get($id);
        if (!in_array($count['status'], ['open', 'pending_approval'], true)) {
            throw new DomainException('This stock count cannot be posted.');
        }

        return $this->db->transaction(function () use ($count, $id, $reason) {
            foreach ($count['lines'] as $line) {
                if (($line['track_mode'] ?? 'imei') === 'quantity' && !empty($line['product_id'])) {
                    $countedQty = (int) ($line['counted_qty'] ?? 0);
                    $expectedQty = (int) ($line['expected_qty'] ?? 0);
                    if ($countedQty !== $expectedQty) {
                        $variantId = !empty($line['variant_id']) ? (int) $line['variant_id'] : null;
                        $this->stock->set(
                            (int) $count['branch_id'],
                            (int) $line['product_id'],
                            $variantId,
                            $countedQty
                        );
                    }
                    continue;
                }
                if (($line['variance'] ?? '') !== StockCountVariance::MISSING || empty($line['imei_id'])) {
                    continue;
                }
                $imei = $this->imeis->getById((int) $line['imei_id']);
                if (!$this->variance->canDispose((string) $imei['status'])) {
                    continue;
                }
                $this->imeis->applyEvent(
                    (int) $imei['id'],
                    'count_missing',
                    'stock_count',
                    $id,
                    (int) $count['branch_id'],
                    $reason !== '' ? $reason : 'Missing at physical count'
                );
            }

            $this->db->update('stock_counts', [
                'status'      => 'posted',
                'reason'      => $reason !== '' ? $reason : $count['reason'],
                'approved_by' => $this->context->userId(),
                'posted_at'   => $this->db->now(),
                'updated_at'  => $this->db->now(),
            ], ['id' => $id]);
            $this->audit->log('stock_count.posted', 'stock_count', $id, $count, ['status' => 'posted'], (int) $count['branch_id']);

            return $this->get($id);
        });
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function snapshot(int $branchId): array
    {
        global $wpdb;
        $table = $this->db->table('imeis');

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE branch_id = %d AND status IN ('available','faulty') ORDER BY id ASC",
                $branchId
            ),
            ARRAY_A
        ) ?: [];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function snapshotQuantity(int $branchId): array
    {
        global $wpdb;
        $stock    = $this->db->table('branch_stock');
        $products = $this->db->table('products');

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.product_id, s.variant_id, s.qty_on_hand
                 FROM {$stock} s
                 INNER JOIN {$products} p ON p.id = s.product_id
                 WHERE s.branch_id = %d AND s.qty_on_hand > 0 AND p.track_mode = 'quantity' AND p.is_active = 1
                 ORDER BY s.product_id ASC, s.variant_id ASC",
                $branchId
            ),
            ARRAY_A
        ) ?: [];
    }

    private function quantityLineKey(int $productId, ?int $variantId): string
    {
        return 'QTY-' . $productId . '-' . ($variantId ?? 0);
    }

    private function refreshTotals(int $id): void
    {
        $count = $this->get($id);
        $summary = $this->variance->summary($count['lines']);
        $expected = 0;
        $counted  = 0;
        foreach ($count['lines'] as $line) {
            if (($line['track_mode'] ?? 'imei') === 'quantity') {
                $expected += (int) ($line['expected_qty'] ?? 0);
                $counted += (int) ($line['counted_qty'] ?? 0);
                continue;
            }
            if ((int) $line['expected'] === 1) {
                $expected++;
            }
            if ((int) $line['counted'] === 1) {
                $counted++;
            }
        }
        $this->db->update('stock_counts', [
            'expected_qty' => $expected,
            'counted_qty'  => $counted,
            'missing_qty'  => $summary[StockCountVariance::MISSING],
            'extra_qty'    => $summary[StockCountVariance::WRONG_BRANCH] + $summary[StockCountVariance::UNKNOWN] + $summary[StockCountVariance::UNEXPECTED_STATUS],
            'updated_at'   => $this->db->now(),
        ], ['id' => $id]);
    }

    private function openIdForBranch(int $branchId): ?int
    {
        global $wpdb;
        $id = $wpdb->get_var(
            $wpdb->prepare(
                'SELECT id FROM ' . $this->db->table('stock_counts') . " WHERE branch_id = %d AND status IN ('open','pending_approval') LIMIT 1",
                $branchId
            )
        );

        return $id ? (int) $id : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function requireStatus(int $id, string $status): array
    {
        $row = $this->get($id);
        if ($row['status'] !== $status) {
            throw new DomainException('Stock count is not ' . $status . '.');
        }

        return $row;
    }
}
