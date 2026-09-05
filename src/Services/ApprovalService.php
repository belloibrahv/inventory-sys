<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\ApprovalBrief;
use Atoms\Domain\ApprovalGate;
use Atoms\Domain\DomainException;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class ApprovalService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly AuditLogger $audit = new AuditLogger()
    ) {
    }

    /**
     * @param array<string, mixed> $payload
     */
    public function request(string $type, array $payload, ?int $branchId = null): int
    {
        $id = $this->db->insert('approvals', [
            'type'         => $type,
            'payload'      => wp_json_encode($payload),
            'status'       => 'pending',
            'requested_by' => $this->context->userId(),
            'branch_id'    => $branchId,
            'created_at'   => $this->db->now(),
        ]);
        $this->audit->log('approval.requested', 'approval', $id, null, ['type' => $type], $branchId);
        $this->notify($type, $payload, $id, $branchId);

        return $id;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function pending(): array
    {
        global $wpdb;
        $sql    = 'SELECT * FROM ' . $this->db->table('approvals') . " WHERE status = 'pending'";
        $params = [];
        if (!current_user_can('atoms_all_branches')) {
            $ids = $this->context->branchIds();
            if ($ids === []) {
                return [];
            }
            $placeholders = implode(',', array_fill(0, count($ids), '%d'));
            $sql         .= " AND (branch_id IS NULL OR branch_id IN ({$placeholders}))";
            $params       = $ids;
        }
        $sql .= ' ORDER BY id DESC LIMIT 100';
        $rows = $params !== []
            ? $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A)
            : $wpdb->get_results($sql, ARRAY_A);
        $rows = $rows ?: [];

        $gate       = new ApprovalGate();
        $canApprove = current_user_can('atoms_approve');
        $canAdjust  = current_user_can('atoms_approve_adjustments');
        $visible    = [];
        foreach ($rows as $row) {
            if ($gate->canReview((string) $row['type'], $canApprove, $canAdjust)) {
                $visible[] = $row;
            }
        }

        return $this->hydrate($visible);
    }

    public function get(int $id): array
    {
        if (!current_user_can('atoms_approve') && !current_user_can('atoms_approve_adjustments')) {
            throw new DomainException('You cannot view approvals.');
        }
        $row = $this->db->find('approvals', $id);
        if (!$row) {
            throw new DomainException('Approval not found.');
        }
        if (!empty($row['branch_id'])) {
            $this->context->assertBranchAccess((int) $row['branch_id']);
        }
        if (($row['status'] ?? '') === 'pending') {
            $gate = new ApprovalGate();
            if (!$gate->canReview(
                (string) $row['type'],
                current_user_can('atoms_approve'),
                current_user_can('atoms_approve_adjustments')
            )) {
                throw new DomainException('You cannot view this kind of request.');
            }
        }

        return $this->hydrate([$row])[0];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function pendingLines(?int $branchId = null): array
    {
        if (!current_user_can('atoms_approve') && !current_user_can('atoms_approve_adjustments')) {
            return [];
        }
        $rows = $this->pending();
        if ($branchId) {
            $rows = array_values(array_filter(
                $rows,
                static fn(array $row): bool => empty($row['branch_id']) || (int) $row['branch_id'] === $branchId
            ));
        }

        return array_slice($rows, 0, 30);
    }

    /**
     * Recently reviewed approvals for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $table  = $this->db->table('approvals');
        $where  = "status IN ('approved','rejected') AND reviewed_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
        $params = [max(1, $days)];
        if ($branchId) {
            $where   .= ' AND branch_id = %d';
            $params[] = $branchId;
        }
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE {$where} ORDER BY reviewed_at DESC LIMIT 30",
                ...$params
            ),
            ARRAY_A
        ) ?: [];
        $rows = $this->hydrate($rows);
        foreach ($rows as &$row) {
            $reviewer = (int) ($row['reviewed_by'] ?? 0);
            if ($reviewer) {
                $user = get_userdata($reviewer);
                $row['reviewer_name'] = $user ? $user->display_name : ('User #' . $reviewer);
            } else {
                $row['reviewer_name'] = '';
            }
            $reviewed = (string) ($row['reviewed_at'] ?? '');
            $row['days'] = $reviewed !== ''
                ? (int) $wpdb->get_var($wpdb->prepare('SELECT DATEDIFF(NOW(), %s)', $reviewed))
                : 0;
        }
        unset($row);

        return $rows;
    }

    public function decide(int $id, string $decision, string $notes = ''): array
    {
        if (!current_user_can('atoms_approve') && !current_user_can('atoms_approve_adjustments')) {
            throw new DomainException('You cannot review approvals.');
        }
        $row = $this->db->find('approvals', $id);
        if (!$row || $row['status'] !== 'pending') {
            throw new DomainException('Approval is not pending.');
        }
        if (!empty($row['branch_id'])) {
            $this->context->assertBranchAccess((int) $row['branch_id']);
        }
        $gate = new ApprovalGate();
        if (!$gate->canReview(
            (string) $row['type'],
            current_user_can('atoms_approve'),
            current_user_can('atoms_approve_adjustments')
        )) {
            throw new DomainException('You cannot review this kind of request.');
        }
        $status = $decision === 'approve' ? 'approved' : 'rejected';
        $this->db->update('approvals', [
            'status'       => $status,
            'reviewed_by'  => $this->context->userId(),
            'review_notes' => sanitize_textarea_field($notes),
            'reviewed_at'  => $this->db->now(),
        ], ['id' => $id]);

        $payload = json_decode((string) $row['payload'], true) ?: [];
        $result  = ['approval' => $this->db->find('approvals', $id)];

        if ($status === 'approved') {
            $result = array_merge($result, $this->execute((string) $row['type'], $payload, $id));
        } else {
            $this->reject((string) $row['type'], $payload, $id, $row['branch_id'] ? (int) $row['branch_id'] : null);
        }

        $this->audit->log('approval.' . $status, 'approval', $id, $row, $result['approval'], $row['branch_id'] ? (int) $row['branch_id'] : null);

        return $result;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function execute(string $type, array $payload, int $approvalId): array
    {
        return match ($type) {
            'price_override'   => $this->executeSale($payload, $approvalId),
            'expense'          => ['expense' => (new ExpenseService())->postApproved($payload)],
            'stock_adjustment' => ['stock_count' => (new StockCountService())->postApproved($payload)],
            'price_bulk'       => ['pricing' => (new PricingService())->applyApprovedBulk($payload)],
            default            => throw new DomainException('Unknown approval type: ' . $type),
        };
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function executeSale(array $payload, int $approvalId): array
    {
        $payload['approval_id'] = $approvalId;
        return ['sale' => (new SaleService())->create($payload)];
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function reject(string $type, array $payload, int $approvalId, ?int $branchId): void
    {
        if ($type === 'price_override') {
            $imeis = new ImeiService();
            foreach ($payload['items'] ?? [] as $item) {
                $imei = $imeis->getByImei((string) $item['imei']);
                if (($imei['status'] ?? '') === 'reserved') {
                    $imeis->applyEvent((int) $imei['id'], 'release_reserve', 'approval', $approvalId, $branchId, 'Price override rejected');
                }
            }
        }
        if ($type === 'expense' && !empty($payload['expense_id'])) {
            (new Db())->update('expenses', [
                'status'     => 'rejected',
                'updated_at' => current_time('mysql'),
            ], ['id' => (int) $payload['expense_id']]);
        }
        if ($type === 'stock_adjustment' && !empty($payload['count_id'])) {
            (new StockCountService())->reject((int) $payload['count_id']);
        }
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array<string, mixed>>
     */
    private function hydrate(array $rows): array
    {
        global $wpdb;
        $names = [];
        foreach ($wpdb->get_results('SELECT id, name FROM ' . $this->db->table('branches'), ARRAY_A) ?: [] as $branch) {
            $names[(int) $branch['id']] = (string) $branch['name'];
        }

        $brief = new ApprovalBrief();
        $users = [];
        foreach ($rows as &$row) {
            $payload = json_decode((string) ($row['payload'] ?? ''), true);
            $payload = is_array($payload) ? $payload : [];
            $uid     = (int) ($row['requested_by'] ?? 0);
            if ($uid && !isset($users[$uid])) {
                $user = get_userdata($uid);
                $users[$uid] = $user ? $user->display_name : ('User #' . $uid);
            }
            $bid  = (int) ($row['branch_id'] ?? 0);
            $type = (string) $row['type'];
            $row['payload']        = $payload;
            $row['type_label']     = $brief->label($type);
            $row['summary']        = $brief->summary($type, $payload);
            $row['requester_name'] = $uid ? ($users[$uid] ?? '') : '';
            $row['branch_name']    = $bid ? ($names[$bid] ?? '') : '';
        }
        unset($row);

        return $rows;
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function notify(string $type, array $payload, int $id, ?int $branchId): void
    {
        $brief   = new ApprovalBrief();
        $summary = $brief->summary($type, $payload);
        (new NotifyService())->push(
            'approval_request',
            'Approval needed: ' . $brief->label($type),
            $summary !== '' ? $summary : 'A request is waiting for review.',
            ['branch_id' => $branchId, 'reference_type' => 'approval', 'reference_id' => $id]
        );
    }
}
