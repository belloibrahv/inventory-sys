<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\InvoiceNumber;
use Atoms\Domain\ImeiStatus;
use Atoms\Domain\Money;
use Atoms\Domain\VariantLabel;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class RepairService
{
    public const STATUSES = ['received', 'diagnosing', 'repairing', 'completed', 'returned'];

    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly AuditLogger $audit = new AuditLogger(),
        private readonly ImeiService $imeis = new ImeiService(),
        private readonly LedgerService $ledger = new LedgerService(),
        private readonly BranchService $branches = new BranchService()
    ) {
    }

    /**
     * @param array<string, mixed> $data
     */
    public function receive(array $data): array
    {
        $branchId = (int) ($data['branch_id'] ?? $this->context->defaultBranchId());
        $this->context->assertBranchAccess($branchId);
        $branch = $this->branches->get($branchId);
        $rawImei = (string) ($data['imei'] ?? '');
        if (empty($data['customer_id']) && !empty($data['customer_phone'])) {
            $found = (new CustomerService())->findByPhone((string) $data['customer_phone']);
            if ($found) {
                $data['customer_id'] = (int) $found['id'];
            }
        }

        return $this->db->transaction(function () use ($data, $branchId, $branch, $rawImei) {
            $created = false;
            try {
                $imei = $this->imeis->getByImei($rawImei);
            } catch (DomainException) {
                if (empty($data['product_id'])) {
                    throw new DomainException('Unknown IMEI — select the device model to intake it for repair.');
                }
                $imei = $this->imeis->register([
                    'imei'          => $rawImei,
                    'serial_number' => $data['serial_number'] ?? '',
                    'product_id'    => (int) $data['product_id'],
                    'branch_id'     => $branchId,
                    'source_type'   => 'customer_repair',
                    'cost_price'    => 0,
                    'notes'         => 'Customer device intake',
                ]);
                $created = true;
            }

            $seq    = $this->db->nextSequence('RPR-' . $branch['code'] . '-' . $this->db->year());
            $ticket = InvoiceNumber::next('RPR', (string) $branch['code'], (int) $this->db->year(), $seq);
            $id     = $this->db->insert('repairs', [
                'ticket_number'     => $ticket,
                'imei_id'           => (int) $imei['id'],
                'customer_id'       => $this->optionalCustomer($data, $branchId),
                'branch_id'         => $branchId,
                'engineer_id'       => !empty($data['engineer_id']) ? (int) $data['engineer_id'] : $this->context->userId(),
                'fault_description' => sanitize_textarea_field((string) ($data['fault_description'] ?? '')),
                'status'            => 'received',
                'source'            => sanitize_key((string) ($data['source'] ?? ($created ? 'walk_in' : 'stock'))),
                'charge_amount'     => Money::fromMajor($data['charge_amount'] ?? 0)->minor(),
                'paid_amount'       => 0,
                'received_at'       => $this->db->now(),
                'created_by'        => $this->context->userId(),
                'created_at'        => $this->db->now(),
                'updated_at'        => $this->db->now(),
            ]);

            if (($imei['status'] ?? '') !== ImeiStatus::UnderRepair->value) {
                $this->imeis->applyEvent((int) $imei['id'], 'send_to_repair', 'repair', $id, $branchId, $ticket);
            }

            $this->audit->log('repair.received', 'repair', $id, null, [
                'ticket'        => $ticket,
                'imei'          => $imei['imei'],
                'product_name'  => (string) ($imei['product']['name'] ?? ''),
                'variant_label' => (string) ($imei['variant_label'] ?? ''),
            ], $branchId);

            return $this->get($id);
        });
    }

    public function advance(int $id, string $status, string $diagnosis = ''): array
    {
        $repair = $this->get($id);
        $allowed = [
            'received'    => ['diagnosing'],
            'diagnosing'  => ['repairing'],
            'repairing'   => ['completed'],
        ];
        $from = (string) $repair['status'];
        if (!in_array($status, $allowed[$from] ?? [], true)) {
            throw new DomainException(sprintf('Cannot move a repair from %s to %s.', $from, $status));
        }

        $payload = [
            'status'     => $status,
            'updated_at' => $this->db->now(),
        ];
        if ($diagnosis !== '') {
            $payload['diagnosis'] = sanitize_textarea_field($diagnosis);
        }
        if ($status === 'completed') {
            $payload['completed_at'] = $this->db->now();
        }
        $this->db->update('repairs', $payload, ['id' => $id]);
        $this->audit->log('repair.status', 'repair', $id, ['status' => $from], ['status' => $status], (int) $repair['branch_id']);

        return $this->get($id);
    }

    public function resolve(int $id, string $outcome): array
    {
        $repair = $this->get($id);
        if (in_array($repair['status'], ['returned'], true)) {
            throw new DomainException('This repair is already closed.');
        }

        $event = match ($outcome) {
            'stock'    => 'repair_complete',
            'customer' => 'repair_return_customer',
            'unfixable'=> 'repair_unfixable',
            default    => throw new DomainException('Outcome must be stock, customer, or unfixable.'),
        };

        return $this->db->transaction(function () use ($repair, $id, $event, $outcome) {
            $this->imeis->applyEvent((int) $repair['imei_id'], $event, 'repair', $id, (int) $repair['branch_id'], $outcome);
            $this->db->update('repairs', [
                'status'      => $outcome === 'customer' ? 'returned' : 'completed',
                'completed_at'=> $this->db->now(),
                'returned_at' => $outcome === 'customer' ? $this->db->now() : null,
                'updated_at'  => $this->db->now(),
            ], ['id' => $id]);

            if ($outcome === 'customer' && !empty($repair['customer_id']) && (int) $repair['charge_amount'] > 0) {
                $this->ledger->post(
                    'customer',
                    (int) $repair['customer_id'],
                    'debit',
                    new Money((int) $repair['charge_amount']),
                    'repair',
                    $id,
                    'Repair ' . $repair['ticket_number'],
                    (int) $repair['branch_id']
                );
            }

            $this->audit->log('repair.resolved', 'repair', $id, $repair, ['outcome' => $outcome], (int) $repair['branch_id']);
            (new NotifyService())->push(
                'repair_complete',
                'Repair ' . $repair['ticket_number'] . ' closed',
                'Outcome: ' . $outcome,
                ['branch_id' => (int) $repair['branch_id'], 'reference_type' => 'repair', 'reference_id' => $id]
            );

            return $this->get($id);
        });
    }

    public function get(int $id): array
    {
        $row = $this->db->find('repairs', $id);
        if (!$row) {
            throw new DomainException('Repair not found.');
        }
        $device = $this->imeis->getById((int) $row['imei_id']);
        $row['imei']          = $device;
        $row['product_name']  = (string) ($device['product']['name'] ?? '');
        $row['variant_label'] = (string) ($device['variant_label'] ?? '');
        if (!empty($row['customer_id'])) {
            $row['customer'] = (new CustomerService())->get((int) $row['customer_id']);
        }

        return $this->hydrateStaff($row);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function list(?int $branchId = null): array
    {
        global $wpdb;
        $repairs  = $this->db->table('repairs');
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $sql      = "SELECT r.*, i.imei, i.serial_number, p.name AS product_name, v.color, v.storage, v.variant_name
                     FROM {$repairs} r
                     INNER JOIN {$imeis} i ON i.id = r.imei_id
                     INNER JOIN {$products} p ON p.id = i.product_id
                     LEFT JOIN {$variants} v ON v.id = i.variant_id";
        if ($branchId) {
            $rows = $wpdb->get_results($wpdb->prepare("{$sql} WHERE r.branch_id = %d ORDER BY r.id DESC LIMIT 100", $branchId), ARRAY_A) ?: [];
        } else {
            $rows = $wpdb->get_results("{$sql} ORDER BY r.id DESC LIMIT 100", ARRAY_A) ?: [];
        }

        $labels = new VariantLabel();

        return array_map(function (array $row) use ($labels) {
            $row['variant_label'] = $labels->format($row);

            return $this->hydrateStaff($row);
        }, $rows);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function openLines(?int $branchId = null, ?int $minDays = null): array
    {
        global $wpdb;
        $repairs   = $this->db->table('repairs');
        $customers = $this->db->table('customers');
        $imeis     = $this->db->table('imeis');
        $products  = $this->db->table('products');
        $variants  = $this->db->table('product_variants');
        $where     = "r.status NOT IN ('completed','returned')";
        $params    = [];
        if ($branchId) {
            $where   .= ' AND r.branch_id = %d';
            $params[] = $branchId;
        }
        if ($minDays !== null) {
            $where   .= ' AND DATEDIFF(NOW(), r.received_at) >= %d';
            $params[] = max(0, $minDays);
        }
        $sql = "SELECT r.id, r.ticket_number, r.status, r.received_at, r.customer_id, r.engineer_id,
                       c.name AS customer_name,
                       DATEDIFF(NOW(), r.received_at) AS days,
                       i.imei, p.name AS product_name, v.color, v.storage, v.variant_name
                FROM {$repairs} r
                INNER JOIN {$imeis} i ON i.id = r.imei_id
                INNER JOIN {$products} p ON p.id = i.product_id
                LEFT JOIN {$variants} v ON v.id = i.variant_id
                LEFT JOIN {$customers} c ON c.id = r.customer_id
                WHERE {$where}
                ORDER BY days DESC, r.id DESC
                LIMIT 50";
        $rows = $params !== []
            ? ($wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [])
            : ($wpdb->get_results($sql, ARRAY_A) ?: []);
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $row['variant_label'] = $labels->format($row);
            $label                = (string) ($row['variant_label'] ?? '');
            $name                 = (string) ($row['product_name'] ?? '');
            $row['device_summary'] = trim($row['imei'] . ($name !== '' ? ' · ' . $name : '') . ($label !== '' ? ' · ' . $label : ''));
            $row                  = $this->hydrateStaff($row);
        }
        unset($row);

        return $rows;
    }

    /**
     * Recently completed or returned repairs for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $repairs   = $this->db->table('repairs');
        $customers = $this->db->table('customers');
        $imeis     = $this->db->table('imeis');
        $products  = $this->db->table('products');
        $variants  = $this->db->table('product_variants');
        $where     = "r.status IN ('completed','returned') AND r.completed_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
        $params    = [max(1, $days)];
        if ($branchId) {
            $where   .= ' AND r.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT r.id, r.ticket_number, r.status, r.completed_at, r.customer_id, r.engineer_id,
                       c.name AS customer_name,
                       DATEDIFF(NOW(), r.completed_at) AS days,
                       i.imei, p.name AS product_name, v.color, v.storage, v.variant_name
                FROM {$repairs} r
                INNER JOIN {$imeis} i ON i.id = r.imei_id
                INNER JOIN {$products} p ON p.id = i.product_id
                LEFT JOIN {$variants} v ON v.id = i.variant_id
                LEFT JOIN {$customers} c ON c.id = r.customer_id
                WHERE {$where}
                ORDER BY r.completed_at DESC
                LIMIT 30";
        $rows = $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $row['variant_label'] = $labels->format($row);
            $label                = (string) ($row['variant_label'] ?? '');
            $name                 = (string) ($row['product_name'] ?? '');
            $row['device_summary'] = trim($row['imei'] . ($name !== '' ? ' · ' . $name : '') . ($label !== '' ? ' · ' . $label : ''));
            $row                  = $this->hydrateStaff($row);
        }
        unset($row);

        return $rows;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function hydrateStaff(array $row): array
    {
        $eng = !empty($row['engineer_id']) ? get_userdata((int) $row['engineer_id']) : null;
        $row['engineer_name'] = $eng ? $eng->display_name : '';

        return $row;
    }

    /**
     * @param array<string, mixed> $data
     */
    private function optionalCustomer(array $data, int $branchId): ?int
    {
        if (!empty($data['customer_id'])) {
            return (int) $data['customer_id'];
        }
        $phone = sanitize_text_field((string) ($data['customer_phone'] ?? ''));
        if ($phone === '') {
            return null;
        }
        $customers = new CustomerService();
        $existing  = $customers->findByPhone($phone);
        if ($existing) {
            return (int) $existing['id'];
        }
        $name = sanitize_text_field((string) ($data['customer_name'] ?? ''));
        if ($name === '') {
            return null;
        }
        $saved = $customers->save(null, [
            'name'      => $name,
            'phone'     => $phone,
            'branch_id' => $branchId,
        ]);

        return (int) $saved['id'];
    }
}
