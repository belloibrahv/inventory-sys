<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\CsvExporter;
use Atoms\Domain\DebtReminder;
use Atoms\Domain\DomainException;
use Atoms\Domain\WhatsAppLink;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class CustomerService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly LedgerService $ledger = new LedgerService(),
        private readonly AuditLogger $audit = new AuditLogger()
    ) {
    }

    /**
     * @param array<string, mixed> $data
     */
    public function save(?int $id, array $data): array
    {
        $payload = [
            'name'       => sanitize_text_field((string) $data['name']),
            'phone'      => sanitize_text_field((string) $data['phone']),
            'email'      => sanitize_email((string) ($data['email'] ?? '')),
            'address'    => sanitize_textarea_field((string) ($data['address'] ?? '')),
            'branch_id'  => !empty($data['branch_id']) ? (int) $data['branch_id'] : $this->context->defaultBranchId(),
            'notes'      => sanitize_textarea_field((string) ($data['notes'] ?? '')),
            'is_walk_in' => empty($data['is_walk_in']) ? 0 : 1,
            'is_active'  => 1,
            'updated_at' => $this->db->now(),
        ];

        if ($payload['name'] === '' || $payload['phone'] === '') {
            throw new DomainException('Customer name and phone are required.');
        }

        if ($id) {
            $old = $this->db->find('customers', $id);
            $this->db->update('customers', $payload, ['id' => $id]);
            $this->audit->log('customer.updated', 'customer', $id, $old, $payload);
            return $this->get($id);
        }

        $payload['created_at'] = $this->db->now();
        $newId = $this->db->insert('customers', $payload);
        $this->audit->log('customer.created', 'customer', $newId, null, $payload);

        return $this->get($newId);
    }

    public function findByPhone(string $phone): ?array
    {
        global $wpdb;
        $phone = sanitize_text_field($phone);
        if ($phone === '') {
            return null;
        }
        $id = $wpdb->get_var(
            $wpdb->prepare(
                'SELECT id FROM ' . $this->db->table('customers') . ' WHERE phone = %s ORDER BY id ASC LIMIT 1',
                $phone
            )
        );

        return $id ? $this->get((int) $id) : null;
    }

    public function get(int $id): array
    {
        $row = $this->db->find('customers', $id);
        if (!$row) {
            throw new DomainException('Customer not found.');
        }
        $balance = $this->ledger->balance('customer', $id);
        $row['balance']         = $balance->minor();
        $row['balance_formatted'] = $balance->format();
        $row['ledger'] = (new LedgerEnricher())->customerEntries($this->ledger->entries('customer', $id));
        $row['payments'] = (new PaymentService())->forCustomer($id);

        return $row;
    }

    /**
     * @return array<string, mixed>
     */
    public function statement(int $id): array
    {
        $row = $this->get($id);
        $row['invoices'] = (new SaleService())->list(['customer_id' => $id]);
        $row['whatsapp_url'] = '';
        if ((int) $row['balance'] > 0 && trim((string) ($row['phone'] ?? '')) !== '') {
            $ops = (new SettingsService())->get();
            $text = (new DebtReminder())->text(
                (string) $row['name'],
                (string) ($ops['company'] ?? ''),
                (string) $row['balance_formatted']
            );
            try {
                $row['whatsapp_url'] = (new WhatsAppLink())->chatUrl((string) $row['phone'], $text);
            } catch (DomainException) {
                $row['whatsapp_url'] = '';
            }
        }

        return $row;
    }

    /**
     * @return array{csv: string, filename: string}
     */
    public function exportStatement(int $id): array
    {
        $stmt = $this->statement($id);
        $csv  = new CsvExporter();
        $rows = array_map(static function (array $e) {
            $debit  = ($e['entry_type'] ?? '') === 'debit' ? $e['amount'] : 0;
            $credit = ($e['entry_type'] ?? '') === 'credit' ? $e['amount'] : 0;

            return [
                $e['posted_at'] ?? '',
                $e['reference_type'] ?? '',
                $e['description'] ?? '',
                number_format(((int) $debit) / 100, 2, '.', ''),
                number_format(((int) $credit) / 100, 2, '.', ''),
                number_format(((int) ($e['balance_after'] ?? 0)) / 100, 2, '.', ''),
            ];
        }, $stmt['ledger'] ?? []);

        return [
            'filename' => 'atoms-statement-' . (int) $stmt['id'] . '.csv',
            'csv'      => $csv->toString(
                ['Posted', 'Type', 'Description', 'Debit', 'Credit', 'Balance'],
                $rows
            ),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function search(string $q = ''): array
    {
        global $wpdb;
        $table = $this->db->table('customers');
        if ($q === '') {
            $rows = $wpdb->get_results("SELECT * FROM {$table} WHERE is_active = 1 ORDER BY name LIMIT 50", ARRAY_A) ?: [];
        } else {
            $like = '%' . $wpdb->esc_like($q) . '%';
            $rows = $wpdb->get_results(
                $wpdb->prepare("SELECT * FROM {$table} WHERE is_active = 1 AND (name LIKE %s OR phone LIKE %s) ORDER BY name LIMIT 30", $like, $like),
                ARRAY_A
            ) ?: [];
        }

        return array_map(function (array $row) {
            $row['balance'] = $this->ledger->balance('customer', (int) $row['id'])->minor();
            return $row;
        }, $rows);
    }

    /**
     * Recently created customers for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $table  = $this->db->table('customers');
        $where  = "is_active = 1 AND created_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
        $params = [max(1, $days)];
        if ($branchId) {
            $where   .= ' AND branch_id = %d';
            $params[] = $branchId;
        }
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT id, name, phone, email, branch_id, created_at FROM {$table} WHERE {$where} ORDER BY created_at DESC LIMIT 30",
                ...$params
            ),
            ARRAY_A
        ) ?: [];
        foreach ($rows as &$row) {
            $row['balance'] = $this->ledger->balance('customer', (int) $row['id'])->minor();
            $created        = (string) ($row['created_at'] ?? '');
            $row['days']    = $created !== ''
                ? (int) $wpdb->get_var($wpdb->prepare('SELECT DATEDIFF(NOW(), %s)', $created))
                : 0;
        }
        unset($row);

        return $rows;
    }

    public function archive(int $id): array
    {
        $row = $this->get($id);
        $balance = $this->ledger->balance('customer', $id);
        if (!$balance->isZero()) {
            throw new DomainException('Clear the customer balance before archiving.');
        }
        $this->db->update('customers', [
            'is_active'  => 0,
            'updated_at' => $this->db->now(),
        ], ['id' => $id]);
        $this->audit->log('customer.archived', 'customer', $id, ['is_active' => 1], ['is_active' => 0]);

        return $this->get($id);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function archived(): array
    {
        global $wpdb;
        $table = $this->db->table('customers');
        $rows  = $wpdb->get_results("SELECT * FROM {$table} WHERE is_active = 0 ORDER BY updated_at DESC LIMIT 40", ARRAY_A) ?: [];

        return array_map(function (array $row) {
            $row['balance'] = $this->ledger->balance('customer', (int) $row['id'])->minor();
            return $row;
        }, $rows);
    }

    public function restore(int $id): array
    {
        $row = $this->get($id);
        if (!empty($row['is_active'])) {
            throw new DomainException('Customer is already active.');
        }
        $this->db->update('customers', [
            'is_active'  => 1,
            'updated_at' => $this->db->now(),
        ], ['id' => $id]);
        $this->audit->log('customer.restored', 'customer', $id, ['is_active' => 0], ['is_active' => 1]);

        return $this->get($id);
    }
}
