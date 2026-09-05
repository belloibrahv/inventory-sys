<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\AuditDiff;
use Atoms\Domain\AuditLabel;
use Atoms\Domain\AuditLink;
use Atoms\Domain\CsvExporter;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class AuditLogger
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly AuditLabel $labels = new AuditLabel(),
        private readonly AuditDiff $diff = new AuditDiff(),
        private readonly AuditLink $links = new AuditLink()
    ) {
    }

    public function log(
        string $action,
        string $entityType,
        ?int $entityId = null,
        mixed $old = null,
        mixed $new = null,
        ?int $branchId = null
    ): void {
        $this->db->insert('audit_logs', [
            'user_id'     => $this->context->userId() ?: null,
            'action'      => $action,
            'entity_type' => $entityType,
            'entity_id'   => $entityId,
            'old_value'   => $old === null ? null : wp_json_encode($old),
            'new_value'   => $new === null ? null : wp_json_encode($new),
            'ip_address'  => $this->context->ip(),
            'branch_id'   => $branchId,
            'created_at'  => $this->db->now(),
        ]);
    }

    /**
     * @param array<string, mixed> $args
     * @return array{items: list<array<string, mixed>>, total: int, page: int, per_page: int}
     */
    public function search(array $args): array
    {
        global $wpdb;
        $table = $this->db->table('audit_logs');
        [$where, $params] = $this->filters($args);

        $sqlWhere = implode(' AND ', $where);
        $countSql = "SELECT COUNT(*) FROM {$table} WHERE {$sqlWhere}";
        $total    = (int) ($params ? $wpdb->get_var($wpdb->prepare($countSql, ...$params)) : $wpdb->get_var($countSql));

        $page = max(1, (int) ($args['page'] ?? 1));
        $per  = min(5000, max(10, (int) ($args['per_page'] ?? 25)));
        $off  = ($page - 1) * $per;
        $sql  = "SELECT * FROM {$table} WHERE {$sqlWhere} ORDER BY id DESC LIMIT %d OFFSET %d";
        $params[] = $per;
        $params[] = $off;
        $items = $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];

        return [
            'items'    => $this->hydrate($items),
            'total'    => $total,
            'page'     => $page,
            'per_page' => $per,
        ];
    }

    /**
     * Recent audit events for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentLines(?int $branchId = null, int $days = 14, int $limit = 30): array
    {
        global $wpdb;
        $table  = $this->db->table('audit_logs');
        $where  = ['created_at >= DATE_SUB(NOW(), INTERVAL %d DAY)'];
        $params = [max(1, $days)];

        if (!current_user_can('atoms_all_branches')) {
            $ids = $this->context->branchIds();
            if ($ids === []) {
                return [];
            }
            $in = implode(',', array_map('intval', $ids)) ?: '0';
            $where[] = "(branch_id IN ({$in}) OR branch_id IS NULL)";
        }

        if ($branchId) {
            $this->context->assertBranchAccess($branchId);
            $where[]  = 'branch_id = %d';
            $params[] = $branchId;
        }

        $sql = 'SELECT * FROM ' . $table . ' WHERE ' . implode(' AND ', $where)
            . ' ORDER BY id DESC LIMIT %d';
        $params[] = min(50, max(1, $limit));
        $items = $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];

        return $this->hydrate($items);
    }

    /**
     * @param array<string, mixed> $args
     * @return array{csv: string, filename: string}
     */
    public function export(array $args): array
    {
        $args['page'] = 1;
        $args['per_page'] = 5000;
        $pack = $this->search($args);
        $csv  = new CsvExporter();

        return [
            'filename' => 'atoms-audit-' . $this->db->today() . '.csv',
            'csv'      => $csv->toString(
                ['When', 'Action', 'Entity', 'ID', 'User', 'Branch', 'Summary', 'IP'],
                array_map(static fn($row) => [
                    $row['created_at'],
                    $row['action_label'],
                    $row['entity_type'],
                    $row['entity_id'] ?? '',
                    $row['user_name'],
                    $row['branch_name'],
                    $row['summary'],
                    $row['ip_address'] ?? '',
                ], $pack['items'])
            ),
        ];
    }

    /**
     * @param array<string, mixed> $args
     * @return array{0: list<string>, 1: list<mixed>}
     */
    private function filters(array $args): array
    {
        global $wpdb;
        $where  = ['1=1'];
        $params = [];

        if (!current_user_can('atoms_all_branches')) {
            $ids = $this->context->branchIds();
            if ($ids === []) {
                $where[] = '0=1';
            } else {
                $in = implode(',', array_map('intval', $ids)) ?: '0';
                $where[] = "(branch_id IN ({$in}) OR branch_id IS NULL)";
            }
        }

        if (!empty($args['action'])) {
            $where[]  = 'action = %s';
            $params[] = sanitize_text_field((string) $args['action']);
        }
        if (!empty($args['entity_type'])) {
            $where[]  = 'entity_type = %s';
            $params[] = sanitize_key((string) $args['entity_type']);
        }
        if (!empty($args['user_id'])) {
            $where[]  = 'user_id = %d';
            $params[] = (int) $args['user_id'];
        }
        if (!empty($args['branch_id'])) {
            $bid = (int) $args['branch_id'];
            $this->context->assertBranchAccess($bid);
            $where[]  = 'branch_id = %d';
            $params[] = $bid;
        }
        if (!empty($args['from'])) {
            $where[]  = 'created_at >= %s';
            $params[] = sanitize_text_field((string) $args['from']) . ' 00:00:00';
        }
        if (!empty($args['to'])) {
            $where[]  = 'created_at <= %s';
            $params[] = sanitize_text_field((string) $args['to']) . ' 23:59:59';
        }
        if (!empty($args['q'])) {
            $where[]  = '(action LIKE %s OR entity_type LIKE %s OR old_value LIKE %s OR new_value LIKE %s OR CAST(entity_id AS CHAR) LIKE %s)';
            $like     = '%' . $wpdb->esc_like((string) $args['q']) . '%';
            array_push($params, $like, $like, $like, $like, $like);
        }

        return [$where, $params];
    }

    /**
     * @param list<array<string, mixed>> $items
     * @return list<array<string, mixed>>
     */
    private function hydrate(array $items): array
    {
        global $wpdb;
        $names = [];
        foreach ($wpdb->get_results('SELECT id, name FROM ' . $this->db->table('branches'), ARRAY_A) ?: [] as $row) {
            $names[(int) $row['id']] = (string) $row['name'];
        }

        $users = [];
        foreach ($items as &$row) {
            $uid = (int) ($row['user_id'] ?? 0);
            if ($uid && !isset($users[$uid])) {
                $user = get_userdata($uid);
                $users[$uid] = $user ? $user->display_name : ('User #' . $uid);
            }
            $bid = (int) ($row['branch_id'] ?? 0);
            $old = $this->diff->decode($row['old_value'] ?? null);
            $new = $this->diff->decode($row['new_value'] ?? null);
            $row['user_name']     = $uid ? ($users[$uid] ?? '') : 'System';
            $row['branch_name']   = $bid ? ($names[$bid] ?? '') : '';
            $row['action_label']  = $this->labels->of((string) $row['action']);
            $row['summary']       = $this->diff->summarize($old, $new);
            $row['old']           = is_array($old) ? $old : null;
            $row['new']           = is_array($new) ? $new : null;
            $row['link']          = $this->links->for($row);
        }
        unset($row);

        return $items;
    }
}
