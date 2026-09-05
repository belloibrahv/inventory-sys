<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\WhatsAppLink;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class NotifyService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly SettingsService $settings = new SettingsService(),
        private readonly WhatsAppLink $whatsapp = new WhatsAppLink(),
        private readonly AuditLogger $audit = new AuditLogger()
    ) {
    }

    /**
     * @param array<string, mixed> $meta
     */
    public function push(string $type, string $title, string $body, array $meta = []): int
    {
        $branchId = isset($meta['branch_id']) ? (int) $meta['branch_id'] : null;
        $id = $this->db->insert('notifications', [
            'user_id'        => isset($meta['user_id']) ? (int) $meta['user_id'] : null,
            'branch_id'      => $branchId,
            'type'           => $type,
            'title'          => $title,
            'body'           => $body,
            'is_read'        => 0,
            'reference_type' => $meta['reference_type'] ?? null,
            'reference_id'   => isset($meta['reference_id']) ? (int) $meta['reference_id'] : null,
            'created_at'     => $this->db->now(),
        ]);

        $ops = $this->settings->get();
        $phone = (string) ($meta['phone'] ?? $ops['whatsapp_phone'] ?? '');
        if ($phone !== '') {
            try {
                $url = $this->whatsapp->chatUrl($phone, $title . "\n" . $body);
            } catch (\Throwable) {
                $url = '';
            }
            $this->db->insert('outbox', [
                'channel'     => 'whatsapp',
                'destination' => $this->whatsapp->digits($phone),
                'title'       => $title,
                'body'        => $body,
                'payload'     => wp_json_encode(['url' => $url, 'type' => $type, 'enabled' => !empty($ops['whatsapp_enabled'])]),
                'status'      => empty($ops['whatsapp_token']) || empty($ops['whatsapp_enabled']) ? 'link' : 'queued',
                'created_at'  => $this->db->now(),
            ]);
        }

        return $id;
    }

    /**
     * @return array{items: list<array<string, mixed>>, unread: int}
     */
    public function inbox(?int $userId = null, int $limit = 40): array
    {
        global $wpdb;
        $table = $this->db->table('notifications');
        $uid   = $userId ?: $this->context->userId();
        $items = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE user_id IS NULL OR user_id = %d ORDER BY id DESC LIMIT %d",
                $uid,
                $limit
            ),
            ARRAY_A
        ) ?: [];
        $unread = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE is_read = 0 AND (user_id IS NULL OR user_id = %d)",
                $uid
            )
        );

        return ['items' => $this->hydrateInbox($items), 'unread' => $unread];
    }

    /**
     * Recent alerts for the branch dashboard.
     *
     * @return list<array<string, mixed>>
     */
    public function alertLines(?int $branchId = null, int $limit = 10): array
    {
        global $wpdb;
        $table  = $this->db->table('notifications');
        $uid    = $this->context->userId();
        $where  = '(user_id IS NULL OR user_id = %d)';
        $params = [$uid];
        if ($branchId) {
            $where   .= ' AND (branch_id IS NULL OR branch_id = %d)';
            $params[] = $branchId;
        }
        $params[] = max(1, $limit);
        $items = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE {$where} ORDER BY is_read ASC, id DESC LIMIT %d",
                ...$params
            ),
            ARRAY_A
        ) ?: [];

        return $this->hydrateInbox($items);
    }

    /**
     * Recent notifications for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentLines(?int $branchId = null, int $days = 14, int $limit = 30): array
    {
        global $wpdb;
        $table  = $this->db->table('notifications');
        $uid    = $this->context->userId();
        $where  = '(user_id IS NULL OR user_id = %d) AND created_at >= DATE_SUB(NOW(), INTERVAL %d DAY)';
        $params = [$uid, max(1, $days)];
        if ($branchId) {
            $where   .= ' AND (branch_id IS NULL OR branch_id = %d)';
            $params[] = $branchId;
        }
        $params[] = max(1, $limit);
        $items = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE {$where} ORDER BY is_read ASC, id DESC LIMIT %d",
                ...$params
            ),
            ARRAY_A
        ) ?: [];

        return $this->hydrateInbox($items);
    }

    public function unreadCount(?int $branchId = null): int
    {
        global $wpdb;
        $table  = $this->db->table('notifications');
        $uid    = $this->context->userId();
        $where  = 'is_read = 0 AND (user_id IS NULL OR user_id = %d)';
        $params = [$uid];
        if ($branchId) {
            $where   .= ' AND (branch_id IS NULL OR branch_id = %d)';
            $params[] = $branchId;
        }

        return (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where}", ...$params));
    }

    /**
     * @param list<array<string, mixed>> $items
     * @return list<array<string, mixed>>
     */
    private function hydrateInbox(array $items): array
    {
        global $wpdb;
        foreach ($items as &$row) {
            $row['link'] = $this->linkFor($row, $wpdb);
        }
        unset($row);

        return $items;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function linkFor(array $row, $wpdb): ?array
    {
        $type = (string) ($row['reference_type'] ?? '');
        $id   = (int) ($row['reference_id'] ?? 0);
        if ($type === '' || $id <= 0) {
            return null;
        }

        return match ($type) {
            'sale' => $this->saleLink($id, $wpdb),
            'approval'  => ['screen' => 'approvals', 'id' => $id],
            'return'    => ['screen' => 'returns', 'id' => $id],
            'transfer'  => ['screen' => 'transfers', 'id' => $id],
            'repair'    => ['screen' => 'repairs', 'id' => $id],
            'product'   => ['screen' => 'product', 'id' => $id],
            default     => null,
        };
    }

    /**
     * @return array<string, mixed>|null
     */
    private function saleLink(int $saleId, $wpdb): ?array
    {
        $sale = $wpdb->get_row(
            $wpdb->prepare(
                'SELECT id, customer_id, invoice_number FROM ' . $this->db->table('sales') . ' WHERE id = %d',
                $saleId
            ),
            ARRAY_A
        );
        if (!$sale || empty($sale['customer_id'])) {
            return !empty($sale['invoice_number'])
                ? ['screen' => 'invoice', 'invoice' => (string) $sale['invoice_number']]
                : null;
        }

        return [
            'screen'  => 'customer',
            'id'      => (int) $sale['customer_id'],
            'invoice' => (string) ($sale['invoice_number'] ?? ''),
        ];
    }

    public function markRead(int $id): void
    {
        $this->db->update('notifications', ['is_read' => 1], ['id' => $id]);
    }

    /**
     * Staff opened the wa.me chat (or the provider accepted it). The row is closed, not deleted.
     *
     * @return array<string, mixed>
     */
    public function markSent(int $id): array
    {
        $row = $this->db->find('outbox', $id);
        if (!$row) {
            throw new DomainException('Outbox row not found.');
        }
        if (($row['status'] ?? '') === 'sent') {
            return $row;
        }
        $this->db->update('outbox', [
            'status'  => 'sent',
            'sent_at' => $this->db->now(),
        ], ['id' => $id]);
        $this->audit->log('outbox.sent', 'outbox', $id, ['status' => $row['status']], ['status' => 'sent']);

        return $this->db->find('outbox', $id) ?: $row;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function outbox(int $limit = 20): array
    {
        global $wpdb;
        return $wpdb->get_results(
            'SELECT * FROM ' . $this->db->table('outbox') . ' ORDER BY id DESC LIMIT ' . (int) $limit,
            ARRAY_A
        ) ?: [];
    }

    public function scanLowStock(): int
    {
        $ops = $this->settings->get();
        if (empty($ops['low_stock_notify'])) {
            return 0;
        }
        $rows = (new ProductService())->lowStockAlerts(null);
        $sent = 0;
        foreach ($rows as $row) {
            $productId = (int) $row['product_id'];
            if ($this->recentlyNotified('low_stock', 'product', $productId, 24)) {
                continue;
            }
            $label = trim((string) ($row['variant_label'] ?? ''));
            $name  = (string) $row['name'];
            if ($label !== '') {
                $name .= ' · ' . $label;
            }
            $branch = trim((string) ($row['branch_name'] ?? ''));
            $where  = $branch !== '' ? ' at ' . $branch : '';
            $kind   = ($row['track_mode'] ?? '') === 'quantity' ? 'Accessory' : 'Device';
            $this->push(
                'low_stock',
                'Low stock: ' . $name,
                sprintf(
                    '%s (%s) has %d on hand%s (threshold %d).',
                    $name,
                    $kind,
                    (int) $row['qty'],
                    $where,
                    (int) $row['low_stock_threshold']
                ),
                ['reference_type' => 'product', 'reference_id' => $productId, 'branch_id' => (int) ($row['branch_id'] ?? 0) ?: null]
            );
            $sent++;
        }

        return $sent;
    }

    public function recentlyNotified(string $type, string $referenceType, int $referenceId, int $hours = 24): bool
    {
        global $wpdb;
        $from = (new \DateTimeImmutable($this->db->now()))->modify('-' . max(0, $hours) . ' hours')->format('Y-m-d H:i:s');

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                'SELECT COUNT(*) FROM ' . $this->db->table('notifications') . '
                 WHERE type = %s AND reference_type = %s AND reference_id = %d AND created_at >= %s',
                $type,
                $referenceType,
                $referenceId,
                $from
            )
        ) > 0;
    }

    public function notifiedToday(string $type, string $referenceType, int $referenceId): bool
    {
        global $wpdb;
        $start = $this->db->today() . ' 00:00:00';
        $end   = $this->db->today() . ' 23:59:59';

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                'SELECT COUNT(*) FROM ' . $this->db->table('notifications') . '
                 WHERE type = %s AND reference_type = %s AND reference_id = %d AND created_at >= %s AND created_at <= %s',
                $type,
                $referenceType,
                $referenceId,
                $start,
                $end
            )
        ) > 0;
    }

    public function scanOverdueDebts(int $days = 7): int
    {
        global $wpdb;
        $sales = $this->db->table('sales');
        $cust  = $this->db->table('customers');
        $notif = $this->db->table('notifications');
        $from  = (new \DateTimeImmutable($this->db->now()))->modify('-24 hours')->format('Y-m-d H:i:s');
        $rows  = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.id AS sale_id, c.id AS customer_id, c.name, c.phone, s.invoice_number, s.due_amount, s.posted_at, s.branch_id
                 FROM {$sales} s
                 INNER JOIN {$cust} c ON c.id = s.customer_id
                 WHERE s.status = 'completed' AND s.due_amount > 0
                   AND TIMESTAMPDIFF(DAY, s.posted_at, %s) >= %d
                   AND NOT EXISTS (
                     SELECT 1 FROM {$notif} n
                     WHERE n.type = 'outstanding_debt' AND n.reference_type = 'sale' AND n.reference_id = s.id
                       AND n.created_at >= %s
                   )
                 ORDER BY s.posted_at ASC
                 LIMIT 50",
                $this->db->now(),
                max(0, $days),
                $from
            ),
            ARRAY_A
        ) ?: [];
        $sent = 0;
        foreach ($rows as $row) {
            if ($this->recentlyNotified('outstanding_debt', 'sale', (int) $row['sale_id'], 24)) {
                continue;
            }
            $this->push(
                'outstanding_debt',
                'Outstanding debt: ' . $row['name'],
                sprintf('%s still owes on %s.', $row['name'], $row['invoice_number']),
                [
                    'phone'          => (string) $row['phone'],
                    'branch_id'      => (int) $row['branch_id'],
                    'reference_type' => 'sale',
                    'reference_id'   => (int) $row['sale_id'],
                ]
            );
            $sent++;
        }

        return $sent;
    }

    public function scanPendingApprovals(int $hours = 2): int
    {
        global $wpdb;
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                'SELECT id, type, branch_id, created_at FROM ' . $this->db->table('approvals') . "
                 WHERE status = 'pending' AND TIMESTAMPDIFF(HOUR, created_at, %s) >= %d
                 ORDER BY id ASC LIMIT 50",
                $this->db->now(),
                max(0, $hours)
            ),
            ARRAY_A
        ) ?: [];
        $sent = 0;
        foreach ($rows as $row) {
            if ($this->recentlyNotified('approval_reminder', 'approval', (int) $row['id'], 12)) {
                continue;
            }
            $this->push(
                'approval_reminder',
                'Approval still waiting',
                sprintf('%s request #%d has not been reviewed.', str_replace('_', ' ', (string) $row['type']), (int) $row['id']),
                [
                    'branch_id'      => $row['branch_id'] ? (int) $row['branch_id'] : null,
                    'reference_type' => 'approval',
                    'reference_id'   => (int) $row['id'],
                ]
            );
            $sent++;
        }

        return $sent;
    }

    public function scanStuckTransfers(int $hours = 24): int
    {
        global $wpdb;
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                'SELECT id, status, from_branch_id, to_branch_id, requested_at, dispatched_at FROM ' . $this->db->table('transfers') . "
                 WHERE status IN ('requested','approved','dispatched')
                   AND TIMESTAMPDIFF(HOUR, COALESCE(dispatched_at, requested_at), %s) >= %d
                 ORDER BY id ASC LIMIT 50",
                $this->db->now(),
                max(0, $hours)
            ),
            ARRAY_A
        ) ?: [];
        $sent = 0;
        foreach ($rows as $row) {
            if ($this->recentlyNotified('transfer_stuck', 'transfer', (int) $row['id'], 12)) {
                continue;
            }
            $this->push(
                'transfer_stuck',
                'Transfer still open',
                sprintf('Transfer #%d is %s and has not moved.', (int) $row['id'], (string) $row['status']),
                [
                    'branch_id'      => (int) $row['to_branch_id'],
                    'reference_type' => 'transfer',
                    'reference_id'   => (int) $row['id'],
                ]
            );
            $sent++;
        }

        return $sent;
    }

    public function scanStuckRepairs(int $days = 3): int
    {
        global $wpdb;
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                'SELECT id, ticket_number, status, branch_id, received_at FROM ' . $this->db->table('repairs') . "
                 WHERE status NOT IN ('completed','returned')
                   AND TIMESTAMPDIFF(DAY, received_at, %s) >= %d
                 ORDER BY id ASC LIMIT 50",
                $this->db->now(),
                max(0, $days)
            ),
            ARRAY_A
        ) ?: [];
        $sent = 0;
        foreach ($rows as $row) {
            if ($this->recentlyNotified('repair_stuck', 'repair', (int) $row['id'], 24)) {
                continue;
            }
            $this->push(
                'repair_stuck',
                'Repair still open: ' . $row['ticket_number'],
                sprintf('Ticket %s is %s and has not been closed.', $row['ticket_number'], $row['status']),
                [
                    'branch_id'      => (int) $row['branch_id'],
                    'reference_type' => 'repair',
                    'reference_id'   => (int) $row['id'],
                ]
            );
            $sent++;
        }

        return $sent;
    }

    public function scanReturnEscalation(int $days = 2): int
    {
        global $wpdb;
        $imeis   = $this->db->table('imeis');
        $repairs = $this->db->table('repairs');
        $rows    = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT i.id, i.imei, i.branch_id, i.updated_at
                 FROM {$imeis} i
                 LEFT JOIN {$repairs} r ON r.imei_id = i.id AND r.status NOT IN ('completed','returned')
                 WHERE i.status = 'faulty' AND r.id IS NULL
                   AND TIMESTAMPDIFF(DAY, i.updated_at, %s) >= %d
                 ORDER BY i.id ASC LIMIT 50",
                $this->db->now(),
                max(0, $days)
            ),
            ARRAY_A
        ) ?: [];
        $sent = 0;
        foreach ($rows as $row) {
            if ($this->recentlyNotified('return_escalation', 'imei', (int) $row['id'], 24)) {
                continue;
            }
            $this->push(
                'return_escalation',
                'Faulty device waiting: ' . $row['imei'],
                'This IMEI is still faulty and has no open repair ticket.',
                [
                    'branch_id'      => (int) $row['branch_id'],
                    'reference_type' => 'imei',
                    'reference_id'   => (int) $row['id'],
                ]
            );
            $sent++;
        }

        return $sent;
    }
}
