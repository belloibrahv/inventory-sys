<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\Money;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class PaymentService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly AuditLogger $audit = new AuditLogger(),
        private readonly LedgerService $ledger = new LedgerService()
    ) {
    }

    /**
     * Payments are events. Old invoices are never edited.
     *
     * @param array<string, mixed> $data
     */
    public function post(array $data): array
    {
        $customerId = (int) $data['customer_id'];
        $amount     = Money::fromMajor($data['amount'] ?? 0);
        $branchId   = (int) ($data['branch_id'] ?? $this->context->defaultBranchId());
        if (!$branchId) {
            throw new DomainException('Branch is required.');
        }
        $this->context->assertBranchAccess($branchId);
        if ($amount->isZero() || $amount->isNegative()) {
            throw new DomainException('Payment amount must be greater than zero.');
        }

        $customer = $this->db->find('customers', $customerId);
        if (!$customer) {
            throw new DomainException('Customer not found.');
        }

        return $this->db->transaction(function () use ($data, $customerId, $amount, $branchId) {
            $id = $this->db->insert('payments', [
                'customer_id' => $customerId,
                'sale_id'     => !empty($data['sale_id']) ? (int) $data['sale_id'] : null,
                'amount'      => $amount->minor(),
                'method'      => sanitize_key((string) ($data['method'] ?? 'cash')),
                'branch_id'   => $branchId,
                'status'      => 'posted',
                'notes'       => sanitize_textarea_field((string) ($data['notes'] ?? '')),
                'posted_by'   => $this->context->userId(),
                'posted_at'   => $this->db->now(),
                'created_at'  => $this->db->now(),
            ]);

            $this->ledger->post(
                'customer',
                $customerId,
                'credit',
                $amount,
                'payment',
                $id,
                'Customer payment',
                $branchId
            );

            if (!empty($data['sale_id'])) {
                $this->applyToSale((int) $data['sale_id'], $amount);
            }

            $this->audit->log('payment.posted', 'payment', $id, null, ['amount' => $amount->minor()], $branchId);

            return $this->db->find('payments', $id);
        });
    }

    public function reverse(int $id, string $reason): array
    {
        $payment = $this->db->find('payments', $id);
        if (!$payment || $payment['status'] !== 'posted') {
            throw new DomainException('Payment cannot be reversed.');
        }

        return $this->db->transaction(function () use ($payment, $id, $reason) {
            $reversalId = $this->db->insert('payments', [
                'customer_id' => (int) $payment['customer_id'],
                'sale_id'     => $payment['sale_id'] ?: null,
                'amount'      => (int) $payment['amount'],
                'method'      => $payment['method'],
                'branch_id'   => (int) $payment['branch_id'],
                'status'      => 'reversal',
                'reversal_of' => $id,
                'notes'       => sanitize_textarea_field($reason),
                'posted_by'   => $this->context->userId(),
                'posted_at'   => $this->db->now(),
                'created_at'  => $this->db->now(),
            ]);

            $this->db->update('payments', ['status' => 'reversed'], ['id' => $id]);

            $this->ledger->post(
                'customer',
                (int) $payment['customer_id'],
                'debit',
                new Money((int) $payment['amount']),
                'payment_reversal',
                $reversalId,
                'Reverse payment: ' . $reason,
                (int) $payment['branch_id']
            );

            if (!empty($payment['sale_id'])) {
                $this->restoreSale((int) $payment['sale_id'], new Money((int) $payment['amount']));
            }

            $this->audit->log('payment.reversed', 'payment', $id, $payment, ['reason' => $reason], (int) $payment['branch_id']);

            return $this->db->find('payments', $reversalId);
        });
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function forCustomer(int $customerId): array
    {
        global $wpdb;
        $payments = $this->db->table('payments');
        $sales    = $this->db->table('sales');

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT p.*, s.invoice_number
                 FROM {$payments} p
                 LEFT JOIN {$sales} s ON s.id = p.sale_id
                 WHERE p.customer_id = %d AND p.status IN ('posted', 'reversal')
                 ORDER BY p.posted_at DESC, p.id DESC
                 LIMIT 50",
                $customerId
            ),
            ARRAY_A
        ) ?: [];
    }

    /**
     * Recently posted customer payments for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $payments = $this->db->table('payments');
        $sales    = $this->db->table('sales');
        $cust     = $this->db->table('customers');
        $where    = "p.status IN ('posted','reversal') AND p.posted_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
        $params   = [max(1, $days)];
        if ($branchId) {
            $where   .= ' AND p.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT p.id, p.customer_id, p.amount, p.method, p.status, p.posted_at,
                       c.name AS customer_name, s.invoice_number,
                       DATEDIFF(NOW(), p.posted_at) AS days
                FROM {$payments} p
                INNER JOIN {$cust} c ON c.id = p.customer_id
                LEFT JOIN {$sales} s ON s.id = p.sale_id
                WHERE {$where}
                ORDER BY p.posted_at DESC
                LIMIT 30";

        return $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];
    }

    /**
     * Recently reversed customer payments for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function reversalLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $payments = $this->db->table('payments');
        $sales    = $this->db->table('sales');
        $cust     = $this->db->table('customers');
        $where    = "p.status = 'reversal' AND p.posted_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
        $params   = [max(1, $days)];
        if ($branchId) {
            $where   .= ' AND p.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT p.id, p.customer_id, p.sale_id, p.amount, p.method, p.notes, p.reversal_of, p.posted_at,
                       c.name AS customer_name, s.invoice_number,
                       DATEDIFF(NOW(), p.posted_at) AS days
                FROM {$payments} p
                INNER JOIN {$cust} c ON c.id = p.customer_id
                LEFT JOIN {$sales} s ON s.id = p.sale_id
                WHERE {$where}
                ORDER BY p.posted_at DESC
                LIMIT 30";

        return $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];
    }

    private function applyToSale(int $saleId, Money $amount): void
    {
        $sale = $this->db->find('sales', $saleId);
        if (!$sale || $sale['status'] !== 'completed') {
            return;
        }
        $paid = new Money((int) $sale['paid_amount']);
        $due  = new Money((int) $sale['due_amount']);
        $newPaid = $paid->add($amount);
        $newDue  = $due->subtract($amount);
        if ($newDue->isNegative()) {
            throw new DomainException('Payment exceeds the outstanding amount on this invoice.');
        }
        $this->db->update('sales', [
            'paid_amount' => $newPaid->minor(),
            'due_amount'  => $newDue->minor(),
            'updated_at'  => $this->db->now(),
        ], ['id' => $saleId]);
    }

    private function restoreSale(int $saleId, Money $amount): void
    {
        $sale = $this->db->find('sales', $saleId);
        if (!$sale || $sale['status'] !== 'completed') {
            return;
        }
        $paid = new Money((int) $sale['paid_amount']);
        $due  = new Money((int) $sale['due_amount']);
        if ($amount->greaterThan($paid)) {
            $amount = $paid;
        }
        $this->db->update('sales', [
            'paid_amount' => $paid->subtract($amount)->minor(),
            'due_amount'  => $due->add($amount)->minor(),
            'updated_at'  => $this->db->now(),
        ], ['id' => $saleId]);
    }
}
