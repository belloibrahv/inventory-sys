<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\InvoiceNumber;
use Atoms\Domain\Money;
use Atoms\Domain\SwapCalculator;
use Atoms\Domain\SwapPolicy;
use Atoms\Domain\VariantLabel;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class SwapService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly AuditLogger $audit = new AuditLogger(),
        private readonly ImeiService $imeis = new ImeiService(),
        private readonly LedgerService $ledger = new LedgerService(),
        private readonly BranchService $branches = new BranchService(),
        private readonly ProductService $products = new ProductService(),
        private readonly SwapCalculator $calc = new SwapCalculator(),
        private readonly SwapPolicy $policy = new SwapPolicy()
    ) {
    }

    /**
     * Incoming device is registered. Outgoing device is sold. Difference is posted as payment/credit.
     *
     * @param array<string, mixed> $data
     */
    public function create(array $data): array
    {
        $branchId = (int) ($data['branch_id'] ?? $this->context->defaultBranchId());
        $this->context->assertBranchAccess($branchId);
        $branch     = $this->branches->get($branchId);
        $customerId = $this->resolveCustomer($data, $branchId);

        $incomingValue = Money::fromMajor($data['incoming_value'] ?? 0);
        $outgoing      = $this->imeis->getByImei((string) $data['outgoing_imei']);
        $this->imeis->assertSellable($outgoing, $branchId);
        $outgoingPrice = Money::fromMajor($data['outgoing_price'] ?? 0);
        if ($outgoingPrice->isZero() || $outgoingPrice->isNegative()) {
            throw new DomainException('Outgoing device price is required.');
        }
        $product = $this->products->get((int) $outgoing['product_id']);
        $this->policy->assertOutgoingPrice(
            $outgoingPrice,
            (new VariantLabel())->minimum($product, $this->products->variantOf($product, $outgoing['variant_id'] ?? null)),
            current_user_can('atoms_approve') || !empty($data['approval_id'])
        );
        $difference = $this->calc->difference($incomingValue, $outgoingPrice);
        $paid       = array_key_exists('paid_amount', $data)
            ? Money::fromMajor($data['paid_amount'])
            : ($difference->greaterThan(Money::zero()) ? $difference : Money::zero());

        return $this->db->transaction(function () use ($data, $branchId, $branch, $customerId, $incomingValue, $outgoing, $outgoingPrice, $difference, $paid) {
            $incoming = $this->imeis->register([
                'imei'            => $data['incoming_imei'],
                'serial_number'   => $data['incoming_serial'] ?? '',
                'product_id'      => (int) $data['incoming_product_id'],
                'variant_id'      => !empty($data['incoming_variant_id'])
                    ? (int) $data['incoming_variant_id']
                    : $this->products->soleActiveVariantId((int) $data['incoming_product_id']),
                'branch_id'       => $branchId,
                'source_type'     => 'swap',
                'cost_price'      => $incomingValue->minor(),
                'condition_grade' => $data['incoming_condition'] ?? 'used',
                'notes'           => 'Trade-in from customer #' . $customerId,
            ]);

            $seq     = $this->db->nextSequence('SWP-' . $branch['code'] . '-' . $this->db->year());
            $invoice = InvoiceNumber::next('SWP', (string) $branch['code'], (int) $this->db->year(), $seq);

            $id = $this->db->insert('swaps', [
                'invoice_number'    => $invoice,
                'customer_id'       => $customerId,
                'branch_id'         => $branchId,
                'incoming_imei_id'  => (int) $incoming['id'],
                'outgoing_imei_id'  => (int) $outgoing['id'],
                'incoming_value'    => $incomingValue->minor(),
                'outgoing_price'    => $outgoingPrice->minor(),
                'difference'        => $difference->minor(),
                'payment_method'    => sanitize_key((string) ($data['payment_method'] ?? 'cash')),
                'paid_amount'       => $paid->minor(),
                'status'            => 'posted',
                'notes'             => sanitize_textarea_field((string) ($data['notes'] ?? '')),
                'created_by'        => $this->context->userId(),
                'posted_at'         => $this->db->now(),
                'created_at'        => $this->db->now(),
            ]);

            $this->imeis->applyEvent((int) $outgoing['id'], 'swap_out', 'swap', $id, $branchId, 'Swapped out on ' . $invoice);
            $this->imeis->applyEvent((int) $incoming['id'], 'swap_in', 'swap', $id, $branchId, 'Swapped in on ' . $invoice);

            if ($difference->greaterThan(Money::zero())) {
                $this->ledger->post('customer', $customerId, 'debit', $difference, 'swap', $id, 'Swap difference ' . $invoice, $branchId);
                if ($paid->greaterThan(Money::zero())) {
                    $this->ledger->post('customer', $customerId, 'credit', $paid, 'payment', $id, 'Swap payment ' . $invoice, $branchId);
                    $this->db->insert('payments', [
                        'customer_id' => $customerId,
                        'sale_id'     => null,
                        'amount'      => $paid->minor(),
                        'method'      => sanitize_key((string) ($data['payment_method'] ?? 'cash')),
                        'branch_id'   => $branchId,
                        'status'      => 'posted',
                        'notes'       => 'Swap ' . $invoice,
                        'posted_by'   => $this->context->userId(),
                        'posted_at'   => $this->db->now(),
                        'created_at'  => $this->db->now(),
                    ]);
                }
            } elseif ($difference->isNegative()) {
                $credit = new Money(abs($difference->minor()));
                $this->ledger->post('customer', $customerId, 'credit', $credit, 'swap', $id, 'Swap store credit ' . $invoice, $branchId);
            }

            $this->audit->log('swap.created', 'swap', $id, null, [
                'invoice'          => $invoice,
                'incoming'         => $incoming['imei'],
                'incoming_product' => (string) ($incoming['product']['name'] ?? ''),
                'incoming_variant' => (string) ($incoming['variant_label'] ?? ''),
                'outgoing'         => $outgoing['imei'],
                'outgoing_product' => (string) ($outgoing['product']['name'] ?? ''),
                'outgoing_variant' => (string) ($outgoing['variant_label'] ?? ''),
            ], $branchId);

            return $this->get($id);
        });
    }

    public function get(int $id): array
    {
        $row = $this->db->find('swaps', $id);
        if (!$row) {
            throw new DomainException('Swap not found.');
        }

        return $this->hydrate($row);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function list(?int $branchId = null): array
    {
        global $wpdb;
        $swaps    = $this->db->table('swaps');
        $cust     = $this->db->table('customers');
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $sql      = "SELECT sw.*, c.name AS customer_name,
                         cin.imei AS incoming_imei, cout.imei AS outgoing_imei,
                         pin.name AS incoming_product_name, pout.name AS outgoing_product_name,
                         vin.color AS in_color, vin.storage AS in_storage, vin.variant_name AS in_variant_name,
                         vout.color AS out_color, vout.storage AS out_storage, vout.variant_name AS out_variant_name
                  FROM {$swaps} sw
                  LEFT JOIN {$cust} c ON c.id = sw.customer_id
                  LEFT JOIN {$imeis} cin ON cin.id = sw.incoming_imei_id
                  LEFT JOIN {$imeis} cout ON cout.id = sw.outgoing_imei_id
                  LEFT JOIN {$products} pin ON pin.id = cin.product_id
                  LEFT JOIN {$products} pout ON pout.id = cout.product_id
                  LEFT JOIN {$variants} vin ON vin.id = cin.variant_id
                  LEFT JOIN {$variants} vout ON vout.id = cout.variant_id
                  WHERE 1=1";
        $params = [];
        if ($branchId) {
            $this->context->assertBranchAccess($branchId);
            $sql     .= ' AND sw.branch_id = %d';
            $params[] = $branchId;
        } elseif (!current_user_can('atoms_all_branches')) {
            $ids = $this->context->branchIds();
            if ($ids === []) {
                return [];
            }
            $placeholders = implode(',', array_fill(0, count($ids), '%d'));
            $sql         .= " AND sw.branch_id IN ({$placeholders})";
            $params       = $ids;
        }
        $sql .= ' ORDER BY sw.id DESC LIMIT 100';
        $rows = $params !== []
            ? $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A)
            : $wpdb->get_results($sql, ARRAY_A);
        $rows = $rows ?: [];

        return $this->decorateList($rows);
    }

    /**
     * Recently posted swaps with device context for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $swaps    = $this->db->table('swaps');
        $cust     = $this->db->table('customers');
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $where    = "sw.status = 'posted' AND sw.posted_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
        $params   = [max(1, $days)];
        if ($branchId) {
            $this->context->assertBranchAccess($branchId);
            $where   .= ' AND sw.branch_id = %d';
            $params[] = $branchId;
        } elseif (!current_user_can('atoms_all_branches')) {
            $ids = $this->context->branchIds();
            if ($ids === []) {
                return [];
            }
            $placeholders = implode(',', array_fill(0, count($ids), '%d'));
            $where       .= " AND sw.branch_id IN ({$placeholders})";
            $params       = array_merge($params, $ids);
        }
        $sql = "SELECT sw.id, sw.invoice_number, sw.branch_id, sw.difference, sw.paid_amount, sw.posted_at,
                       c.name AS customer_name,
                       cin.imei AS incoming_imei, cout.imei AS outgoing_imei,
                       pin.name AS incoming_product_name, pout.name AS outgoing_product_name,
                       vin.color AS in_color, vin.storage AS in_storage, vin.variant_name AS in_variant_name,
                       vout.color AS out_color, vout.storage AS out_storage, vout.variant_name AS out_variant_name,
                       DATEDIFF(NOW(), sw.posted_at) AS days
                FROM {$swaps} sw
                LEFT JOIN {$cust} c ON c.id = sw.customer_id
                LEFT JOIN {$imeis} cin ON cin.id = sw.incoming_imei_id
                LEFT JOIN {$imeis} cout ON cout.id = sw.outgoing_imei_id
                LEFT JOIN {$products} pin ON pin.id = cin.product_id
                LEFT JOIN {$products} pout ON pout.id = cout.product_id
                LEFT JOIN {$variants} vin ON vin.id = cin.variant_id
                LEFT JOIN {$variants} vout ON vout.id = cout.variant_id
                WHERE {$where}
                ORDER BY sw.posted_at DESC
                LIMIT 30";
        $rows = $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];

        return $this->decorateList($rows);
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array<string, mixed>>
     */
    private function decorateList(array $rows): array
    {
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $row['incoming_variant_label'] = $labels->format([
                'color'        => $row['in_color'] ?? '',
                'storage'      => $row['in_storage'] ?? '',
                'variant_name' => $row['in_variant_name'] ?? '',
            ]);
            $row['outgoing_variant_label'] = $labels->format([
                'color'        => $row['out_color'] ?? '',
                'storage'      => $row['out_storage'] ?? '',
                'variant_name' => $row['out_variant_name'] ?? '',
            ]);
            $row['summary'] = $this->policy->explain(new Money((int) ($row['difference'] ?? 0)));
            $inBit  = trim(
                ($row['incoming_imei'] ?? '')
                . (($row['incoming_product_name'] ?? '') !== '' ? ' · ' . $row['incoming_product_name'] : '')
                . (($row['incoming_variant_label'] ?? '') !== '' ? ' · ' . $row['incoming_variant_label'] : '')
            );
            $outBit = trim(
                ($row['outgoing_imei'] ?? '')
                . (($row['outgoing_product_name'] ?? '') !== '' ? ' · ' . $row['outgoing_product_name'] : '')
                . (($row['outgoing_variant_label'] ?? '') !== '' ? ' · ' . $row['outgoing_variant_label'] : '')
            );
            $row['device_summary'] = $inBit . ' → ' . $outBit;
        }
        unset($row);

        return $rows;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function hydrate(array $row): array
    {
        $incoming = $this->imeis->getById((int) $row['incoming_imei_id']);
        $outgoing = $this->imeis->getById((int) $row['outgoing_imei_id']);
        $customer = $this->db->find('customers', (int) $row['customer_id']);
        $row['incoming']      = $incoming;
        $row['outgoing']      = $outgoing;
        $row['incoming_imei'] = $incoming['imei'] ?? '';
        $row['outgoing_imei'] = $outgoing['imei'] ?? '';
        $row['customer_name'] = $customer['name'] ?? '';
        $row['customer']      = $customer;
        $row['summary']       = $this->policy->explain(new Money((int) $row['difference']));

        return $row;
    }

    /**
     * @param array<string, mixed> $data
     */
    private function resolveCustomer(array $data, int $branchId): int
    {
        $customerId = (int) ($data['customer_id'] ?? 0);
        if ($customerId > 0) {
            return $customerId;
        }
        $phone = sanitize_text_field((string) ($data['customer_phone'] ?? ''));
        $name  = sanitize_text_field((string) ($data['customer_name'] ?? ''));
        if ($phone === '') {
            throw new DomainException('Find the customer by phone, or pick them from the list.');
        }
        $customers = new CustomerService();
        $existing  = $customers->findByPhone($phone);
        if ($existing) {
            return (int) $existing['id'];
        }
        if ($name === '') {
            throw new DomainException('New customer needs a name.');
        }
        $saved = $customers->save(null, [
            'name'      => $name,
            'phone'     => $phone,
            'branch_id' => $branchId,
        ]);

        return (int) $saved['id'];
    }
}
