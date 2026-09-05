<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\VariantLabel;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class TransferService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly AuditLogger $audit = new AuditLogger(),
        private readonly ImeiService $imeis = new ImeiService()
    ) {
    }

    /**
     * @param array<string, mixed> $data
     */
    public function request(array $data): array
    {
        $from = (int) $data['from_branch_id'];
        $to   = (int) $data['to_branch_id'];
        if ($from === $to) {
            throw new DomainException('Transfer must be between two different branches.');
        }
        $this->context->assertBranchAccess($from);
        $imeis = $data['imeis'] ?? [];
        if ($imeis === []) {
            throw new DomainException('Select at least one IMEI to transfer.');
        }

        return $this->db->transaction(function () use ($data, $from, $to, $imeis) {
            $id = $this->db->insert('transfers', [
                'from_branch_id' => $from,
                'to_branch_id'   => $to,
                'status'         => 'requested',
                'notes'          => sanitize_textarea_field((string) ($data['notes'] ?? '')),
                'requested_by'   => $this->context->userId(),
                'requested_at'   => $this->db->now(),
                'created_at'     => $this->db->now(),
                'updated_at'     => $this->db->now(),
            ]);

            foreach ($imeis as $raw) {
                $imei = $this->imeis->getByImei((string) $raw);
                $this->imeis->assertSellable($imei, $from);
                $this->db->insert('transfer_items', [
                    'transfer_id' => $id,
                    'imei_id'     => (int) $imei['id'],
                    'product_id'  => (int) $imei['product_id'],
                ]);
            }

            $this->audit->log('transfer.requested', 'transfer', $id, null, $data, $from);
            (new NotifyService())->push(
                'transfer_request',
                'Stock transfer requested',
                sprintf('Transfer #%d from branch %d to branch %d.', $id, $from, $to),
                ['branch_id' => $to, 'reference_type' => 'transfer', 'reference_id' => $id]
            );

            return $this->get($id);
        });
    }

    public function approve(int $id): array
    {
        $transfer = $this->requireStatus($id, 'requested');
        if (!current_user_can('atoms_approve') && !current_user_can('atoms_manage_transfers')) {
            throw new DomainException('You cannot approve transfers.');
        }
        $this->db->update('transfers', [
            'status'      => 'approved',
            'approved_by' => $this->context->userId(),
            'approved_at' => $this->db->now(),
            'updated_at'  => $this->db->now(),
        ], ['id' => $id]);
        $this->audit->log('transfer.approved', 'transfer', $id, ['status' => 'requested'], ['status' => 'approved'], (int) $transfer['from_branch_id']);

        return $this->get($id);
    }

    public function dispatch(int $id): array
    {
        $transfer = $this->requireStatus($id, 'approved');
        $this->context->assertBranchAccess((int) $transfer['from_branch_id']);

        return $this->db->transaction(function () use ($transfer, $id) {
            foreach ($transfer['items'] as $item) {
                $this->imeis->applyEvent((int) $item['imei_id'], 'transfer_dispatch', 'transfer', $id, (int) $transfer['to_branch_id'], 'Dispatched');
            }
            $this->db->update('transfers', [
                'status'        => 'dispatched',
                'dispatched_by' => $this->context->userId(),
                'dispatched_at' => $this->db->now(),
                'updated_at'    => $this->db->now(),
            ], ['id' => $id]);
            $this->audit->log('transfer.dispatched', 'transfer', $id, null, null, (int) $transfer['from_branch_id']);
            $fromName = (new BranchService())->get((int) $transfer['from_branch_id'])['name'] ?? ('#' . $transfer['from_branch_id']);
            $toName   = (new BranchService())->get((int) $transfer['to_branch_id'])['name'] ?? ('#' . $transfer['to_branch_id']);
            (new NotifyService())->push(
                'transfer_request',
                'Stock is in transit',
                sprintf('Transfer #%d has left %s for %s.', $id, $fromName, $toName),
                ['branch_id' => (int) $transfer['to_branch_id'], 'reference_type' => 'transfer', 'reference_id' => $id]
            );

            return $this->get($id);
        });
    }

    public function receive(int $id): array
    {
        $transfer = $this->requireStatus($id, 'dispatched');
        $this->context->assertBranchAccess((int) $transfer['to_branch_id']);

        return $this->db->transaction(function () use ($transfer, $id) {
            foreach ($transfer['items'] as $item) {
                $this->imeis->applyEvent((int) $item['imei_id'], 'transfer_receive', 'transfer', $id, (int) $transfer['to_branch_id'], 'Received');
            }
            $this->db->update('transfers', [
                'status'      => 'received',
                'received_by' => $this->context->userId(),
                'received_at' => $this->db->now(),
                'updated_at'  => $this->db->now(),
            ], ['id' => $id]);
            $this->audit->log('transfer.received', 'transfer', $id, null, null, (int) $transfer['to_branch_id']);

            return $this->get($id);
        });
    }

    public function get(int $id): array
    {
        $row = $this->db->find('transfers', $id);
        if (!$row) {
            throw new DomainException('Transfer not found.');
        }
        global $wpdb;
        $variants = $this->db->table('product_variants');
        $row['items'] = $wpdb->get_results(
            $wpdb->prepare(
                'SELECT ti.*, i.imei, i.serial_number, i.variant_id, p.name AS product_name,
                        v.color, v.storage, v.variant_name
                 FROM ' . $this->db->table('transfer_items') . ' ti
                 INNER JOIN ' . $this->db->table('imeis') . ' i ON i.id = ti.imei_id
                 INNER JOIN ' . $this->db->table('products') . ' p ON p.id = ti.product_id
                 LEFT JOIN ' . $variants . ' v ON v.id = i.variant_id
                 WHERE ti.transfer_id = %d',
                $id
            ),
            ARRAY_A
        ) ?: [];
        $labels = new VariantLabel();
        foreach ($row['items'] as &$item) {
            $item['variant_label'] = $labels->format($item);
        }
        unset($item);

        return $row;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function list(): array
    {
        global $wpdb;
        $transfers = $this->db->table('transfers');
        $branches  = $this->db->table('branches');
        $rows      = $wpdb->get_results(
            "SELECT t.*, fb.name AS from_branch_name, tb.name AS to_branch_name,
                    (SELECT COUNT(*) FROM " . $this->db->table('transfer_items') . " ti WHERE ti.transfer_id = t.id) AS device_count
             FROM {$transfers} t
             LEFT JOIN {$branches} fb ON fb.id = t.from_branch_id
             LEFT JOIN {$branches} tb ON tb.id = t.to_branch_id
             ORDER BY t.id DESC LIMIT 100",
            ARRAY_A
        ) ?: [];

        return $rows;
    }

    /**
     * Dispatched transfers still in transit — devices are on the way between branches.
     *
     * @return list<array<string, mixed>>
     */
    public function transitLines(?int $branchId = null): array
    {
        global $wpdb;
        $transfers = $this->db->table('transfers');
        $branches  = $this->db->table('branches');
        $where     = "t.status = 'dispatched'";
        $params    = [];
        if ($branchId) {
            $where   .= ' AND (t.from_branch_id = %d OR t.to_branch_id = %d)';
            $params[] = $branchId;
            $params[] = $branchId;
        }
        $sql = "SELECT t.id, t.from_branch_id, t.to_branch_id, t.dispatched_at,
                       fb.name AS from_branch_name, tb.name AS to_branch_name,
                       DATEDIFF(NOW(), t.dispatched_at) AS days,
                       (SELECT COUNT(*) FROM " . $this->db->table('transfer_items') . " ti WHERE ti.transfer_id = t.id) AS device_count
                FROM {$transfers} t
                LEFT JOIN {$branches} fb ON fb.id = t.from_branch_id
                LEFT JOIN {$branches} tb ON tb.id = t.to_branch_id
                WHERE {$where}
                ORDER BY t.dispatched_at ASC
                LIMIT 30";
        $rows = $params !== []
            ? ($wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [])
            : ($wpdb->get_results($sql, ARRAY_A) ?: []);
        $labels = new VariantLabel();
        $items  = $this->db->table('transfer_items');
        $imeis  = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        foreach ($rows as &$row) {
            $lines = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT i.imei, p.name AS product_name, v.color, v.storage, v.variant_name
                     FROM {$items} ti
                     INNER JOIN {$imeis} i ON i.id = ti.imei_id
                     INNER JOIN {$products} p ON p.id = ti.product_id
                     LEFT JOIN {$variants} v ON v.id = i.variant_id
                     WHERE ti.transfer_id = %d
                     ORDER BY ti.id ASC",
                    (int) $row['id']
                ),
                ARRAY_A
            ) ?: [];
            $bits = [];
            foreach ($lines as $line) {
                $label = $labels->format($line);
                $name  = (string) ($line['product_name'] ?? '');
                $bit   = trim($line['imei'] . ($name !== '' ? ' · ' . $name : '') . ($label !== '' ? ' · ' . $label : ''));
                if ($bit !== '') {
                    $bits[] = $bit;
                }
            }
            $row['device_summary'] = implode('; ', $bits);
        }
        unset($row);

        return $rows;
    }

    /**
     * Transfers that have not finished — requested, approved, or dispatched past the hour threshold.
     *
     * @return list<array<string, mixed>>
     */
    public function stuckLines(?int $branchId = null, ?int $hours = null): array
    {
        global $wpdb;
        $transfers = $this->db->table('transfers');
        $branches  = $this->db->table('branches');
        $minHours  = max(0, $hours ?? 24);
        $where     = "t.status IN ('requested','approved','dispatched')
                      AND TIMESTAMPDIFF(HOUR, COALESCE(t.dispatched_at, t.requested_at), NOW()) >= %d";
        $params    = [$minHours];
        if ($branchId) {
            $where   .= ' AND (t.from_branch_id = %d OR t.to_branch_id = %d)';
            $params[] = $branchId;
            $params[] = $branchId;
        }
        $sql = "SELECT t.id, t.status, t.from_branch_id, t.to_branch_id,
                       fb.name AS from_branch_name, tb.name AS to_branch_name,
                       COALESCE(t.dispatched_at, t.requested_at) AS since_at,
                       TIMESTAMPDIFF(HOUR, COALESCE(t.dispatched_at, t.requested_at), NOW()) AS hours,
                       (SELECT COUNT(*) FROM " . $this->db->table('transfer_items') . " ti WHERE ti.transfer_id = t.id) AS device_count
                FROM {$transfers} t
                LEFT JOIN {$branches} fb ON fb.id = t.from_branch_id
                LEFT JOIN {$branches} tb ON tb.id = t.to_branch_id
                WHERE {$where}
                ORDER BY hours DESC, t.id DESC
                LIMIT 30";
        $rows = $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];
        $labels = new VariantLabel();
        $items  = $this->db->table('transfer_items');
        $imeis  = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        foreach ($rows as &$row) {
            $lines = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT i.imei, p.name AS product_name, v.color, v.storage, v.variant_name
                     FROM {$items} ti
                     INNER JOIN {$imeis} i ON i.id = ti.imei_id
                     INNER JOIN {$products} p ON p.id = ti.product_id
                     LEFT JOIN {$variants} v ON v.id = i.variant_id
                     WHERE ti.transfer_id = %d
                     ORDER BY ti.id ASC",
                    (int) $row['id']
                ),
                ARRAY_A
            ) ?: [];
            $bits = [];
            foreach ($lines as $line) {
                $label = $labels->format($line);
                $name  = (string) ($line['product_name'] ?? '');
                $bit   = trim($line['imei'] . ($name !== '' ? ' · ' . $name : '') . ($label !== '' ? ' · ' . $label : ''));
                if ($bit !== '') {
                    $bits[] = $bit;
                }
            }
            $row['device_summary'] = implode('; ', $bits);
        }
        unset($row);

        return $rows;
    }

    /**
     * Recently active transfers for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $transfers = $this->db->table('transfers');
        $branches  = $this->db->table('branches');
        $where     = 'COALESCE(t.received_at, t.dispatched_at, t.requested_at) >= DATE_SUB(NOW(), INTERVAL %d DAY)';
        $params    = [max(1, $days)];
        if ($branchId) {
            $where   .= ' AND (t.from_branch_id = %d OR t.to_branch_id = %d)';
            $params[] = $branchId;
            $params[] = $branchId;
        }
        $sql = "SELECT t.id, t.status, t.from_branch_id, t.to_branch_id,
                       t.requested_at, t.dispatched_at, t.received_at,
                       fb.name AS from_branch_name, tb.name AS to_branch_name,
                       COALESCE(t.received_at, t.dispatched_at, t.requested_at) AS activity_at,
                       DATEDIFF(NOW(), COALESCE(t.received_at, t.dispatched_at, t.requested_at)) AS days,
                       (SELECT COUNT(*) FROM " . $this->db->table('transfer_items') . " ti WHERE ti.transfer_id = t.id) AS device_count
                FROM {$transfers} t
                LEFT JOIN {$branches} fb ON fb.id = t.from_branch_id
                LEFT JOIN {$branches} tb ON tb.id = t.to_branch_id
                WHERE {$where}
                ORDER BY activity_at DESC
                LIMIT 30";
        $rows = $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];
        $labels = new VariantLabel();
        $items  = $this->db->table('transfer_items');
        $imeis  = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        foreach ($rows as &$row) {
            $lines = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT i.imei, p.name AS product_name, v.color, v.storage, v.variant_name
                     FROM {$items} ti
                     INNER JOIN {$imeis} i ON i.id = ti.imei_id
                     INNER JOIN {$products} p ON p.id = ti.product_id
                     LEFT JOIN {$variants} v ON v.id = i.variant_id
                     WHERE ti.transfer_id = %d
                     ORDER BY ti.id ASC",
                    (int) $row['id']
                ),
                ARRAY_A
            ) ?: [];
            $bits = [];
            foreach ($lines as $line) {
                $label = $labels->format($line);
                $name  = (string) ($line['product_name'] ?? '');
                $bit   = trim($line['imei'] . ($name !== '' ? ' · ' . $name : '') . ($label !== '' ? ' · ' . $label : ''));
                if ($bit !== '') {
                    $bits[] = $bit;
                }
            }
            $row['device_summary'] = implode('; ', $bits);
        }
        unset($row);

        return $rows;
    }

    private function requireStatus(int $id, string $status): array
    {
        $row = $this->get($id);
        if ($row['status'] !== $status) {
            throw new DomainException(sprintf('Transfer must be "%s" to continue.', $status));
        }

        return $row;
    }
}
