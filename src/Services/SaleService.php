<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\ApprovalBrief;
use Atoms\Domain\DomainException;
use Atoms\Domain\InvoiceNumber;
use Atoms\Domain\Money;
use Atoms\Domain\SalePricing;
use Atoms\Domain\SaleVoidPolicy;
use Atoms\Domain\VariantLabel;
use Atoms\Domain\WholesalePolicy;
use Atoms\Domain\WarrantyPolicy;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class SaleService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly AuditLogger $audit = new AuditLogger(),
        private readonly ImeiService $imeis = new ImeiService(),
        private readonly LedgerService $ledger = new LedgerService(),
        private readonly BranchService $branches = new BranchService(),
        private readonly ProductService $products = new ProductService(),
        private readonly SalePricing $pricing = new SalePricing(),
        private readonly SaleVoidPolicy $voids = new SaleVoidPolicy(),
        private readonly WholesalePolicy $wholesale = new WholesalePolicy(),
        private readonly StockService $stock = new StockService()
    ) {
    }

    /**
     * @param array<string, mixed> $data
     */
    public function create(array $data): array
    {
        $branchId = (int) ($data['branch_id'] ?? $this->context->defaultBranchId());
        if (!$branchId) {
            throw new DomainException('Branch is required.');
        }
        $this->context->assertBranchAccess($branchId);
        $branch = $this->branches->get($branchId);

        $items = $data['items'] ?? [];
        if ($items === []) {
            throw new DomainException('A sale needs at least one line item.');
        }

        $customerId = !empty($data['customer_id']) ? (int) $data['customer_id'] : null;
        if (!$customerId) {
            $customerId = $this->resolveOfflineCustomer($data);
        }
        $paid       = Money::fromMajor($data['paid_amount'] ?? 0);
        $discount   = Money::fromMajor($data['discount'] ?? 0);
        $imported   = !empty($data['imported']);
        $forceOk    = !empty($data['approval_id']) || current_user_can('atoms_approve') || $imported;
        $saleType   = $this->wholesale->normalize((string) ($data['sale_type'] ?? 'retail'));
        if ($this->wholesale->requiresCustomer($saleType) && !$customerId) {
            throw new DomainException('Wholesale sales need a named customer on the invoice.');
        }

        $subtotal = Money::zero();
        $prepared = [];
        foreach ($items as $line) {
            if (!empty($line['imei'])) {
                $imei = $this->imeis->getByImei((string) $line['imei']);
                $this->imeis->assertCompletable($imei, $branchId, $forceOk && !empty($data['approval_id']));
                $product = $this->products->get((int) $imei['product_id']);
                $min     = (new VariantLabel())->minimum($product, $this->products->variantOf($product, $imei['variant_id'] ?? null));
                $price   = Money::fromMajor($line['selling_price'] ?? 0);
                if ($price->isZero() || $price->isNegative()) {
                    throw new DomainException('Selling price must be greater than zero.');
                }
                $subtotal   = $subtotal->add($price);
                $prepared[] = ['kind' => 'unit', 'imei' => $imei, 'product' => $product, 'min' => $min, 'price' => $price, 'qty' => 1];
                continue;
            }

            if (!empty($line['product_id'])) {
                $product = $this->products->get((int) $line['product_id']);
                if ($this->products->trackMode($product) !== 'quantity') {
                    throw new DomainException('Unit-tracked products must be sold by IMEI or serial.');
                }
                $variantId = !empty($line['variant_id']) ? (int) $line['variant_id'] : null;
                $qty       = max(1, (int) ($line['quantity'] ?? 1));
                $onHand    = $this->stock->get($branchId, (int) $product['id'], $variantId)['qty_on_hand'];
                if ($onHand < $qty) {
                    throw new DomainException('Insufficient stock for ' . ($product['name'] ?? 'product') . '.');
                }
                $min   = (new VariantLabel())->minimum($product, $this->products->variantOf($product, $variantId));
                $price = Money::fromMajor($line['selling_price'] ?? 0);
                if ($price->isZero() || $price->isNegative()) {
                    throw new DomainException('Selling price must be greater than zero.');
                }
                $lineTotal  = new Money($price->minor() * $qty);
                $subtotal   = $subtotal->add($lineTotal);
                $stockRow   = $this->stock->get($branchId, (int) $product['id'], $variantId);
                $prepared[] = [
                    'kind'      => 'quantity',
                    'product'   => $product,
                    'variantId' => $variantId,
                    'min'       => $min,
                    'price'     => $price,
                    'qty'       => $qty,
                    'cost'      => (int) ($stockRow['avg_cost'] ?? $product['default_cost_price'] ?? 0),
                ];
                continue;
            }

            throw new DomainException('Each sale line needs an IMEI or a product with quantity.');
        }

        if ($this->needsApproval($prepared) && !$forceOk) {
            $approvalId = $this->queueApproval($data, $branchId, $prepared);

            return [
                'status'      => 'pending_approval',
                'approval_id' => $approvalId,
                'message'     => 'This sale is below the minimum price. The device is reserved until a manager approves it.',
            ];
        }

        $total = $subtotal->subtract($discount);
        if ($total->isNegative()) {
            throw new DomainException('Discount cannot exceed the sale total.');
        }
        $due = $total->subtract($paid);
        if ($due->isNegative()) {
            throw new DomainException('Paid amount cannot exceed the total.');
        }
        if ($due->greaterThan(Money::zero()) && !$customerId) {
            throw new DomainException('A named customer is required when the sale is not fully paid.');
        }

        $invoiceOverride = '';
        if ($imported && trim((string) ($data['invoice_number'] ?? '')) !== '') {
            $invoiceOverride = strtoupper(sanitize_text_field((string) $data['invoice_number']));
            if ($this->invoiceExists($invoiceOverride)) {
                throw new DomainException('Invoice ' . $invoiceOverride . ' already exists.');
            }
        }
        $postedAt = $this->db->now();
        if ($imported && trim((string) ($data['posted_at'] ?? $data['sale_date'] ?? '')) !== '') {
            $postedAt = $this->importPostedAt((string) ($data['posted_at'] ?? $data['sale_date']));
        }
        $notes = sanitize_textarea_field((string) ($data['notes'] ?? ''));
        if ($imported && !str_contains($notes, 'Imported')) {
            $notes = trim($notes . ' Imported from spreadsheet.');
        }

        return $this->db->transaction(function () use ($data, $branch, $branchId, $customerId, $paid, $discount, $subtotal, $prepared, $total, $due, $invoiceOverride, $postedAt, $notes, $saleType) {
            $invoice = $invoiceOverride !== ''
                ? $invoiceOverride
                : InvoiceNumber::next('INV', (string) $branch['code'], (int) $this->db->year(), $this->db->nextSequence('INV-' . $branch['code'] . '-' . $this->db->year()));

            $saleId = $this->db->insert('sales', [
                'invoice_number'  => $invoice,
                'customer_id'     => $customerId,
                'branch_id'       => $branchId,
                'salesperson_id'  => (int) ($data['salesperson_id'] ?? $this->context->userId()),
                'sale_type'       => $saleType,
                'subtotal'        => $subtotal->minor(),
                'discount'        => $discount->minor(),
                'total'           => $total->minor(),
                'paid_amount'     => $paid->minor(),
                'due_amount'      => $due->minor(),
                'payment_method'  => sanitize_key((string) ($data['payment_method'] ?? 'cash')),
                'status'          => 'completed',
                'approval_id'     => !empty($data['approval_id']) ? (int) $data['approval_id'] : null,
                'notes'           => $notes,
                'posted_at'       => $postedAt,
                'created_by'      => $this->context->userId(),
                'created_at'      => $this->db->now(),
                'updated_at'      => $this->db->now(),
            ]);

            foreach ($prepared as $line) {
                if (($line['kind'] ?? 'unit') === 'quantity') {
                    $this->stock->adjust(
                        $branchId,
                        (int) $line['product']['id'],
                        $line['variantId'],
                        -$line['qty'],
                        'Sold on ' . $invoice
                    );
                    $this->db->insert('sale_items', [
                        'sale_id'       => $saleId,
                        'product_id'    => (int) $line['product']['id'],
                        'variant_id'    => $line['variantId'],
                        'imei_id'       => null,
                        'quantity'      => $line['qty'],
                        'selling_price' => $line['price']->minor(),
                        'cost_price'    => (int) $line['cost'],
                        'min_price'     => $line['min']->minor(),
                        'discount'      => 0,
                    ]);
                    continue;
                }

                $this->imeis->applyEvent((int) $line['imei']['id'], 'complete_sale', 'sale', $saleId, $branchId, 'Sold on ' . $invoice);
                $this->db->insert('sale_items', [
                    'sale_id'        => $saleId,
                    'product_id'     => (int) $line['imei']['product_id'],
                    'variant_id'     => $line['imei']['variant_id'] ?: null,
                    'imei_id'        => (int) $line['imei']['id'],
                    'quantity'       => 1,
                    'selling_price'  => $line['price']->minor(),
                    'cost_price'     => (int) $line['imei']['cost_price'],
                    'min_price'      => $line['min']->minor(),
                    'discount'       => 0,
                ]);
            }

            if ($customerId && $total->greaterThan(Money::zero())) {
                $this->ledger->post('customer', $customerId, 'debit', $total, 'sale', $saleId, 'Sale ' . $invoice, $branchId);
            }

            if ($customerId && $paid->greaterThan(Money::zero())) {
                $this->db->insert('payments', [
                    'customer_id' => $customerId,
                    'sale_id'     => $saleId,
                    'amount'      => $paid->minor(),
                    'method'      => sanitize_key((string) ($data['payment_method'] ?? 'cash')),
                    'branch_id'   => $branchId,
                    'status'      => 'posted',
                    'notes'       => 'Payment at sale ' . $invoice,
                    'posted_by'   => $this->context->userId(),
                    'posted_at'   => $postedAt,
                    'created_at'  => $this->db->now(),
                ]);
                $this->ledger->post('customer', $customerId, 'credit', $paid, 'payment', $saleId, 'Payment at sale ' . $invoice, $branchId);
            }

            $deviceLines = [];
            foreach ($prepared as $line) {
                if (($line['kind'] ?? 'unit') === 'quantity') {
                    $label = (new VariantLabel())->format($this->products->variantOf($line['product'], $line['variantId']));
                    $name  = (string) ($line['product']['name'] ?? '');
                    $deviceLines[] = trim($name . ($label !== '' ? ' · ' . $label : '') . ' × ' . $line['qty']);
                    continue;
                }
                $imeiRow = $line['imei'];
                $label   = (string) ($imeiRow['variant_label'] ?? '');
                $name    = (string) ($imeiRow['product']['name'] ?? '');
                $deviceLines[] = trim($imeiRow['imei'] . ($name !== '' ? ' · ' . $name : '') . ($label !== '' ? ' · ' . $label : ''));
            }

            $this->audit->log('sale.created', 'sale', $saleId, null, [
                'invoice' => $invoice,
                'total'   => $total->minor(),
                'devices' => implode('; ', $deviceLines),
            ], $branchId);

            return $this->get($saleId);
        });
    }

    public function void(int $id, string $reason): array
    {
        if (!current_user_can('atoms_void')) {
            throw new DomainException('You cannot void sales.');
        }
        $sale = $this->get($id);
        $this->context->assertBranchAccess((int) $sale['branch_id']);
        $statuses = [];
        $hasQuantityLines = false;
        foreach ($sale['items'] as $item) {
            if (!empty($item['imei_id']) && !empty($item['imei'])) {
                $statuses[(string) $item['imei']] = (string) ($item['imei_status'] ?? '');
                continue;
            }
            if (empty($item['imei_id'])) {
                $hasQuantityLines = true;
            }
        }
        $this->voids->assert((string) $sale['status'], $this->hasReturns($id), $statuses, $hasQuantityLines);
        if (trim($reason) === '') {
            throw new DomainException('A void reason is required.');
        }

        return $this->db->transaction(function () use ($sale, $id, $reason) {
            foreach ($sale['items'] as $item) {
                if (!empty($item['imei_id'])) {
                    $this->imeis->applyEvent((int) $item['imei_id'], 'return_good', 'sale_void', $id, (int) $sale['branch_id'], 'Voided: ' . $reason);
                    continue;
                }
                $this->stock->adjust(
                    (int) $sale['branch_id'],
                    (int) $item['product_id'],
                    !empty($item['variant_id']) ? (int) $item['variant_id'] : null,
                    max(1, (int) ($item['quantity'] ?? 1)),
                    'Void sale ' . ($sale['invoice_number'] ?? $id)
                );
            }

            if (!empty($sale['customer_id']) && (int) $sale['total'] > 0) {
                $this->ledger->post(
                    'customer',
                    (int) $sale['customer_id'],
                    'credit',
                    new Money((int) $sale['total']),
                    'sale_void',
                    $id,
                    'Void sale ' . $sale['invoice_number'],
                    (int) $sale['branch_id']
                );
            }

            if (!empty($sale['customer_id']) && (int) $sale['paid_amount'] > 0) {
                $this->ledger->post(
                    'customer',
                    (int) $sale['customer_id'],
                    'debit',
                    new Money((int) $sale['paid_amount']),
                    'sale_void',
                    $id,
                    'Reverse payment on voided sale ' . $sale['invoice_number'],
                    (int) $sale['branch_id']
                );
            }

            $this->db->update('sales', [
                'status'      => 'voided',
                'voided_at'   => $this->db->now(),
                'void_reason' => sanitize_textarea_field($reason),
                'updated_at'  => $this->db->now(),
            ], ['id' => $id]);

            $this->audit->log('sale.voided', 'sale', $id, $sale, ['reason' => $reason], (int) $sale['branch_id']);
            (new NotifyService())->push(
                'sale_voided',
                'Sale voided',
                $sale['invoice_number'] . ' was voided. Stock and the ledger reversed as new events. Reason: ' . $reason,
                ['branch_id' => (int) $sale['branch_id'], 'reference_type' => 'sale', 'reference_id' => $id]
            );

            return $this->get($id);
        });
    }

    public function get(int $id): array
    {
        $row = $this->db->find('sales', $id);
        if (!$row) {
            throw new DomainException('Sale not found.');
        }
        global $wpdb;
        $row['items'] = $wpdb->get_results(
            $wpdb->prepare(
                'SELECT si.*, i.imei, i.serial_number, i.status AS imei_status, p.name AS product_name, p.warranty_days,
                        v.color, v.storage, v.variant_name
                 FROM ' . $this->db->table('sale_items') . ' si
                 INNER JOIN ' . $this->db->table('products') . ' p ON p.id = si.product_id
                 LEFT JOIN ' . $this->db->table('imeis') . ' i ON i.id = si.imei_id
                 LEFT JOIN ' . $this->db->table('product_variants') . ' v ON v.id = si.variant_id
                 WHERE si.sale_id = %d',
                $id
            ),
            ARRAY_A
        ) ?: [];
        $policy = new WarrantyPolicy();
        $labels = new VariantLabel();
        $soldAt = (string) ($row['posted_at'] ?? $row['created_at'] ?? '');
        $asOf   = $this->db->now();
        foreach ($row['items'] as &$item) {
            $item['quantity']     = (int) ($item['quantity'] ?? 1);
            $item['imei_id']      = !empty($item['imei_id']) ? (int) $item['imei_id'] : null;
            $item['product_id']   = (int) ($item['product_id'] ?? 0);
            $item['variant_id']   = !empty($item['variant_id']) ? (int) $item['variant_id'] : null;
            $item['selling_price'] = (int) ($item['selling_price'] ?? 0);
            $item['cost_price']   = (int) ($item['cost_price'] ?? 0);
            $item['min_price']    = (int) ($item['min_price'] ?? 0);
            $item['discount']     = (int) ($item['discount'] ?? 0);
            $days = (int) ($item['warranty_days'] ?? 0);
            $item['warranty_expires'] = $policy->expiresOn($soldAt, $days);
            $item['in_warranty']      = $policy->covers($soldAt, $days, $asOf);
            $item['variant_label']    = $labels->format($item);
        }
        unset($item);

        if (!empty($row['customer_id'])) {
            $row['customer'] = $this->db->find('customers', (int) $row['customer_id']);
        }
        $row['branch'] = $this->branches->get((int) $row['branch_id']);
        $seller = !empty($row['salesperson_id']) ? get_userdata((int) $row['salesperson_id']) : null;
        $row['salesperson'] = $seller ? ['id' => (int) $seller->ID, 'name' => $seller->display_name] : null;

        return $row;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function list(array $args): array
    {
        global $wpdb;
        $table = $this->db->table('sales');
        $where = ['1=1'];
        $params = [];
        if (!empty($args['branch_id'])) {
            $where[]  = 'branch_id = %d';
            $params[] = (int) $args['branch_id'];
        }
        if (!empty($args['customer_id'])) {
            $where[]  = 'customer_id = %d';
            $params[] = (int) $args['customer_id'];
        }
        if (!empty($args['q'])) {
            $where[]  = 'invoice_number LIKE %s';
            $params[] = '%' . $wpdb->esc_like((string) $args['q']) . '%';
        }
        $sql = 'SELECT * FROM ' . $table . ' WHERE ' . implode(' AND ', $where) . ' ORDER BY id DESC LIMIT 100';

        return ($params ? $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) : $wpdb->get_results($sql, ARRAY_A)) ?: [];
    }

    /**
     * Recently posted sales with device context for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $sales    = $this->db->table('sales');
        $cust     = $this->db->table('customers');
        $items    = $this->db->table('sale_items');
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $where    = "s.status = 'completed' AND s.posted_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
        $params   = [max(1, $days)];
        if ($branchId) {
            $where   .= ' AND s.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT s.id, s.invoice_number, s.branch_id, s.sale_type, s.total, s.paid_amount, s.due_amount, s.posted_at,
                       c.id AS customer_id, c.name AS customer_name,
                       i.imei, p.name AS product_name, v.color, v.storage, v.variant_name,
                       DATEDIFF(NOW(), s.posted_at) AS days
                FROM {$sales} s
                LEFT JOIN {$cust} c ON c.id = s.customer_id
                INNER JOIN (
                    SELECT sale_id, MIN(id) AS first_item_id
                    FROM {$items}
                    GROUP BY sale_id
                ) fx ON fx.sale_id = s.id
                INNER JOIN {$items} si ON si.id = fx.first_item_id
                INNER JOIN {$products} p ON p.id = si.product_id
                LEFT JOIN {$imeis} i ON i.id = si.imei_id
                LEFT JOIN {$variants} v ON v.id = si.variant_id
                WHERE {$where}
                ORDER BY s.posted_at DESC
                LIMIT 30";
        $rows   = $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $label = $labels->format($row);
            $name  = (string) ($row['product_name'] ?? '');
            $row['variant_label']  = $label;
            $imeiPart = !empty($row['imei']) ? (string) $row['imei'] : $name;
            $row['device_summary'] = trim(
                $imeiPart . ($name !== '' && !empty($row['imei']) ? ' · ' . $name : '') . ($label !== '' ? ' · ' . $label : '')
            );
            $row['sale_type_label'] = $this->wholesale->label((string) ($row['sale_type'] ?? 'retail'));
        }
        unset($row);

        return $rows;
    }

    /**
     * Recently voided sales with device context for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function voidedLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $sales    = $this->db->table('sales');
        $cust     = $this->db->table('customers');
        $items    = $this->db->table('sale_items');
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $where    = "s.status = 'voided' AND s.voided_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
        $params   = [max(1, $days)];
        if ($branchId) {
            $where   .= ' AND s.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT s.id, s.invoice_number, s.branch_id, s.sale_type, s.total, s.voided_at, s.void_reason,
                       c.id AS customer_id, c.name AS customer_name,
                       i.imei, p.name AS product_name, v.color, v.storage, v.variant_name,
                       DATEDIFF(NOW(), s.voided_at) AS days
                FROM {$sales} s
                LEFT JOIN {$cust} c ON c.id = s.customer_id
                INNER JOIN (
                    SELECT sale_id, MIN(id) AS first_item_id
                    FROM {$items}
                    GROUP BY sale_id
                ) fx ON fx.sale_id = s.id
                INNER JOIN {$items} si ON si.id = fx.first_item_id
                INNER JOIN {$products} p ON p.id = si.product_id
                LEFT JOIN {$imeis} i ON i.id = si.imei_id
                LEFT JOIN {$variants} v ON v.id = si.variant_id
                WHERE {$where}
                ORDER BY s.voided_at DESC
                LIMIT 30";
        $rows   = $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $label = $labels->format($row);
            $name  = (string) ($row['product_name'] ?? '');
            $row['variant_label']  = $label;
            $imeiPart = !empty($row['imei']) ? (string) $row['imei'] : $name;
            $row['device_summary'] = trim(
                $imeiPart . ($name !== '' && !empty($row['imei']) ? ' · ' . $name : '') . ($label !== '' ? ' · ' . $label : '')
            );
            $row['sale_type_label'] = $this->wholesale->label((string) ($row['sale_type'] ?? 'retail'));
        }
        unset($row);

        return $rows;
    }

    public function findByInvoice(string $invoice): array
    {
        global $wpdb;
        $id = $wpdb->get_var(
            $wpdb->prepare('SELECT id FROM ' . $this->db->table('sales') . ' WHERE invoice_number = %s', $invoice)
        );
        if (!$id) {
            throw new DomainException('Invoice not found.');
        }

        return $this->get((int) $id);
    }

    public function invoiceExists(string $invoice): bool
    {
        global $wpdb;
        $id = $wpdb->get_var(
            $wpdb->prepare('SELECT id FROM ' . $this->db->table('sales') . ' WHERE invoice_number = %s', $invoice)
        );

        return (bool) $id;
    }

    private function hasReturns(int $saleId): bool
    {
        global $wpdb;

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                'SELECT COUNT(*) FROM ' . $this->db->table('returns') . ' WHERE sale_id = %d',
                $saleId
            )
        ) > 0;
    }

    private function importPostedAt(string $raw): string
    {
        $raw = trim($raw);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
            $raw .= ' 12:00:00';
        }
        $ts = strtotime($raw);
        if ($ts === false) {
            throw new DomainException('Sale date is not valid.');
        }
        $now = strtotime($this->db->now()) ?: time();
        if ($ts > $now + 86400) {
            throw new DomainException('Sale date cannot be in the future.');
        }

        return date('Y-m-d H:i:s', $ts);
    }

    /**
     * @param list<array<string, mixed>> $prepared
     */
    private function needsApproval(array $prepared): bool
    {
        foreach ($prepared as $line) {
            if ($this->pricing->requiresApproval($line['price'], $line['min'])) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param array<string, mixed> $data
     * @param list<array<string, mixed>> $prepared
     */
    private function queueApproval(array $data, int $branchId, array $prepared): int
    {
        return $this->db->transaction(function () use ($data, $branchId, $prepared) {
            $payload = $data;
            $byKey   = [];
            $labels  = new VariantLabel();
            foreach ($prepared as $line) {
                if (($line['kind'] ?? 'unit') === 'quantity') {
                    $key = 'p:' . (int) $line['product']['id'] . ':' . (int) ($line['variantId'] ?? 0);
                    $byKey[$key] = $line;
                    continue;
                }
                $byKey[(string) $line['imei']['imei']] = $line;
            }
            $items = [];
            foreach ($payload['items'] ?? [] as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $prep = null;
                if (!empty($item['imei'])) {
                    $prep = $byKey[(string) $item['imei']] ?? null;
                } elseif (!empty($item['product_id'])) {
                    $key  = 'p:' . (int) $item['product_id'] . ':' . (int) ($item['variant_id'] ?? 0);
                    $prep = $byKey[$key] ?? null;
                }
                if ($prep) {
                    $variant = $this->products->variantOf(
                        $prep['product'],
                        ($prep['kind'] ?? 'unit') === 'quantity'
                            ? ($prep['variantId'] ?? null)
                            : ($prep['imei']['variant_id'] ?? null)
                    );
                    $item['product_name']  = (string) ($prep['product']['name'] ?? '');
                    $item['variant_label'] = $labels->format($variant);
                }
                $items[] = $item;
            }
            $payload['items'] = $items;

            $id = $this->db->insert('approvals', [
                'type'         => 'price_override',
                'payload'      => wp_json_encode($payload),
                'status'       => 'pending',
                'requested_by' => $this->context->userId(),
                'branch_id'    => $branchId,
                'created_at'   => $this->db->now(),
            ]);
            foreach ($prepared as $line) {
                $this->imeis->applyEvent(
                    (int) $line['imei']['id'],
                    'reserve_for_sale',
                    'approval',
                    $id,
                    $branchId,
                    'Reserved pending price override approval'
                );
            }
            $this->audit->log('approval.requested', 'approval', $id, null, ['type' => 'price_override'], $branchId);
            $brief   = new ApprovalBrief();
            $summary = $brief->summary('price_override', $payload);
            (new NotifyService())->push(
                'approval_request',
                'Approval needed: ' . $brief->label('price_override'),
                $summary !== '' ? $summary : 'A sale below minimum price is reserved pending review.',
                ['branch_id' => $branchId, 'reference_type' => 'approval', 'reference_id' => $id]
            );

            return $id;
        });
    }

    /**
     * Offline POS may send customer_phone (+ optional name) instead of customer_id.
     * Finds or creates the customer so debt sales still work without a prior online register.
     *
     * @param array<string, mixed> $data
     */
    private function resolveOfflineCustomer(array $data): ?int
    {
        $phone = sanitize_text_field((string) ($data['customer_phone'] ?? ''));
        if ($phone === '') {
            return null;
        }
        $customers = new CustomerService($this->db, $this->context);
        $existing  = $customers->findByPhone($phone);
        if ($existing) {
            return (int) $existing['id'];
        }
        $name = sanitize_text_field((string) ($data['customer_name'] ?? ''));
        if ($name === '') {
            $name = 'Customer ' . $phone;
        }
        $row = $customers->save(null, [
            'name'      => $name,
            'phone'     => $phone,
            'address'   => (string) ($data['customer_address'] ?? ''),
            'branch_id' => !empty($data['branch_id']) ? (int) $data['branch_id'] : null,
        ]);

        return (int) $row['id'];
    }
}
