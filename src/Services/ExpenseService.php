<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\Money;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class ExpenseService
{
    public const CATEGORIES = ['rent', 'fuel', 'salary', 'transport', 'utility', 'repairs', 'other'];

    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly AuditLogger $audit = new AuditLogger(),
        private readonly LedgerService $ledger = new LedgerService()
    ) {
    }

    public function threshold(): Money
    {
        $naira = (float) get_option('atoms_expense_approval_threshold', 50000);
        return Money::fromMajor($naira);
    }

    /**
     * @param array<string, mixed> $data
     */
    public function submit(array $data): array
    {
        $branchId = (int) ($data['branch_id'] ?? $this->context->defaultBranchId());
        $this->context->assertBranchAccess($branchId);
        $amount = Money::fromMajor($data['amount'] ?? 0);
        if ($amount->isZero() || $amount->isNegative()) {
            throw new DomainException('Expense amount must be greater than zero.');
        }
        $category = sanitize_key((string) ($data['category'] ?? 'other'));
        if (!in_array($category, self::CATEGORIES, true)) {
            throw new DomainException('Unknown expense category.');
        }

        $needsApproval = $amount->greaterThanOrEqual($this->threshold());
        if ($needsApproval && !current_user_can('atoms_approve') && empty($data['approval_id'])) {
            $draft = $this->insert($data, $branchId, $amount, $category, 'pending_approval');
            $approvalId = (new ApprovalService())->request('expense', [
                'expense_id' => $draft['id'],
                'amount'     => $amount->major(),
                'category'   => $category,
                'description'=> $data['description'] ?? '',
                'branch_id'  => $branchId,
                'vendor'     => $data['vendor'] ?? '',
            ], $branchId);
            $this->db->update('expenses', ['approval_id' => $approvalId], ['id' => (int) $draft['id']]);
            $draft['approval_id'] = $approvalId;

            return $draft;
        }

        return $this->post((int) ($data['expense_id'] ?? 0) ?: null, $data, $branchId, $amount, $category);
    }

    /**
     * @param array<string, mixed> $data
     */
    public function postApproved(array $data): array
    {
        $expense = $this->db->find('expenses', (int) $data['expense_id']);
        if (!$expense) {
            throw new DomainException('Expense not found.');
        }
        $this->db->update('expenses', [
            'status'     => 'posted',
            'posted_at'  => $this->db->now(),
            'posted_by'  => $this->context->userId(),
            'updated_at' => $this->db->now(),
        ], ['id' => (int) $expense['id']]);
        $this->ledger->post(
            'branch',
            (int) $expense['branch_id'],
            'debit',
            new Money((int) $expense['amount']),
            'expense',
            (int) $expense['id'],
            'Expense ' . $expense['category'],
            (int) $expense['branch_id']
        );
        $this->audit->log('expense.posted', 'expense', (int) $expense['id'], $expense, ['status' => 'posted'], (int) $expense['branch_id']);

        return $this->db->find('expenses', (int) $expense['id']) ?: [];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function list(?int $branchId = null): array
    {
        global $wpdb;
        $table = $this->db->table('expenses');
        if ($branchId) {
            $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE branch_id = %d ORDER BY id DESC LIMIT 100", $branchId), ARRAY_A) ?: [];
        } else {
            $rows = $wpdb->get_results("SELECT * FROM {$table} ORDER BY id DESC LIMIT 100", ARRAY_A) ?: [];
        }

        return $this->hydrateList($rows);
    }

    /**
     * Expenses waiting for manager approval.
     *
     * @return list<array<string, mixed>>
     */
    public function pendingLines(?int $branchId = null): array
    {
        global $wpdb;
        $table = $this->db->table('expenses');
        $where = "status = 'pending_approval'";
        if ($branchId) {
            $rows = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT * FROM {$table} WHERE {$where} AND branch_id = %d ORDER BY id ASC LIMIT 30",
                    $branchId
                ),
                ARRAY_A
            ) ?: [];
        } else {
            $rows = $wpdb->get_results(
                "SELECT * FROM {$table} WHERE {$where} ORDER BY id ASC LIMIT 30",
                ARRAY_A
            ) ?: [];
        }
        $rows = $this->hydrateList($rows);
        foreach ($rows as &$row) {
            $created = (string) ($row['created_at'] ?? '');
            $row['days'] = $created !== ''
                ? (int) $wpdb->get_var($wpdb->prepare('SELECT DATEDIFF(NOW(), %s)', $created))
                : 0;
        }
        unset($row);

        return $rows;
    }

    /**
     * @return array{pending_count: int, pending_total: int, posted_today_count: int, posted_today_total: int, posted_14d_count: int, posted_14d_total: int, category_count_14d: int, top_category_14d: string, top_category_total_14d: int, largest_pending_amount: int}
     */
    public function snapshot(?int $branchId = null): array
    {
        global $wpdb;
        $table = $this->db->table('expenses');
        $today = function_exists('current_time') ? current_time('Y-m-d') : gmdate('Y-m-d');
        $start = $today . ' 00:00:00';
        $end   = $today . ' 23:59:59';

        $pendingWhere = "status = 'pending_approval'";
        $todayWhere   = "status = 'posted' AND posted_at >= %s AND posted_at <= %s";
        $recentWhere  = "status = 'posted' AND posted_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)";

        $pendingParams = [];
        $todayParams   = [$start, $end];
        $recentParams  = [];
        if ($branchId) {
            $pendingWhere .= ' AND branch_id = %d';
            $pendingParams[] = $branchId;
            $todayWhere   .= ' AND branch_id = %d';
            $todayParams[] = $branchId;
            $recentWhere  .= ' AND branch_id = %d';
            $recentParams[] = $branchId;
        }

        $pending = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total FROM {$table} WHERE {$pendingWhere}",
                ...$pendingParams
            ),
            ARRAY_A
        ) ?: [];
        $postedToday = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total FROM {$table} WHERE {$todayWhere}",
                ...$todayParams
            ),
            ARRAY_A
        ) ?: [];
        $postedRecent = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total FROM {$table} WHERE {$recentWhere}",
                ...$recentParams
            ),
            ARRAY_A
        ) ?: [];

        $largestPendingWhere = $pendingWhere;
        $largestPendingParams = $pendingParams;
        $largestPending = $wpdb->get_var(
            $pendingParams !== []
                ? $wpdb->prepare("SELECT COALESCE(MAX(amount),0) FROM {$table} WHERE {$largestPendingWhere}", ...$largestPendingParams)
                : "SELECT COALESCE(MAX(amount),0) FROM {$table} WHERE {$largestPendingWhere}"
        );

        $categoryWhere = $recentWhere;
        $categoryParams = $recentParams;
        $categoryCount = (int) ($wpdb->get_var(
            $categoryParams !== []
                ? $wpdb->prepare("SELECT COUNT(DISTINCT category) FROM {$table} WHERE {$categoryWhere}", ...$categoryParams)
                : "SELECT COUNT(DISTINCT category) FROM {$table} WHERE {$categoryWhere}"
        ) ?: 0);
        $topCategory = $categoryParams !== []
            ? ($wpdb->get_row(
                $wpdb->prepare(
                    "SELECT category, COALESCE(SUM(amount),0) AS total FROM {$table} WHERE {$categoryWhere} GROUP BY category ORDER BY total DESC LIMIT 1",
                    ...$categoryParams
                ),
                ARRAY_A
            ) ?: [])
            : ($wpdb->get_row(
                "SELECT category, COALESCE(SUM(amount),0) AS total FROM {$table} WHERE {$categoryWhere} GROUP BY category ORDER BY total DESC LIMIT 1",
                ARRAY_A
            ) ?: []);

        return [
            'pending_count'          => (int) ($pending['cnt'] ?? 0),
            'pending_total'          => (int) ($pending['total'] ?? 0),
            'posted_today_count'     => (int) ($postedToday['cnt'] ?? 0),
            'posted_today_total'     => (int) ($postedToday['total'] ?? 0),
            'posted_14d_count'       => (int) ($postedRecent['cnt'] ?? 0),
            'posted_14d_total'       => (int) ($postedRecent['total'] ?? 0),
            'category_count_14d'     => $categoryCount,
            'top_category_14d'       => (string) ($topCategory['category'] ?? ''),
            'top_category_total_14d' => (int) ($topCategory['total'] ?? 0),
            'largest_pending_amount' => (int) $largestPending,
        ];
    }

    /**
     * Recently posted expenses for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $table  = $this->db->table('expenses');
        $where  = "status = 'posted' AND posted_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
        $params = [max(1, $days)];
        if ($branchId) {
            $rows = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT * FROM {$table} WHERE {$where} AND branch_id = %d ORDER BY posted_at DESC LIMIT 30",
                    ...[...$params, $branchId]
                ),
                ARRAY_A
            ) ?: [];
        } else {
            $rows = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT * FROM {$table} WHERE {$where} ORDER BY posted_at DESC LIMIT 30",
                    ...$params
                ),
                ARRAY_A
            ) ?: [];
        }
        $rows = $this->hydrateList($rows);
        foreach ($rows as &$row) {
            $posted = (string) ($row['posted_at'] ?? '');
            $row['days'] = $posted !== ''
                ? (int) $wpdb->get_var($wpdb->prepare('SELECT DATEDIFF(NOW(), %s)', $posted))
                : 0;
        }
        unset($row);

        return $rows;
    }

    public function get(int $id): array
    {
        $row = $this->db->find('expenses', $id);
        if (!$row) {
            throw new DomainException('Expense not found.');
        }
        $this->context->assertBranchAccess((int) $row['branch_id']);
        $row = $this->hydrateList([$row])[0];
        $uid   = (int) ($row['posted_by'] ?? 0);
        if ($uid) {
            $user = get_userdata($uid);
            $row['poster_name'] = $user ? $user->display_name : ('User #' . $uid);
        } else {
            $row['poster_name'] = '';
        }

        return $row;
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array<string, mixed>>
     */
    private function hydrateList(array $rows): array
    {
        global $wpdb;
        $names = [];
        foreach ($wpdb->get_results('SELECT id, name FROM ' . $this->db->table('branches'), ARRAY_A) ?: [] as $branch) {
            $names[(int) $branch['id']] = (string) $branch['name'];
        }
        foreach ($rows as &$row) {
            $bid = (int) ($row['branch_id'] ?? 0);
            $row['branch_name'] = $bid ? ($names[$bid] ?? '') : '';
        }
        unset($row);

        return $rows;
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function insert(array $data, int $branchId, Money $amount, string $category, string $status): array
    {
        $id = $this->db->insert('expenses', [
            'branch_id'   => $branchId,
            'category'    => $category,
            'amount'      => $amount->minor(),
            'description' => sanitize_textarea_field((string) ($data['description'] ?? '')),
            'vendor'      => sanitize_text_field((string) ($data['vendor'] ?? '')),
            'status'      => $status,
            'approval_id' => !empty($data['approval_id']) ? (int) $data['approval_id'] : null,
            'posted_by'   => $this->context->userId(),
            'posted_at'   => $status === 'posted' ? $this->db->now() : null,
            'created_at'  => $this->db->now(),
            'updated_at'  => $this->db->now(),
        ]);

        return $this->db->find('expenses', $id) ?: [];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function post(?int $existingId, array $data, int $branchId, Money $amount, string $category): array
    {
        if ($existingId) {
            $this->db->update('expenses', [
                'status'     => 'posted',
                'posted_at'  => $this->db->now(),
                'posted_by'  => $this->context->userId(),
                'updated_at' => $this->db->now(),
            ], ['id' => $existingId]);
            $row = $this->db->find('expenses', $existingId);
        } else {
            $row = $this->insert($data, $branchId, $amount, $category, 'posted');
        }
        $this->audit->log('expense.posted', 'expense', (int) $row['id'], null, $row, $branchId);
        $this->ledger->post(
            'branch',
            $branchId,
            'debit',
            $amount,
            'expense',
            (int) $row['id'],
            'Expense ' . $category,
            $branchId
        );

        return $row ?: [];
    }
}
