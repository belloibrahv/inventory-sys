<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\CsvExporter;
use Atoms\Domain\DocxExporter;
use Atoms\Domain\DebtAging;
use Atoms\Domain\DomainException;
use Atoms\Domain\Performance;
use Atoms\Domain\ReportPeriod;
use Atoms\Domain\VariantLabel;
use Atoms\Domain\WholesalePolicy;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class ReportService
{
    public const EXPORT_TYPES = ['sales', 'inventory', 'inventory_valuation', 'expenses', 'expense_snapshot', 'intake_snapshot', 'operations_snapshot', 'receivables_snapshot', 'payables_snapshot', 'adjustments_snapshot', 'performance_snapshot', 'staff_snapshot', 'movement_snapshot', 'ledger_snapshot', 'repair_snapshot', 'compliance_snapshot', 'trade_snapshot', 'aging_snapshot', 'executive_snapshot', 'branch_snapshot', 'mix_snapshot', 'product_snapshot', 'trend_snapshot', 'cashflow_snapshot', 'staff_device_snapshot', 'stock_snapshot', 'imei_snapshot', 'transfer_snapshot', 'purchase_snapshot', 'returns_snapshot', 'faulty_snapshot', 'customer_snapshot', 'supplier_snapshot', 'count_snapshot', 'approval_snapshot', 'audit_snapshot', 'collection_snapshot', 'alert_snapshot', 'sales_snapshot', 'payment_snapshot', 'swap_snapshot', 'return_snapshot', 'adjustment_snapshot', 'procurement_snapshot', 'receiving_snapshot', 'payable_snapshot', 'receivable_snapshot', 'workflow_snapshot', 'transit_snapshot', 'stockflow_snapshot', 'service_snapshot', 'countflow_snapshot', 'approvalflow_snapshot', 'auditflow_snapshot', 'collectionflow_snapshot', 'alertflow_snapshot', 'expenseflow_snapshot', 'performanceflow_snapshot', 'customerflow_snapshot', 'intakeflow_snapshot', 'supplierflow_snapshot', 'inventoryflow_snapshot', 'staffflow_snapshot', 'branchflow_snapshot', 'cashflowflow_snapshot', 'mixflow_snapshot', 'trendflow_snapshot', 'productflow_snapshot', 'ledgerflow_snapshot', 'executiveflow_snapshot', 'agingflow_snapshot', 'tradeflow_snapshot', 'movement', 'cash', 'imei', 'imei_status', 'payables', 'receivables', 'receivable_invoices', 'receivable_aging', 'payable_purchases', 'payable_aging', 'open_repairs', 'faulty_devices', 'open_stock_counts', 'recent_returns', 'today_returns', 'pending_expenses', 'pending_approvals', 'wholesale_receivables', 'retail_receivables', 'recent_swaps', 'today_swaps', 'recent_sales', 'today_sales', 'recent_payments', 'today_payments', 'supplier_payments', 'today_supplier_payments', 'recent_purchases', 'today_purchases', 'supplier_returns', 'today_supplier_returns', 'payment_reversals', 'today_reversals', 'voided_sales', 'today_voided_sales', 'recent_expenses', 'today_expenses', 'recent_audit', 'today_audit', 'today_alerts', 'unread_alerts', 'recent_transfers', 'today_transfers', 'recent_stock_counts', 'today_stock_counts', 'recent_repairs', 'today_repairs', 'recent_approvals', 'today_approvals', 'recent_customers', 'today_customers', 'recent_imeis', 'today_imeis', 'low_stock', 'top_products', 'payment_mix', 'sale_types', 'sales_trend', 'slow_movers', 'branches', 'staff', 'staff_devices'];

    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Performance $performance = new Performance()
    ) {
    }

    /**
     * @return array{from: string, to: string, preset: string}
     */
    public function period(string $preset, ?string $from = null, ?string $to = null): array
    {
        return (new ReportPeriod())->range($preset, $from, $to);
    }

    /**
     * @return array<string, mixed>
     */
    public function pack(string $from, string $to, ?int $branchId = null): array
    {
        $inventory = $this->inventory($branchId);
        $cash      = $this->cash($from, $to, $branchId);
        $sales     = $this->sales($from, $to, $branchId);
        $expenses  = $this->expenses($from, $to, $branchId);
        $days      = max(1, (int) ((strtotime($to) - strtotime($from)) / 86400) + 1);
        $aging     = (new AnalyticsService())->receivableAging($branchId);
        $payableAging = (new AnalyticsService())->payableAging($branchId);

        return [
            'from'          => $from,
            'to'            => $to,
            'sales'         => $sales,
            'sales_devices' => $this->saleDeviceLines($from, $to, $branchId),
            'inventory'   => $inventory,
            'imei'        => (object) $this->imeiSummary($branchId),
            'imei_lines'  => $this->imeiLines($branchId),
            'movement'    => $this->movement($from, $to, $branchId),
            'cash'        => $cash,
            'expenses'    => $expenses,
            'payables'    => $this->payables(),
            'receivables' => $this->receivables(),
            'receivable_invoices' => (new AnalyticsService())->receivableLines($branchId),
            'payable_purchases'   => (new AnalyticsService())->payableLines($branchId),
            'open_repairs'        => (new RepairService())->openLines($branchId),
            'faulty_devices'      => (new ImeiService())->faultyLines($branchId),
            'open_stock_counts'   => (new StockCountService())->openLines($branchId),
            'recent_returns'      => (new ReturnService())->recentLines($branchId),
            'pending_expenses'    => (new ExpenseService())->pendingLines($branchId),
            'pending_approvals'   => (new ApprovalService())->pendingLines($branchId),
            'wholesale_receivables' => (new AnalyticsService())->wholesaleReceivableLines($branchId),
            'recent_swaps'          => (new SwapService())->recentLines($branchId),
            'recent_sales'          => (new SaleService())->recentLines($branchId),
            'retail_receivables'    => (new AnalyticsService())->retailReceivableLines($branchId),
            'recent_payments'         => (new PaymentService())->recentLines($branchId),
            'supplier_payments'       => (new SupplierService())->recentPaymentLines($branchId),
            'recent_purchases'        => (new PurchaseService())->recentLines($branchId),
            'supplier_returns'        => (new SupplierService())->recentReturnLines($branchId),
            'payment_reversals'       => (new PaymentService())->reversalLines($branchId),
            'voided_sales'            => (new SaleService())->voidedLines($branchId),
            'recent_expenses'         => (new ExpenseService())->recentLines($branchId),
            'today_expenses'          => (new ExpenseService())->recentLines($branchId, 1),
            'recent_audit'            => (new AuditLogger())->recentLines($branchId),
            'recent_transfers'        => (new TransferService())->recentLines($branchId),
            'recent_stock_counts'     => (new StockCountService())->recentLines($branchId),
            'recent_repairs'          => (new RepairService())->recentLines($branchId),
            'recent_approvals'        => (new ApprovalService())->recentLines($branchId),
            'recent_customers'        => (new CustomerService())->recentLines($branchId),
            'recent_imeis'            => (new ImeiService())->recentLines($branchId),
            'staff_devices'           => (new AnalyticsService())->staffDeviceLines(14, $branchId),
            'low_stock'               => (new ProductService())->lowStockAlerts($branchId),
            'slow_movers'           => (new AnalyticsService())->slowMovers($branchId),
            'receivable_aging'      => $aging,
            'payable_aging'         => $payableAging,
            'top_products'          => (new AnalyticsService())->topProducts($days, $branchId),
            'payment_mix'           => (new AnalyticsService())->paymentMix($days, $branchId),
            'sale_types'            => (new AnalyticsService())->saleTypeMix($days, $branchId),
            'sales_trend'           => (new AnalyticsService())->salesTrend($days, $branchId),
            'imei_status_lines'     => $this->imeiStatusLines($branchId),
            'inventory_snapshot'    => $this->inventorySnapshot($branchId),
            'inventory_lines'       => $this->inventoryLines($branchId),
            'today_sales'           => (new SaleService())->recentLines($branchId, 1),
            'today_payments'        => (new PaymentService())->recentLines($branchId, 1),
            'today_returns'         => (new ReturnService())->recentLines($branchId, 1),
            'today_cash'            => $this->recentCash($branchId, 1),
            'expense_snapshot'      => (new ExpenseService())->snapshot($branchId),
            'today_purchases'       => (new PurchaseService())->recentLines($branchId, 1),
            'today_swaps'           => (new SwapService())->recentLines($branchId, 1),
            'today_supplier_payments' => (new SupplierService())->recentPaymentLines($branchId, 1),
            'today_imeis'           => (new ImeiService())->recentLines($branchId, 1),
            'intake_snapshot'       => $this->intakeSnapshot($branchId),
            'operations_snapshot'   => $this->operationsSnapshot($branchId),
            'today_transfers'       => (new TransferService())->recentLines($branchId, 1),
            'today_repairs'         => (new RepairService())->recentLines($branchId, 1),
            'today_audit'           => (new AuditLogger())->recentLines($branchId, 1),
            'receivables_snapshot'  => $this->receivablesSnapshot($branchId),
            'today_approvals'       => (new ApprovalService())->recentLines($branchId, 1),
            'today_customers'       => (new CustomerService())->recentLines($branchId, 1),
            'payables_snapshot'     => $this->payablesSnapshot($branchId),
            'today_supplier_returns' => (new SupplierService())->recentReturnLines($branchId, 1),
            'today_stock_counts'    => (new StockCountService())->recentLines($branchId, 1),
            'adjustments_snapshot'  => $this->adjustmentsSnapshot($branchId),
            'today_returns'         => (new ReturnService())->recentLines($branchId, 1),
            'today_reversals'       => (new PaymentService())->reversalLines($branchId, 1),
            'today_voided_sales'    => (new SaleService())->voidedLines($branchId, 1),
            'performance_snapshot'  => $this->performanceSnapshot($branchId),
            'today_alerts'          => (new NotifyService())->recentLines($branchId, 1),
            'staff_snapshot'        => $this->staffSnapshot($branchId),
            'movement_snapshot'     => $this->movementSnapshot($branchId),
            'ledger_snapshot'       => $this->ledgerSnapshot($branchId),
            'repair_snapshot'       => $this->repairSnapshot($branchId),
            'compliance_snapshot'   => $this->complianceSnapshot($branchId),
            'trade_snapshot'        => $this->tradeSnapshot($branchId),
            'aging_snapshot'        => $this->agingSnapshot($branchId),
            'executive_snapshot'    => $this->executiveSnapshot($branchId),
            'branch_snapshot'       => $this->branchSnapshot($branchId),
            'mix_snapshot'          => $this->mixSnapshot($branchId),
            'product_snapshot'      => $this->productSnapshot($branchId),
            'trend_snapshot'        => $this->trendSnapshot($branchId),
            'cashflow_snapshot'     => $this->cashflowSnapshot($branchId),
            'staff_device_snapshot' => $this->staffDeviceSnapshot($branchId),
            'stock_snapshot'        => $this->stockSnapshot($branchId),
            'imei_snapshot'         => $this->imeiSnapshot($branchId),
            'transfer_snapshot'     => $this->transferSnapshot($branchId),
            'purchase_snapshot'     => $this->purchaseSnapshot($branchId),
            'returns_snapshot'      => $this->returnsSnapshot($branchId),
            'faulty_snapshot'       => $this->faultySnapshot($branchId),
            'customer_snapshot'     => $this->customerSnapshot($branchId),
            'supplier_snapshot'     => $this->supplierSnapshot($branchId),
            'count_snapshot'        => $this->countSnapshot($branchId),
            'approval_snapshot'     => $this->approvalSnapshot($branchId),
            'audit_snapshot'        => $this->auditSnapshot($branchId),
            'collection_snapshot'   => $this->collectionSnapshot($branchId),
            'alert_snapshot'        => $this->alertSnapshot($branchId),
            'sales_snapshot'        => $this->salesSnapshot($branchId),
            'payment_snapshot'      => $this->paymentSnapshot($branchId),
            'swap_snapshot'         => $this->swapSnapshot($branchId),
            'return_snapshot'       => $this->returnSnapshot($branchId),
            'adjustment_snapshot'   => $this->adjustmentSnapshot($branchId),
            'procurement_snapshot'  => $this->procurementSnapshot($branchId),
            'receiving_snapshot'    => $this->receivingSnapshot($branchId),
            'payable_snapshot'      => $this->payableSnapshot($branchId),
            'receivable_snapshot'   => $this->receivableSnapshot($branchId),
            'workflow_snapshot'     => $this->workflowSnapshot($branchId),
            'transit_snapshot'      => $this->transitSnapshot($branchId),
            'stockflow_snapshot'    => $this->stockflowSnapshot($branchId),
            'service_snapshot'      => $this->serviceSnapshot($branchId),
            'countflow_snapshot'    => $this->countflowSnapshot($branchId),
            'approvalflow_snapshot' => $this->approvalflowSnapshot($branchId),
            'auditflow_snapshot'    => $this->auditflowSnapshot($branchId),
            'collectionflow_snapshot' => $this->collectionflowSnapshot($branchId),
            'alertflow_snapshot'      => $this->alertflowSnapshot($branchId),
            'expenseflow_snapshot'    => $this->expenseflowSnapshot($branchId),
            'performanceflow_snapshot' => $this->performanceflowSnapshot($branchId),
            'customerflow_snapshot'    => $this->customerflowSnapshot($branchId),
            'intakeflow_snapshot'      => $this->intakeflowSnapshot($branchId),
            'supplierflow_snapshot'    => $this->supplierflowSnapshot($branchId),
            'inventoryflow_snapshot'   => $this->inventoryflowSnapshot($branchId),
            'staffflow_snapshot'       => $this->staffflowSnapshot($branchId),
            'branchflow_snapshot'      => $this->branchflowSnapshot($branchId),
            'cashflowflow_snapshot'    => $this->cashflowflowSnapshot($branchId),
            'mixflow_snapshot'         => $this->mixflowSnapshot($branchId),
            'trendflow_snapshot'       => $this->trendflowSnapshot($branchId),
            'productflow_snapshot'     => $this->productflowSnapshot($branchId),
            'ledgerflow_snapshot'      => $this->ledgerflowSnapshot($branchId),
            'executiveflow_snapshot'   => $this->executiveflowSnapshot($branchId),
            'agingflow_snapshot'       => $this->agingflowSnapshot($branchId),
            'tradeflow_snapshot'       => $this->tradeflowSnapshot($branchId),
            'branches'    => $this->branchComparison($from, $to),
            'staff'       => $this->staffSales($from, $to, $branchId),
        ];
    }

    /**
     * @return array{csv?: string, html?: string, base64?: string, filename: string, format: string, title?: string}
     */
    public function export(string $type, string $from, string $to, ?int $branchId = null, string $format = 'csv'): array
    {
        $type = sanitize_key($type);
        if (!in_array($type, self::EXPORT_TYPES, true)) {
            throw new DomainException('Unknown report export.');
        }
        $format = sanitize_key($format);
        if ($format === 'sheet' || $format === 'xlsx' || $format === 'xls') {
            $format = 'csv';
        }
        if (!in_array($format, ['csv', 'pdf', 'docx'], true)) {
            $format = 'csv';
        }

        $pack = $this->pack($from, $to, $branchId);
        $csv  = new CsvExporter();
        $stamp = $from === $to ? $from : $from . '_to_' . $to;

        $result = match ($type) {
            'sales' => [
                'filename' => 'atoms-sales-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Invoice', 'Posted', 'Type', 'Customer', 'IMEI', 'Product', 'Variant', 'Line price', 'Invoice total', 'Paid', 'Due'],
                    array_map(fn($l) => [
                        $l['invoice_number'],
                        $l['posted_at'],
                        $l['sale_type'],
                        $l['customer_name'] ?? '',
                        $l['imei'],
                        $l['product_name'],
                        $l['variant_label'] ?? '',
                        $this->naira((int) $l['selling_price']),
                        $this->naira((int) $l['total']),
                        $this->naira((int) $l['paid_amount']),
                        $this->naira((int) $l['due_amount']),
                    ], $pack['sales_devices'])
                ),
            ],
            'inventory' => [
                'filename' => 'atoms-inventory-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Product', 'Variant', 'Brand', 'Branch', 'Qty', 'Valuation'],
                    array_map(function ($r) {
                        $labels = new VariantLabel();

                        return [
                            $r['name'],
                            $labels->format($r),
                            $r['brand'],
                            $r['branch_name'],
                            (int) $r['qty'],
                            $this->naira((int) $r['valuation']),
                        ];
                    }, $pack['inventory']['rows'])
                ),
            ],
            'inventory_valuation' => [
                'filename' => 'atoms-inventory-valuation-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Product', 'Variant', 'Brand', 'Qty', 'Valuation'],
                    array_map(fn($r) => [
                        $r['name'] ?? '',
                        $r['variant_label'] ?? '',
                        $r['brand'] ?? '',
                        (int) ($r['total'] ?? 0),
                        $this->naira((int) ($r['valuation'] ?? 0)),
                    ], $pack['inventory_lines'])
                ),
            ],
            'expenses' => [
                'filename' => 'atoms-expenses-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Posted', 'Category', 'Vendor', 'Description', 'Amount'],
                    array_map(fn($l) => [
                        $l['posted_at'] ?? '',
                        $l['category'],
                        $l['vendor'] ?? '',
                        $l['description'] ?? '',
                        $this->naira((int) $l['amount']),
                    ], $pack['expenses']['lines'])
                ),
            ],
            'expense_snapshot' => [
                'filename' => 'atoms-expense-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Pending approval', (int) ($pack['expense_snapshot']['pending_count'] ?? 0), $this->naira((int) ($pack['expense_snapshot']['pending_total'] ?? 0))],
                        ['Posted today', (int) ($pack['expense_snapshot']['posted_today_count'] ?? 0), $this->naira((int) ($pack['expense_snapshot']['posted_today_total'] ?? 0))],
                        ['Posted (14 days)', (int) ($pack['expense_snapshot']['posted_14d_count'] ?? 0), $this->naira((int) ($pack['expense_snapshot']['posted_14d_total'] ?? 0))],
                        ['Categories (14 days)', (int) ($pack['expense_snapshot']['category_count_14d'] ?? 0), $this->naira((int) ($pack['expense_snapshot']['top_category_total_14d'] ?? 0))],
                        ['Top category (14 days)', 1, (string) ($pack['expense_snapshot']['top_category_14d'] ?? '')],
                        ['Largest pending', 1, $this->naira((int) ($pack['expense_snapshot']['largest_pending_amount'] ?? 0))],
                    ]
                ),
            ],
            'intake_snapshot' => [
                'filename' => 'atoms-intake-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Purchases today', (int) ($pack['intake_snapshot']['purchase_count'] ?? 0), $this->naira((int) ($pack['intake_snapshot']['purchase_total'] ?? 0))],
                        ['Swaps today', (int) ($pack['intake_snapshot']['swap_count'] ?? 0), $this->naira((int) ($pack['intake_snapshot']['swap_collected'] ?? 0))],
                        ['IMEIs registered today', (int) ($pack['intake_snapshot']['imei_count'] ?? 0), ''],
                        ['Supplier payments today', (int) ($pack['intake_snapshot']['supplier_payment_count'] ?? 0), $this->naira((int) ($pack['intake_snapshot']['supplier_payment_total'] ?? 0))],
                        ['Supplier returns today', (int) ($pack['intake_snapshot']['supplier_return_count'] ?? 0), $this->naira((int) ($pack['intake_snapshot']['supplier_return_total'] ?? 0))],
                    ]
                ),
            ],
            'operations_snapshot' => [
                'filename' => 'atoms-operations-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Queue', 'Count', 'Amount'],
                    [
                        ['Open repairs', (int) ($pack['operations_snapshot']['open_repair_count'] ?? 0), ''],
                        ['Pending approvals', (int) ($pack['operations_snapshot']['pending_approval_count'] ?? 0), ''],
                        ['In transit', (int) ($pack['operations_snapshot']['in_transit_count'] ?? 0), ''],
                        ['Open stock counts', (int) ($pack['operations_snapshot']['open_stock_count_count'] ?? 0), ''],
                        ['Faulty devices', (int) ($pack['operations_snapshot']['faulty_device_count'] ?? 0), ''],
                        ['Pending expenses', (int) ($pack['operations_snapshot']['pending_expense_count'] ?? 0), $this->naira((int) ($pack['operations_snapshot']['pending_expense_total'] ?? 0))],
                        ['Open purchases', (int) ($pack['operations_snapshot']['open_purchase_count'] ?? 0), $this->naira((int) ($pack['operations_snapshot']['open_purchase_total'] ?? 0))],
                        ['Stuck repairs', (int) ($pack['operations_snapshot']['stuck_repair_count'] ?? 0), ''],
                        ['Stuck transfers', (int) ($pack['operations_snapshot']['stuck_transfer_count'] ?? 0), ''],
                        ['Stuck faulty devices', (int) ($pack['operations_snapshot']['stuck_faulty_count'] ?? 0), ''],
                    ]
                ),
            ],
            'receivables_snapshot' => [
                'filename' => 'atoms-receivables-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Overdue invoices', (int) ($pack['receivables_snapshot']['overdue_count'] ?? 0), $this->naira((int) ($pack['receivables_snapshot']['overdue_total'] ?? 0))],
                        ['Open retail invoices', (int) ($pack['receivables_snapshot']['retail_count'] ?? 0), $this->naira((int) ($pack['receivables_snapshot']['retail_total'] ?? 0))],
                        ['Open wholesale invoices', (int) ($pack['receivables_snapshot']['wholesale_count'] ?? 0), $this->naira((int) ($pack['receivables_snapshot']['wholesale_total'] ?? 0))],
                        ['All open invoices', (int) ($pack['receivables_snapshot']['open_invoice_count'] ?? 0), $this->naira((int) ($pack['receivables_snapshot']['open_invoice_total'] ?? 0))],
                        ['Collections today', (int) ($pack['receivables_snapshot']['collection_count'] ?? 0), $this->naira((int) ($pack['receivables_snapshot']['collection_total'] ?? 0))],
                        ['Unread alerts', (int) ($pack['receivables_snapshot']['notify_unread'] ?? 0), ''],
                    ]
                ),
            ],
            'payables_snapshot' => [
                'filename' => 'atoms-payables-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Open payables', (int) ($pack['payables_snapshot']['open_payable_count'] ?? 0), $this->naira((int) ($pack['payables_snapshot']['open_payable_total'] ?? 0))],
                        ['Aged payables', (int) ($pack['payables_snapshot']['aged_payable_count'] ?? 0), $this->naira((int) ($pack['payables_snapshot']['aged_payable_total'] ?? 0))],
                        ['Open purchase orders', (int) ($pack['payables_snapshot']['open_purchase_count'] ?? 0), $this->naira((int) ($pack['payables_snapshot']['open_purchase_total'] ?? 0))],
                        ['Supplier payments today', (int) ($pack['payables_snapshot']['supplier_payment_count'] ?? 0), $this->naira((int) ($pack['payables_snapshot']['supplier_payment_total'] ?? 0))],
                        ['Supplier returns today', (int) ($pack['payables_snapshot']['supplier_return_count'] ?? 0), $this->naira((int) ($pack['payables_snapshot']['supplier_return_total'] ?? 0))],
                    ]
                ),
            ],
            'adjustments_snapshot' => [
                'filename' => 'atoms-adjustments-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Returns today', (int) ($pack['adjustments_snapshot']['return_count'] ?? 0), $this->naira((int) ($pack['adjustments_snapshot']['return_total'] ?? 0))],
                        ['Payment reversals today', (int) ($pack['adjustments_snapshot']['reversal_count'] ?? 0), $this->naira((int) ($pack['adjustments_snapshot']['reversal_total'] ?? 0))],
                        ['Voided sales today', (int) ($pack['adjustments_snapshot']['voided_count'] ?? 0), $this->naira((int) ($pack['adjustments_snapshot']['voided_total'] ?? 0))],
                    ]
                ),
            ],
            'performance_snapshot' => [
                'filename' => 'atoms-performance-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Low stock alerts', (int) ($pack['performance_snapshot']['low_stock_count'] ?? 0), ''],
                        ['Slow movers', (int) ($pack['performance_snapshot']['slow_mover_count'] ?? 0), ''],
                        ['Top sellers (14d)', (int) ($pack['performance_snapshot']['top_seller_count'] ?? 0), $this->naira((int) ($pack['performance_snapshot']['top_seller_revenue'] ?? 0))],
                        ['Top seller units (14d)', (int) ($pack['performance_snapshot']['top_seller_units'] ?? 0), ''],
                        ['Unread alerts', (int) ($pack['performance_snapshot']['notify_unread'] ?? 0), ''],
                        ['Alerts today', (int) ($pack['performance_snapshot']['alert_today_count'] ?? 0), ''],
                    ]
                ),
            ],
            'staff_snapshot' => [
                'filename' => 'atoms-staff-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Staff with sales (14d)', (int) ($pack['staff_snapshot']['staff_count'] ?? 0), ''],
                        ['Staff invoices (14d)', (int) ($pack['staff_snapshot']['staff_invoices'] ?? 0), $this->naira((int) ($pack['staff_snapshot']['staff_revenue'] ?? 0))],
                        ['Staff profit (14d)', (int) ($pack['staff_snapshot']['staff_invoices'] ?? 0), $this->naira((int) ($pack['staff_snapshot']['staff_profit'] ?? 0))],
                        ['Top staff revenue (14d)', 1, $this->naira((int) ($pack['staff_snapshot']['top_staff_revenue'] ?? 0))],
                        ['Active branches (14d)', (int) ($pack['staff_snapshot']['branch_count'] ?? 0), $this->naira((int) ($pack['staff_snapshot']['branch_revenue'] ?? 0))],
                        ['Top branch revenue (14d)', 1, $this->naira((int) ($pack['staff_snapshot']['top_branch_revenue'] ?? 0))],
                        ['Sales today', (int) ($pack['staff_snapshot']['sales_today_count'] ?? 0), $this->naira((int) ($pack['staff_snapshot']['sales_today_total'] ?? 0))],
                    ]
                ),
            ],
            'movement_snapshot' => [
                'filename' => 'atoms-movement-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Transfers today', (int) ($pack['movement_snapshot']['transfer_count'] ?? 0), ''],
                        ['IMEIs registered today', (int) ($pack['movement_snapshot']['imei_count'] ?? 0), ''],
                        ['Stock counts posted today', (int) ($pack['movement_snapshot']['stock_count_count'] ?? 0), ''],
                        ['In transit now', (int) ($pack['movement_snapshot']['in_transit_count'] ?? 0), ''],
                        ['Stuck transfers', (int) ($pack['movement_snapshot']['stuck_transfer_count'] ?? 0), ''],
                        ['IMEI events (14d)', (int) ($pack['movement_snapshot']['movement_14d_count'] ?? 0), ''],
                        ['Sale events (14d)', (int) ($pack['movement_snapshot']['sale_event_count'] ?? 0), ''],
                        ['Transfer events (14d)', (int) ($pack['movement_snapshot']['transfer_event_count'] ?? 0), ''],
                        ['Intake events (14d)', (int) ($pack['movement_snapshot']['intake_event_count'] ?? 0), ''],
                    ]
                ),
            ],
            'ledger_snapshot' => [
                'filename' => 'atoms-ledger-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Customer receivables', (int) ($pack['ledger_snapshot']['receivable_party_count'] ?? 0), $this->naira((int) ($pack['ledger_snapshot']['receivable_total'] ?? 0))],
                        ['Supplier payables', (int) ($pack['ledger_snapshot']['payable_party_count'] ?? 0), $this->naira((int) ($pack['ledger_snapshot']['payable_total'] ?? 0))],
                        ['Overdue invoices', (int) ($pack['ledger_snapshot']['overdue_count'] ?? 0), $this->naira((int) ($pack['ledger_snapshot']['overdue_total'] ?? 0))],
                        ['Open payables', (int) ($pack['ledger_snapshot']['payable_party_count'] ?? 0), $this->naira((int) ($pack['ledger_snapshot']['open_payable_total'] ?? 0))],
                        ['Cash in (14d)', 1, $this->naira((int) ($pack['ledger_snapshot']['cash_in_14d'] ?? 0))],
                        ['Net cash (14d)', 1, $this->naira((int) ($pack['ledger_snapshot']['cash_net_14d'] ?? 0))],
                        ['Net cash today', 1, $this->naira((int) ($pack['ledger_snapshot']['cash_net_today'] ?? 0))],
                        ['Sales (14d)', 1, $this->naira((int) ($pack['ledger_snapshot']['sales_14d'] ?? 0))],
                        ['Collected (14d)', 1, $this->naira((int) ($pack['ledger_snapshot']['collected_14d'] ?? 0))],
                        ['Collections today', 1, $this->naira((int) ($pack['ledger_snapshot']['collections_today'] ?? 0))],
                    ]
                ),
            ],
            'repair_snapshot' => [
                'filename' => 'atoms-repair-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Open repairs', (int) ($pack['repair_snapshot']['open_repair_count'] ?? 0), ''],
                        ['Stuck repairs', (int) ($pack['repair_snapshot']['stuck_repair_count'] ?? 0), ''],
                        ['Completed today', (int) ($pack['repair_snapshot']['completed_today_count'] ?? 0), ''],
                        ['Completed (14d)', (int) ($pack['repair_snapshot']['completed_14d_count'] ?? 0), ''],
                        ['Faulty devices', (int) ($pack['repair_snapshot']['faulty_device_count'] ?? 0), ''],
                        ['Stuck faulty devices', (int) ($pack['repair_snapshot']['stuck_faulty_count'] ?? 0), ''],
                    ]
                ),
            ],
            'compliance_snapshot' => [
                'filename' => 'atoms-compliance-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Pending approvals', (int) ($pack['compliance_snapshot']['pending_approval_count'] ?? 0), ''],
                        ['Approvals reviewed today', (int) ($pack['compliance_snapshot']['approval_reviewed_today_count'] ?? 0), ''],
                        ['Audit events today', (int) ($pack['compliance_snapshot']['audit_today_count'] ?? 0), ''],
                        ['Audit events (14d)', (int) ($pack['compliance_snapshot']['audit_14d_count'] ?? 0), ''],
                        ['New customers today', (int) ($pack['compliance_snapshot']['new_customer_today_count'] ?? 0), ''],
                        ['New customers (14d)', (int) ($pack['compliance_snapshot']['new_customer_14d_count'] ?? 0), ''],
                    ]
                ),
            ],
            'trade_snapshot' => [
                'filename' => 'atoms-trade-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Wholesale owing', (int) ($pack['trade_snapshot']['wholesale_owing_count'] ?? 0), $this->naira((int) ($pack['trade_snapshot']['wholesale_owing_total'] ?? 0))],
                        ['Retail owing', (int) ($pack['trade_snapshot']['retail_owing_count'] ?? 0), $this->naira((int) ($pack['trade_snapshot']['retail_owing_total'] ?? 0))],
                        ['Swaps today', (int) ($pack['trade_snapshot']['swap_today_count'] ?? 0), $this->naira((int) ($pack['trade_snapshot']['swap_collected_today'] ?? 0))],
                        ['Swaps (14d)', (int) ($pack['trade_snapshot']['swap_14d_count'] ?? 0), $this->naira((int) ($pack['trade_snapshot']['swap_collected_14d'] ?? 0))],
                        ['Retail sales (14d)', (int) ($pack['trade_snapshot']['retail_invoices_14d'] ?? 0), $this->naira((int) ($pack['trade_snapshot']['retail_sales_14d'] ?? 0))],
                        ['Wholesale sales (14d)', (int) ($pack['trade_snapshot']['wholesale_invoices_14d'] ?? 0), $this->naira((int) ($pack['trade_snapshot']['wholesale_sales_14d'] ?? 0))],
                    ]
                ),
            ],
            'aging_snapshot' => [
                'filename' => 'atoms-aging-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Open receivables', (int) ($pack['aging_snapshot']['receivable_line_count'] ?? 0), $this->naira((int) ($pack['aging_snapshot']['receivable_total'] ?? 0))],
                        ['Receivables 0–30 days', 1, $this->naira((int) ($pack['aging_snapshot']['receivable_0_30'] ?? 0))],
                        ['Receivables 90+ days', 1, $this->naira((int) ($pack['aging_snapshot']['receivable_90_plus'] ?? 0))],
                        ['Open payables', (int) ($pack['aging_snapshot']['payable_line_count'] ?? 0), $this->naira((int) ($pack['aging_snapshot']['payable_total'] ?? 0))],
                        ['Payables 0–30 days', 1, $this->naira((int) ($pack['aging_snapshot']['payable_0_30'] ?? 0))],
                        ['Payables 90+ days', 1, $this->naira((int) ($pack['aging_snapshot']['payable_90_plus'] ?? 0))],
                        ['Payment methods (14d)', (int) ($pack['aging_snapshot']['payment_method_count'] ?? 0), $this->naira((int) ($pack['aging_snapshot']['payment_collected_14d'] ?? 0))],
                    ]
                ),
            ],
            'executive_snapshot' => [
                'filename' => 'atoms-executive-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Sales today', (int) ($pack['executive_snapshot']['sales_today_count'] ?? 0), $this->naira((int) ($pack['executive_snapshot']['sales_today_total'] ?? 0))],
                        ['Sales (14d)', 1, $this->naira((int) ($pack['executive_snapshot']['sales_14d'] ?? 0))],
                        ['Net cash today', 1, $this->naira((int) ($pack['executive_snapshot']['cash_net_today'] ?? 0))],
                        ['Net cash (14d)', 1, $this->naira((int) ($pack['executive_snapshot']['cash_net_14d'] ?? 0))],
                        ['Customer receivables', (int) ($pack['executive_snapshot']['receivable_party_count'] ?? 0), $this->naira((int) ($pack['executive_snapshot']['receivable_total'] ?? 0))],
                        ['Supplier payables', (int) ($pack['executive_snapshot']['payable_party_count'] ?? 0), $this->naira((int) ($pack['executive_snapshot']['payable_total'] ?? 0))],
                        ['Overdue invoices', (int) ($pack['executive_snapshot']['overdue_count'] ?? 0), $this->naira((int) ($pack['executive_snapshot']['overdue_total'] ?? 0))],
                        ['Collections today', 1, $this->naira((int) ($pack['executive_snapshot']['collections_today'] ?? 0))],
                        ['Open repairs', (int) ($pack['executive_snapshot']['open_repair_count'] ?? 0), ''],
                        ['Pending approvals', (int) ($pack['executive_snapshot']['pending_approval_count'] ?? 0), ''],
                        ['In transit', (int) ($pack['executive_snapshot']['in_transit_count'] ?? 0), ''],
                        ['Available stock', (int) ($pack['executive_snapshot']['available_qty'] ?? 0), $this->naira((int) ($pack['executive_snapshot']['available_value'] ?? 0))],
                        ['Low stock alerts', (int) ($pack['executive_snapshot']['low_stock_count'] ?? 0), ''],
                        ['Unread alerts', (int) ($pack['executive_snapshot']['notify_unread'] ?? 0), ''],
                    ]
                ),
            ],
            'branch_snapshot' => [
                'filename' => 'atoms-branch-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Active branches', (int) ($pack['branch_snapshot']['branch_count'] ?? 0), ''],
                        ['Branches with sales (14d)', (int) ($pack['branch_snapshot']['active_branch_count'] ?? 0), ''],
                        ['Invoices (14d)', (int) ($pack['branch_snapshot']['invoice_count'] ?? 0), $this->naira((int) ($pack['branch_snapshot']['revenue_14d'] ?? 0))],
                        ['Collected (14d)', 1, $this->naira((int) ($pack['branch_snapshot']['collected_14d'] ?? 0))],
                        ['Profit (14d)', 1, $this->naira((int) ($pack['branch_snapshot']['profit_14d'] ?? 0))],
                        ['Outstanding due', 1, $this->naira((int) ($pack['branch_snapshot']['due_total'] ?? 0))],
                        ['Network stock', (int) ($pack['branch_snapshot']['stock_qty'] ?? 0), $this->naira((int) ($pack['branch_snapshot']['stock_value'] ?? 0))],
                        ['Top branch revenue (14d)', 1, $this->naira((int) ($pack['branch_snapshot']['top_branch_revenue'] ?? 0))],
                        ['Top branch profit (14d)', 1, $this->naira((int) ($pack['branch_snapshot']['top_branch_profit'] ?? 0))],
                    ]
                ),
            ],
            'mix_snapshot' => [
                'filename' => 'atoms-mix-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Payment methods (14d)', (int) ($pack['mix_snapshot']['payment_method_count'] ?? 0), $this->naira((int) ($pack['mix_snapshot']['payment_collected_14d'] ?? 0))],
                        ['Top payment method', 1, $this->naira((int) ($pack['mix_snapshot']['top_payment_collected'] ?? 0))],
                        ['Retail invoices (14d)', (int) ($pack['mix_snapshot']['retail_invoices'] ?? 0), $this->naira((int) ($pack['mix_snapshot']['retail_revenue'] ?? 0))],
                        ['Wholesale invoices (14d)', (int) ($pack['mix_snapshot']['wholesale_invoices'] ?? 0), $this->naira((int) ($pack['mix_snapshot']['wholesale_revenue'] ?? 0))],
                        ['Total invoices (14d)', (int) ($pack['mix_snapshot']['invoice_count'] ?? 0), $this->naira((int) ($pack['mix_snapshot']['sales_14d'] ?? 0))],
                        ['Sale channels (14d)', (int) ($pack['mix_snapshot']['sale_type_count'] ?? 0), ''],
                    ]
                ),
            ],
            'product_snapshot' => [
                'filename' => 'atoms-product-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Top sellers (14d)', (int) ($pack['product_snapshot']['top_seller_count'] ?? 0), $this->naira((int) ($pack['product_snapshot']['top_seller_revenue'] ?? 0))],
                        ['Top seller units (14d)', (int) ($pack['product_snapshot']['top_seller_units'] ?? 0), $this->naira((int) ($pack['product_snapshot']['top_seller_profit'] ?? 0))],
                        ['Top product profit (14d)', 1, $this->naira((int) ($pack['product_snapshot']['top_product_profit'] ?? 0))],
                        ['Slow movers', (int) ($pack['product_snapshot']['slow_mover_count'] ?? 0), ''],
                        ['Slow mover units', (int) ($pack['product_snapshot']['slow_mover_qty'] ?? 0), ''],
                    ]
                ),
            ],
            'trend_snapshot' => [
                'filename' => 'atoms-trend-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Active days (14d)', (int) ($pack['trend_snapshot']['active_day_count'] ?? 0), ''],
                        ['Invoices (14d)', (int) ($pack['trend_snapshot']['invoice_count'] ?? 0), $this->naira((int) ($pack['trend_snapshot']['sales_14d'] ?? 0))],
                        ['Collected (14d)', 1, $this->naira((int) ($pack['trend_snapshot']['collected_14d'] ?? 0))],
                        ['Sales today', (int) ($pack['trend_snapshot']['invoices_today'] ?? 0), $this->naira((int) ($pack['trend_snapshot']['sales_today'] ?? 0))],
                        ['Best day', 1, $this->naira((int) ($pack['trend_snapshot']['best_day_net'] ?? 0))],
                        ['Average daily sales', 1, $this->naira((int) ($pack['trend_snapshot']['avg_daily_net'] ?? 0))],
                    ]
                ),
            ],
            'cashflow_snapshot' => [
                'filename' => 'atoms-cashflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Cash in (14d)', 1, $this->naira((int) ($pack['cashflow_snapshot']['inflows_14d'] ?? 0))],
                        ['At sale (14d)', 1, $this->naira((int) ($pack['cashflow_snapshot']['at_sale_14d'] ?? 0))],
                        ['Collections (14d)', 1, $this->naira((int) ($pack['cashflow_snapshot']['collections_14d'] ?? 0))],
                        ['Expenses (14d)', 1, $this->naira((int) ($pack['cashflow_snapshot']['expenses_14d'] ?? 0))],
                        ['Supplier payments (14d)', 1, $this->naira((int) ($pack['cashflow_snapshot']['supplier_payments_14d'] ?? 0))],
                        ['Refunds (14d)', 1, $this->naira((int) ($pack['cashflow_snapshot']['refunds_14d'] ?? 0))],
                        ['Net cash (14d)', 1, $this->naira((int) ($pack['cashflow_snapshot']['net_14d'] ?? 0))],
                        ['Cash in today', 1, $this->naira((int) ($pack['cashflow_snapshot']['inflows_today'] ?? 0))],
                        ['Outflows today', 1, $this->naira((int) ($pack['cashflow_snapshot']['outflows_today'] ?? 0))],
                        ['Net cash today', 1, $this->naira((int) ($pack['cashflow_snapshot']['net_today'] ?? 0))],
                    ]
                ),
            ],
            'staff_device_snapshot' => [
                'filename' => 'atoms-staff-device-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Devices sold (14d)', (int) ($pack['staff_device_snapshot']['device_line_count'] ?? 0), $this->naira((int) ($pack['staff_device_snapshot']['revenue_total'] ?? 0))],
                        ['Staff selling (14d)', (int) ($pack['staff_device_snapshot']['staff_count'] ?? 0), ''],
                        ['Invoices (14d)', (int) ($pack['staff_device_snapshot']['invoice_count'] ?? 0), ''],
                        ['Top staff units (14d)', (int) ($pack['staff_device_snapshot']['top_staff_units'] ?? 0), ''],
                        ['Devices sold today', (int) ($pack['staff_device_snapshot']['devices_today'] ?? 0), $this->naira((int) ($pack['staff_device_snapshot']['revenue_today'] ?? 0))],
                    ]
                ),
            ],
            'stock_snapshot' => [
                'filename' => 'atoms-stock-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Low stock alerts', (int) ($pack['stock_snapshot']['low_stock_count'] ?? 0), ''],
                        ['Low stock units', (int) ($pack['stock_snapshot']['low_stock_qty'] ?? 0), ''],
                        ['Lowest available', (int) ($pack['stock_snapshot']['lowest_available'] ?? 0), ''],
                        ['Available stock', (int) ($pack['stock_snapshot']['available_qty'] ?? 0), $this->naira((int) ($pack['stock_snapshot']['available_value'] ?? 0))],
                        ['Faulty units', (int) ($pack['stock_snapshot']['faulty_qty'] ?? 0), ''],
                        ['Accessory units', (int) ($pack['stock_snapshot']['quantity_qty'] ?? 0), $this->naira((int) ($pack['stock_snapshot']['quantity_value'] ?? 0))],
                        ['Accessory SKUs', (int) ($pack['stock_snapshot']['quantity_sku_count'] ?? 0), ''],
                        ['Inbound reserved', (int) ($pack['stock_snapshot']['inbound_reserved_count'] ?? 0), ''],
                        ['IMEI on hand', (int) ($pack['stock_snapshot']['imei_total'] ?? 0), ''],
                        ['IMEI statuses', (int) ($pack['stock_snapshot']['status_count'] ?? 0), ''],
                    ]
                ),
            ],
            'imei_snapshot' => [
                'filename' => 'atoms-imei-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['IMEI on hand', (int) ($pack['imei_snapshot']['imei_total'] ?? 0), ''],
                        ['Available', (int) ($pack['imei_snapshot']['available_qty'] ?? 0), ''],
                        ['Sold', (int) ($pack['imei_snapshot']['sold_qty'] ?? 0), ''],
                        ['Faulty', (int) ($pack['imei_snapshot']['faulty_qty'] ?? 0), ''],
                        ['Reserved', (int) ($pack['imei_snapshot']['reserved_qty'] ?? 0), ''],
                        ['Under repair', (int) ($pack['imei_snapshot']['under_repair_qty'] ?? 0), ''],
                        ['In transit', (int) ($pack['imei_snapshot']['transferred_qty'] ?? 0), ''],
                        ['Registered today', (int) ($pack['imei_snapshot']['registered_today'] ?? 0), ''],
                    ]
                ),
            ],
            'transfer_snapshot' => [
                'filename' => 'atoms-transfer-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['In transit now', (int) ($pack['transfer_snapshot']['in_transit_count'] ?? 0), ''],
                        ['Devices in transit', (int) ($pack['transfer_snapshot']['in_transit_devices'] ?? 0), ''],
                        ['Stuck transfers', (int) ($pack['transfer_snapshot']['stuck_transfer_count'] ?? 0), ''],
                        ['Stuck devices', (int) ($pack['transfer_snapshot']['stuck_device_count'] ?? 0), ''],
                        ['Transfers today', (int) ($pack['transfer_snapshot']['transfer_count_today'] ?? 0), ''],
                        ['Dispatched today', (int) ($pack['transfer_snapshot']['dispatched_today'] ?? 0), ''],
                        ['Received today', (int) ($pack['transfer_snapshot']['received_today'] ?? 0), ''],
                        ['Outbound in transit', (int) ($pack['transfer_snapshot']['outbound_in_transit'] ?? 0), ''],
                        ['Inbound in transit', (int) ($pack['transfer_snapshot']['inbound_in_transit'] ?? 0), ''],
                    ]
                ),
            ],
            'purchase_snapshot' => [
                'filename' => 'atoms-purchase-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Open purchase orders', (int) ($pack['purchase_snapshot']['open_po_count'] ?? 0), $this->naira((int) ($pack['purchase_snapshot']['open_po_total'] ?? 0))],
                        ['Pending units', (int) ($pack['purchase_snapshot']['pending_units'] ?? 0), ''],
                        ['Ordered POs', (int) ($pack['purchase_snapshot']['ordered_count'] ?? 0), ''],
                        ['Inspecting POs', (int) ($pack['purchase_snapshot']['inspecting_count'] ?? 0), ''],
                        ['Purchases today', (int) ($pack['purchase_snapshot']['purchase_count_today'] ?? 0), $this->naira((int) ($pack['purchase_snapshot']['purchase_total_today'] ?? 0))],
                        ['Units received today', (int) ($pack['purchase_snapshot']['purchase_units_today'] ?? 0), ''],
                    ]
                ),
            ],
            'returns_snapshot' => [
                'filename' => 'atoms-returns-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Returns today', (int) ($pack['returns_snapshot']['return_count_today'] ?? 0), $this->naira((int) ($pack['returns_snapshot']['return_total_today'] ?? 0))],
                        ['Returns (14d)', (int) ($pack['returns_snapshot']['return_count_14d'] ?? 0), $this->naira((int) ($pack['returns_snapshot']['return_total_14d'] ?? 0))],
                        ['Swaps today', (int) ($pack['returns_snapshot']['swap_count_today'] ?? 0), $this->naira((int) ($pack['returns_snapshot']['swap_collected_today'] ?? 0))],
                        ['Swaps (14d)', (int) ($pack['returns_snapshot']['swap_count_14d'] ?? 0), $this->naira((int) ($pack['returns_snapshot']['swap_collected_14d'] ?? 0))],
                        ['Payment reversals today', (int) ($pack['returns_snapshot']['reversal_count_today'] ?? 0), $this->naira((int) ($pack['returns_snapshot']['reversal_total_today'] ?? 0))],
                        ['Voided sales today', (int) ($pack['returns_snapshot']['voided_count_today'] ?? 0), $this->naira((int) ($pack['returns_snapshot']['voided_total_today'] ?? 0))],
                    ]
                ),
            ],
            'faulty_snapshot' => [
                'filename' => 'atoms-faulty-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Faulty devices', (int) ($pack['faulty_snapshot']['faulty_device_count'] ?? 0), ''],
                        ['Stuck faulty devices', (int) ($pack['faulty_snapshot']['stuck_faulty_count'] ?? 0), ''],
                        ['Under repair (IMEI)', (int) ($pack['faulty_snapshot']['under_repair_qty'] ?? 0), ''],
                        ['Returned (IMEI)', (int) ($pack['faulty_snapshot']['returned_qty'] ?? 0), ''],
                        ['Open repairs', (int) ($pack['faulty_snapshot']['open_repair_count'] ?? 0), ''],
                        ['Stuck repairs', (int) ($pack['faulty_snapshot']['stuck_repair_count'] ?? 0), ''],
                        ['Repairs completed today', (int) ($pack['faulty_snapshot']['repair_completed_today'] ?? 0), ''],
                        ['Repairs completed (14d)', (int) ($pack['faulty_snapshot']['repair_completed_14d'] ?? 0), ''],
                    ]
                ),
            ],
            'customer_snapshot' => [
                'filename' => 'atoms-customer-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['New customers today', (int) ($pack['customer_snapshot']['new_customers_today'] ?? 0), ''],
                        ['New customers (14d)', (int) ($pack['customer_snapshot']['new_customers_14d'] ?? 0), ''],
                        ['Customers owing', (int) ($pack['customer_snapshot']['owing_customer_count'] ?? 0), $this->naira((int) ($pack['customer_snapshot']['receivable_total'] ?? 0))],
                        ['Overdue invoices', (int) ($pack['customer_snapshot']['overdue_count'] ?? 0), $this->naira((int) ($pack['customer_snapshot']['overdue_total'] ?? 0))],
                        ['Retail owing', (int) ($pack['customer_snapshot']['retail_owing_count'] ?? 0), ''],
                        ['Wholesale owing', (int) ($pack['customer_snapshot']['wholesale_owing_count'] ?? 0), ''],
                    ]
                ),
            ],
            'supplier_snapshot' => [
                'filename' => 'atoms-supplier-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Suppliers owing', (int) ($pack['supplier_snapshot']['owing_supplier_count'] ?? 0), $this->naira((int) ($pack['supplier_snapshot']['payable_total'] ?? 0))],
                        ['Open payables', (int) ($pack['supplier_snapshot']['open_payable_count'] ?? 0), $this->naira((int) ($pack['supplier_snapshot']['open_payable_total'] ?? 0))],
                        ['Aged payables', (int) ($pack['supplier_snapshot']['aged_payable_count'] ?? 0), $this->naira((int) ($pack['supplier_snapshot']['aged_payable_total'] ?? 0))],
                        ['Open purchase orders', (int) ($pack['supplier_snapshot']['open_po_count'] ?? 0), $this->naira((int) ($pack['supplier_snapshot']['open_po_total'] ?? 0))],
                        ['Supplier payments today', (int) ($pack['supplier_snapshot']['supplier_payment_count_today'] ?? 0), $this->naira((int) ($pack['supplier_snapshot']['supplier_payment_total_today'] ?? 0))],
                        ['Supplier returns today', (int) ($pack['supplier_snapshot']['supplier_return_count_today'] ?? 0), $this->naira((int) ($pack['supplier_snapshot']['supplier_return_total_today'] ?? 0))],
                    ]
                ),
            ],
            'count_snapshot' => [
                'filename' => 'atoms-count-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Units'],
                    [
                        ['Open stock counts', (int) ($pack['count_snapshot']['open_count_count'] ?? 0), ''],
                        ['Pending approval', (int) ($pack['count_snapshot']['pending_approval_count'] ?? 0), ''],
                        ['Open missing units', (int) ($pack['count_snapshot']['open_missing_units'] ?? 0), ''],
                        ['Open extra units', (int) ($pack['count_snapshot']['open_extra_units'] ?? 0), ''],
                        ['Posted today', (int) ($pack['count_snapshot']['posted_today_count'] ?? 0), (int) ($pack['count_snapshot']['missing_units_today'] ?? 0)],
                        ['Posted (14 days)', (int) ($pack['count_snapshot']['posted_14d_count'] ?? 0), (int) ($pack['count_snapshot']['missing_units_14d'] ?? 0)],
                    ]
                ),
            ],
            'approval_snapshot' => [
                'filename' => 'atoms-approval-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Pending approvals', (int) ($pack['approval_snapshot']['pending_count'] ?? 0), ''],
                        ['Sell below minimum', (int) ($pack['approval_snapshot']['price_override_count'] ?? 0), ''],
                        ['Expense over threshold', (int) ($pack['approval_snapshot']['expense_count'] ?? 0), ''],
                        ['Stock count variance', (int) ($pack['approval_snapshot']['stock_variance_count'] ?? 0), ''],
                        ['Reviewed today', (int) ($pack['approval_snapshot']['reviewed_today_count'] ?? 0), ''],
                        ['Approved today', (int) ($pack['approval_snapshot']['approved_today_count'] ?? 0), ''],
                        ['Rejected today', (int) ($pack['approval_snapshot']['rejected_today_count'] ?? 0), ''],
                        ['Reviewed (14 days)', (int) ($pack['approval_snapshot']['reviewed_14d_count'] ?? 0), ''],
                    ]
                ),
            ],
            'audit_snapshot' => [
                'filename' => 'atoms-audit-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Events today', (int) ($pack['audit_snapshot']['event_count_today'] ?? 0), ''],
                        ['Events (14 days)', (int) ($pack['audit_snapshot']['event_count_14d'] ?? 0), ''],
                        ['Active users (14d)', (int) ($pack['audit_snapshot']['user_count_14d'] ?? 0), ''],
                        ['Entity types (14d)', (int) ($pack['audit_snapshot']['entity_type_count_14d'] ?? 0), ''],
                        ['Sales events (14d)', (int) ($pack['audit_snapshot']['sale_event_count_14d'] ?? 0), ''],
                        ['Approval events (14d)', (int) ($pack['audit_snapshot']['approval_event_count_14d'] ?? 0), ''],
                        ['Inventory events (14d)', (int) ($pack['audit_snapshot']['inventory_event_count_14d'] ?? 0), ''],
                        ['Top action (14d)', 1, (string) ($pack['audit_snapshot']['top_action_14d'] ?? '')],
                    ]
                ),
            ],
            'collection_snapshot' => [
                'filename' => 'atoms-collection-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Customers owing', (int) ($pack['collection_snapshot']['owing_customer_count'] ?? 0), $this->naira((int) ($pack['collection_snapshot']['receivable_total'] ?? 0))],
                        ['Overdue invoices', (int) ($pack['collection_snapshot']['overdue_count'] ?? 0), $this->naira((int) ($pack['collection_snapshot']['overdue_total'] ?? 0))],
                        ['Open invoices', (int) ($pack['collection_snapshot']['open_invoice_count'] ?? 0), $this->naira((int) ($pack['collection_snapshot']['open_invoice_total'] ?? 0))],
                        ['Retail owing', (int) ($pack['collection_snapshot']['retail_owing_count'] ?? 0), ''],
                        ['Wholesale owing', (int) ($pack['collection_snapshot']['wholesale_owing_count'] ?? 0), ''],
                        ['Collections today', (int) ($pack['collection_snapshot']['collection_count_today'] ?? 0), $this->naira((int) ($pack['collection_snapshot']['collection_total_today'] ?? 0))],
                        ['Collections (14 days)', (int) ($pack['collection_snapshot']['collection_count_14d'] ?? 0), $this->naira((int) ($pack['collection_snapshot']['collection_total_14d'] ?? 0))],
                    ]
                ),
            ],
            'alert_snapshot' => [
                'filename' => 'atoms-alert-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Unread alerts', (int) ($pack['alert_snapshot']['unread_count'] ?? 0), ''],
                        ['Alerts today', (int) ($pack['alert_snapshot']['alert_count_today'] ?? 0), ''],
                        ['Alerts (14 days)', (int) ($pack['alert_snapshot']['alert_count_14d'] ?? 0), ''],
                        ['Low stock alerts (14d)', (int) ($pack['alert_snapshot']['low_stock_alert_count_14d'] ?? 0), ''],
                        ['Debt alerts (14d)', (int) ($pack['alert_snapshot']['debt_alert_count_14d'] ?? 0), ''],
                        ['Approval alerts (14d)', (int) ($pack['alert_snapshot']['approval_alert_count_14d'] ?? 0), ''],
                        ['Operations alerts (14d)', (int) ($pack['alert_snapshot']['ops_alert_count_14d'] ?? 0), ''],
                    ]
                ),
            ],
            'sales_snapshot' => [
                'filename' => 'atoms-sales-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Sales today', (int) ($pack['sales_snapshot']['sale_count_today'] ?? 0), $this->naira((int) ($pack['sales_snapshot']['sale_total_today'] ?? 0))],
                        ['Collected today', (int) ($pack['sales_snapshot']['sale_count_today'] ?? 0), $this->naira((int) ($pack['sales_snapshot']['collected_today'] ?? 0))],
                        ['Due today', (int) ($pack['sales_snapshot']['credit_sale_count_today'] ?? 0), $this->naira((int) ($pack['sales_snapshot']['due_total_today'] ?? 0))],
                        ['Sales (14 days)', (int) ($pack['sales_snapshot']['sale_count_14d'] ?? 0), $this->naira((int) ($pack['sales_snapshot']['sale_total_14d'] ?? 0))],
                        ['Collected (14 days)', (int) ($pack['sales_snapshot']['sale_count_14d'] ?? 0), $this->naira((int) ($pack['sales_snapshot']['collected_14d'] ?? 0))],
                        ['Retail sales (14d)', (int) ($pack['sales_snapshot']['retail_count_14d'] ?? 0), ''],
                        ['Wholesale sales (14d)', (int) ($pack['sales_snapshot']['wholesale_count_14d'] ?? 0), ''],
                        ['Voided today', (int) ($pack['sales_snapshot']['voided_count_today'] ?? 0), $this->naira((int) ($pack['sales_snapshot']['voided_total_today'] ?? 0))],
                    ]
                ),
            ],
            'payment_snapshot' => [
                'filename' => 'atoms-payment-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Customer payments today', (int) ($pack['payment_snapshot']['customer_payment_count_today'] ?? 0), $this->naira((int) ($pack['payment_snapshot']['customer_payment_total_today'] ?? 0))],
                        ['Customer payments (14d)', (int) ($pack['payment_snapshot']['customer_payment_count_14d'] ?? 0), $this->naira((int) ($pack['payment_snapshot']['customer_payment_total_14d'] ?? 0))],
                        ['Supplier payments today', (int) ($pack['payment_snapshot']['supplier_payment_count_today'] ?? 0), $this->naira((int) ($pack['payment_snapshot']['supplier_payment_total_today'] ?? 0))],
                        ['Supplier payments (14d)', (int) ($pack['payment_snapshot']['supplier_payment_count_14d'] ?? 0), $this->naira((int) ($pack['payment_snapshot']['supplier_payment_total_14d'] ?? 0))],
                        ['Reversals today', (int) ($pack['payment_snapshot']['reversal_count_today'] ?? 0), $this->naira((int) ($pack['payment_snapshot']['reversal_total_today'] ?? 0))],
                        ['Reversals (14 days)', (int) ($pack['payment_snapshot']['reversal_count_14d'] ?? 0), $this->naira((int) ($pack['payment_snapshot']['reversal_total_14d'] ?? 0))],
                    ]
                ),
            ],
            'swap_snapshot' => [
                'filename' => 'atoms-swap-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Swaps today', (int) ($pack['swap_snapshot']['swap_count_today'] ?? 0), $this->naira((int) ($pack['swap_snapshot']['collected_today'] ?? 0))],
                        ['Difference today', (int) ($pack['swap_snapshot']['swap_count_today'] ?? 0), $this->naira((int) ($pack['swap_snapshot']['difference_total_today'] ?? 0))],
                        ['Swaps (14 days)', (int) ($pack['swap_snapshot']['swap_count_14d'] ?? 0), $this->naira((int) ($pack['swap_snapshot']['collected_14d'] ?? 0))],
                        ['Difference (14 days)', (int) ($pack['swap_snapshot']['swap_count_14d'] ?? 0), $this->naira((int) ($pack['swap_snapshot']['difference_total_14d'] ?? 0))],
                        ['Upgrades (14d)', (int) ($pack['swap_snapshot']['upgrade_count_14d'] ?? 0), ''],
                        ['Downgrades (14d)', (int) ($pack['swap_snapshot']['downgrade_count_14d'] ?? 0), ''],
                        ['Even swaps (14d)', (int) ($pack['swap_snapshot']['even_swap_count_14d'] ?? 0), ''],
                    ]
                ),
            ],
            'return_snapshot' => [
                'filename' => 'atoms-return-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Returns today', (int) ($pack['return_snapshot']['return_count_today'] ?? 0), $this->naira((int) ($pack['return_snapshot']['return_total_today'] ?? 0))],
                        ['Returns (14 days)', (int) ($pack['return_snapshot']['return_count_14d'] ?? 0), $this->naira((int) ($pack['return_snapshot']['return_total_14d'] ?? 0))],
                        ['Refund resolutions (14d)', (int) ($pack['return_snapshot']['refund_resolution_count_14d'] ?? 0), ''],
                        ['Replacement resolutions (14d)', (int) ($pack['return_snapshot']['replacement_resolution_count_14d'] ?? 0), ''],
                        ['Faulty returns (14d)', (int) ($pack['return_snapshot']['faulty_return_count_14d'] ?? 0), ''],
                        ['Warranty returns (14d)', (int) ($pack['return_snapshot']['warranty_return_count_14d'] ?? 0), ''],
                    ]
                ),
            ],
            'adjustment_snapshot' => [
                'filename' => 'atoms-adjustment-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Reversals today', (int) ($pack['adjustment_snapshot']['reversal_count_today'] ?? 0), $this->naira((int) ($pack['adjustment_snapshot']['reversal_total_today'] ?? 0))],
                        ['Reversals (14 days)', (int) ($pack['adjustment_snapshot']['reversal_count_14d'] ?? 0), $this->naira((int) ($pack['adjustment_snapshot']['reversal_total_14d'] ?? 0))],
                        ['Voided sales today', (int) ($pack['adjustment_snapshot']['voided_count_today'] ?? 0), $this->naira((int) ($pack['adjustment_snapshot']['voided_total_today'] ?? 0))],
                        ['Voided sales (14 days)', (int) ($pack['adjustment_snapshot']['voided_count_14d'] ?? 0), $this->naira((int) ($pack['adjustment_snapshot']['voided_total_14d'] ?? 0))],
                        ['Adjustments today', (int) ($pack['adjustment_snapshot']['adjustment_count_today'] ?? 0), $this->naira((int) ($pack['adjustment_snapshot']['adjustment_total_today'] ?? 0))],
                    ]
                ),
            ],
            'procurement_snapshot' => [
                'filename' => 'atoms-procurement-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Open purchase orders', (int) ($pack['procurement_snapshot']['open_po_count'] ?? 0), $this->naira((int) ($pack['procurement_snapshot']['open_po_total'] ?? 0))],
                        ['Pending units', (int) ($pack['procurement_snapshot']['pending_units'] ?? 0), ''],
                        ['Ordered POs', (int) ($pack['procurement_snapshot']['ordered_count'] ?? 0), ''],
                        ['Inspecting POs', (int) ($pack['procurement_snapshot']['inspecting_count'] ?? 0), ''],
                        ['Purchases today', (int) ($pack['procurement_snapshot']['purchase_count_today'] ?? 0), $this->naira((int) ($pack['procurement_snapshot']['purchase_total_today'] ?? 0))],
                        ['Units received today', (int) ($pack['procurement_snapshot']['purchase_units_today'] ?? 0), ''],
                        ['Purchases (14 days)', (int) ($pack['procurement_snapshot']['purchase_count_14d'] ?? 0), $this->naira((int) ($pack['procurement_snapshot']['purchase_total_14d'] ?? 0))],
                        ['Units received (14 days)', (int) ($pack['procurement_snapshot']['purchase_units_14d'] ?? 0), ''],
                    ]
                ),
            ],
            'receiving_snapshot' => [
                'filename' => 'atoms-receiving-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Purchases today', (int) ($pack['receiving_snapshot']['purchase_count_today'] ?? 0), $this->naira((int) ($pack['receiving_snapshot']['purchase_total_today'] ?? 0))],
                        ['Purchases (14 days)', (int) ($pack['receiving_snapshot']['purchase_count_14d'] ?? 0), $this->naira((int) ($pack['receiving_snapshot']['purchase_total_14d'] ?? 0))],
                        ['IMEIs registered today', (int) ($pack['receiving_snapshot']['imei_count_today'] ?? 0), ''],
                        ['IMEIs registered (14 days)', (int) ($pack['receiving_snapshot']['imei_count_14d'] ?? 0), ''],
                        ['Supplier payments today', (int) ($pack['receiving_snapshot']['supplier_payment_count_today'] ?? 0), $this->naira((int) ($pack['receiving_snapshot']['supplier_payment_total_today'] ?? 0))],
                        ['Supplier payments (14 days)', (int) ($pack['receiving_snapshot']['supplier_payment_count_14d'] ?? 0), $this->naira((int) ($pack['receiving_snapshot']['supplier_payment_total_14d'] ?? 0))],
                        ['Swaps today', (int) ($pack['receiving_snapshot']['swap_count_today'] ?? 0), $this->naira((int) ($pack['receiving_snapshot']['swap_collected_today'] ?? 0))],
                        ['Swaps (14 days)', (int) ($pack['receiving_snapshot']['swap_count_14d'] ?? 0), $this->naira((int) ($pack['receiving_snapshot']['swap_collected_14d'] ?? 0))],
                        ['Supplier returns today', (int) ($pack['receiving_snapshot']['supplier_return_count_today'] ?? 0), $this->naira((int) ($pack['receiving_snapshot']['supplier_return_total_today'] ?? 0))],
                        ['Supplier returns (14 days)', (int) ($pack['receiving_snapshot']['supplier_return_count_14d'] ?? 0), $this->naira((int) ($pack['receiving_snapshot']['supplier_return_total_14d'] ?? 0))],
                        ['Receiving events today', (int) ($pack['receiving_snapshot']['receiving_count_today'] ?? 0), ''],
                        ['Receiving events (14 days)', (int) ($pack['receiving_snapshot']['receiving_count_14d'] ?? 0), ''],
                    ]
                ),
            ],
            'payable_snapshot' => [
                'filename' => 'atoms-payable-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Suppliers owing', (int) ($pack['payable_snapshot']['owing_supplier_count'] ?? 0), $this->naira((int) ($pack['payable_snapshot']['payable_total'] ?? 0))],
                        ['Open payables', (int) ($pack['payable_snapshot']['open_payable_count'] ?? 0), $this->naira((int) ($pack['payable_snapshot']['open_payable_total'] ?? 0))],
                        ['Aged payables', (int) ($pack['payable_snapshot']['aged_payable_count'] ?? 0), $this->naira((int) ($pack['payable_snapshot']['aged_payable_total'] ?? 0))],
                        ['Open purchase orders', (int) ($pack['payable_snapshot']['open_po_count'] ?? 0), $this->naira((int) ($pack['payable_snapshot']['open_po_total'] ?? 0))],
                        ['Supplier payments today', (int) ($pack['payable_snapshot']['supplier_payment_count_today'] ?? 0), $this->naira((int) ($pack['payable_snapshot']['supplier_payment_total_today'] ?? 0))],
                        ['Supplier payments (14 days)', (int) ($pack['payable_snapshot']['supplier_payment_count_14d'] ?? 0), $this->naira((int) ($pack['payable_snapshot']['supplier_payment_total_14d'] ?? 0))],
                        ['Supplier returns today', (int) ($pack['payable_snapshot']['supplier_return_count_today'] ?? 0), $this->naira((int) ($pack['payable_snapshot']['supplier_return_total_today'] ?? 0))],
                        ['Supplier returns (14 days)', (int) ($pack['payable_snapshot']['supplier_return_count_14d'] ?? 0), $this->naira((int) ($pack['payable_snapshot']['supplier_return_total_14d'] ?? 0))],
                    ]
                ),
            ],
            'receivable_snapshot' => [
                'filename' => 'atoms-receivable-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Customers owing', (int) ($pack['receivable_snapshot']['owing_customer_count'] ?? 0), $this->naira((int) ($pack['receivable_snapshot']['receivable_total'] ?? 0))],
                        ['Overdue invoices', (int) ($pack['receivable_snapshot']['overdue_count'] ?? 0), $this->naira((int) ($pack['receivable_snapshot']['overdue_total'] ?? 0))],
                        ['Open invoices', (int) ($pack['receivable_snapshot']['open_invoice_count'] ?? 0), $this->naira((int) ($pack['receivable_snapshot']['open_invoice_total'] ?? 0))],
                        ['Retail owing', (int) ($pack['receivable_snapshot']['retail_owing_count'] ?? 0), ''],
                        ['Wholesale owing', (int) ($pack['receivable_snapshot']['wholesale_owing_count'] ?? 0), ''],
                        ['New customers today', (int) ($pack['receivable_snapshot']['new_customers_today'] ?? 0), ''],
                        ['New customers (14 days)', (int) ($pack['receivable_snapshot']['new_customers_14d'] ?? 0), ''],
                        ['Collections today', (int) ($pack['receivable_snapshot']['collection_count_today'] ?? 0), $this->naira((int) ($pack['receivable_snapshot']['collection_total_today'] ?? 0))],
                        ['Collections (14 days)', (int) ($pack['receivable_snapshot']['collection_count_14d'] ?? 0), $this->naira((int) ($pack['receivable_snapshot']['collection_total_14d'] ?? 0))],
                    ]
                ),
            ],
            'workflow_snapshot' => [
                'filename' => 'atoms-workflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Open repairs', (int) ($pack['workflow_snapshot']['open_repair_count'] ?? 0), ''],
                        ['Pending approvals', (int) ($pack['workflow_snapshot']['pending_approval_count'] ?? 0), ''],
                        ['In transit', (int) ($pack['workflow_snapshot']['in_transit_count'] ?? 0), ''],
                        ['Open stock counts', (int) ($pack['workflow_snapshot']['open_stock_count_count'] ?? 0), ''],
                        ['Faulty devices', (int) ($pack['workflow_snapshot']['faulty_device_count'] ?? 0), ''],
                        ['Pending expenses', (int) ($pack['workflow_snapshot']['pending_expense_count'] ?? 0), $this->naira((int) ($pack['workflow_snapshot']['pending_expense_total'] ?? 0))],
                        ['Stuck repairs', (int) ($pack['workflow_snapshot']['stuck_repair_count'] ?? 0), ''],
                        ['Stuck transfers', (int) ($pack['workflow_snapshot']['stuck_transfer_count'] ?? 0), ''],
                        ['Stuck faulty devices', (int) ($pack['workflow_snapshot']['stuck_faulty_count'] ?? 0), ''],
                        ['Repairs completed today', (int) ($pack['workflow_snapshot']['repair_completed_today'] ?? 0), ''],
                        ['Repairs completed (14 days)', (int) ($pack['workflow_snapshot']['repair_completed_14d'] ?? 0), ''],
                        ['Transfers today', (int) ($pack['workflow_snapshot']['transfer_count_today'] ?? 0), ''],
                        ['Transfers (14 days)', (int) ($pack['workflow_snapshot']['transfer_count_14d'] ?? 0), ''],
                        ['Stock counts posted today', (int) ($pack['workflow_snapshot']['stock_count_posted_today'] ?? 0), ''],
                        ['Stock counts posted (14 days)', (int) ($pack['workflow_snapshot']['stock_count_posted_14d'] ?? 0), ''],
                        ['Approvals today', (int) ($pack['workflow_snapshot']['approval_count_today'] ?? 0), ''],
                        ['Approvals (14 days)', (int) ($pack['workflow_snapshot']['approval_count_14d'] ?? 0), ''],
                        ['Expenses posted today', (int) ($pack['workflow_snapshot']['expense_posted_today'] ?? 0), $this->naira((int) ($pack['workflow_snapshot']['expense_posted_total_today'] ?? 0))],
                        ['Expenses posted (14 days)', (int) ($pack['workflow_snapshot']['expense_posted_14d'] ?? 0), $this->naira((int) ($pack['workflow_snapshot']['expense_posted_total_14d'] ?? 0))],
                        ['Workflow events today', (int) ($pack['workflow_snapshot']['workflow_events_today'] ?? 0), ''],
                        ['Workflow events (14 days)', (int) ($pack['workflow_snapshot']['workflow_events_14d'] ?? 0), ''],
                    ]
                ),
            ],
            'transit_snapshot' => [
                'filename' => 'atoms-transit-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['In transit now', (int) ($pack['transit_snapshot']['in_transit_count'] ?? 0), ''],
                        ['Devices in transit', (int) ($pack['transit_snapshot']['in_transit_devices'] ?? 0), ''],
                        ['Stuck transfers', (int) ($pack['transit_snapshot']['stuck_transfer_count'] ?? 0), ''],
                        ['Stuck devices', (int) ($pack['transit_snapshot']['stuck_device_count'] ?? 0), ''],
                        ['Outbound in transit', (int) ($pack['transit_snapshot']['outbound_in_transit'] ?? 0), ''],
                        ['Inbound in transit', (int) ($pack['transit_snapshot']['inbound_in_transit'] ?? 0), ''],
                        ['Transfers today', (int) ($pack['transit_snapshot']['transfer_count_today'] ?? 0), ''],
                        ['Dispatched today', (int) ($pack['transit_snapshot']['dispatched_today'] ?? 0), ''],
                        ['Received today', (int) ($pack['transit_snapshot']['received_today'] ?? 0), ''],
                        ['Transfers (14 days)', (int) ($pack['transit_snapshot']['transfer_count_14d'] ?? 0), ''],
                        ['Dispatched (14 days)', (int) ($pack['transit_snapshot']['dispatched_14d'] ?? 0), ''],
                        ['Received (14 days)', (int) ($pack['transit_snapshot']['received_14d'] ?? 0), ''],
                        ['Devices moved (14 days)', (int) ($pack['transit_snapshot']['devices_moved_14d'] ?? 0), ''],
                    ]
                ),
            ],
            'stockflow_snapshot' => [
                'filename' => 'atoms-stockflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Low stock alerts', (int) ($pack['stockflow_snapshot']['low_stock_count'] ?? 0), ''],
                        ['Low stock units', (int) ($pack['stockflow_snapshot']['low_stock_qty'] ?? 0), ''],
                        ['Lowest available', (int) ($pack['stockflow_snapshot']['lowest_available'] ?? 0), ''],
                        ['Available stock', (int) ($pack['stockflow_snapshot']['available_qty'] ?? 0), $this->naira((int) ($pack['stockflow_snapshot']['available_value'] ?? 0))],
                        ['On-hand value', '', $this->naira((int) ($pack['stockflow_snapshot']['on_hand_value'] ?? 0))],
                        ['Faulty units', (int) ($pack['stockflow_snapshot']['faulty_qty'] ?? 0), $this->naira((int) ($pack['stockflow_snapshot']['faulty_value'] ?? 0))],
                        ['IMEI on hand', (int) ($pack['stockflow_snapshot']['imei_total'] ?? 0), ''],
                        ['IMEI available', (int) ($pack['stockflow_snapshot']['imei_available'] ?? 0), ''],
                        ['IMEI registered today', (int) ($pack['stockflow_snapshot']['imei_registered_today'] ?? 0), ''],
                        ['IMEI registered (14 days)', (int) ($pack['stockflow_snapshot']['imei_registered_14d'] ?? 0), ''],
                        ['Slow movers', (int) ($pack['stockflow_snapshot']['slow_mover_count'] ?? 0), ''],
                        ['Slow mover units', (int) ($pack['stockflow_snapshot']['slow_mover_qty'] ?? 0), ''],
                    ]
                ),
            ],
            'service_snapshot' => [
                'filename' => 'atoms-service-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Open repairs', (int) ($pack['service_snapshot']['open_repair_count'] ?? 0), ''],
                        ['Stuck repairs', (int) ($pack['service_snapshot']['stuck_repair_count'] ?? 0), ''],
                        ['Repairs opened today', (int) ($pack['service_snapshot']['repair_opened_today'] ?? 0), ''],
                        ['Repair intake (14 days)', (int) ($pack['service_snapshot']['repair_intake_14d'] ?? 0), ''],
                        ['Faulty devices', (int) ($pack['service_snapshot']['faulty_device_count'] ?? 0), ''],
                        ['Stuck faulty devices', (int) ($pack['service_snapshot']['stuck_faulty_count'] ?? 0), ''],
                        ['Under repair (IMEI)', (int) ($pack['service_snapshot']['under_repair_qty'] ?? 0), ''],
                        ['Service queue total', (int) ($pack['service_snapshot']['service_queue_total'] ?? 0), ''],
                        ['Repairs completed today', (int) ($pack['service_snapshot']['repair_completed_today'] ?? 0), ''],
                        ['Repairs completed (14 days)', (int) ($pack['service_snapshot']['repair_completed_14d'] ?? 0), ''],
                        ['Returns today', (int) ($pack['service_snapshot']['return_count_today'] ?? 0), ''],
                        ['Returns (14 days)', (int) ($pack['service_snapshot']['return_count_14d'] ?? 0), ''],
                    ]
                ),
            ],
            'countflow_snapshot' => [
                'filename' => 'atoms-countflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Units'],
                    [
                        ['Open stock counts', (int) ($pack['countflow_snapshot']['open_count_count'] ?? 0), ''],
                        ['Pending approval', (int) ($pack['countflow_snapshot']['pending_approval_count'] ?? 0), ''],
                        ['Count queue total', (int) ($pack['countflow_snapshot']['count_queue_total'] ?? 0), ''],
                        ['Open missing units', (int) ($pack['countflow_snapshot']['open_missing_units'] ?? 0), ''],
                        ['Open extra units', (int) ($pack['countflow_snapshot']['open_extra_units'] ?? 0), ''],
                        ['Variance approvals pending', (int) ($pack['countflow_snapshot']['stock_variance_pending'] ?? 0), ''],
                        ['Posted today', (int) ($pack['countflow_snapshot']['posted_today_count'] ?? 0), (int) ($pack['countflow_snapshot']['missing_units_today'] ?? 0)],
                        ['Extra units today', (int) ($pack['countflow_snapshot']['extra_units_today'] ?? 0), ''],
                        ['Posted (14 days)', (int) ($pack['countflow_snapshot']['posted_14d_count'] ?? 0), (int) ($pack['countflow_snapshot']['missing_units_14d'] ?? 0)],
                        ['Extra units (14 days)', (int) ($pack['countflow_snapshot']['extra_units_14d'] ?? 0), ''],
                    ]
                ),
            ],
            'approvalflow_snapshot' => [
                'filename' => 'atoms-approvalflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Pending approvals', (int) ($pack['approvalflow_snapshot']['pending_count'] ?? 0), ''],
                        ['Pending types', (int) ($pack['approvalflow_snapshot']['pending_type_count'] ?? 0), ''],
                        ['Sell below minimum', (int) ($pack['approvalflow_snapshot']['price_override_count'] ?? 0), ''],
                        ['Expense over threshold', (int) ($pack['approvalflow_snapshot']['expense_count'] ?? 0), ''],
                        ['Stock count variance', (int) ($pack['approvalflow_snapshot']['stock_variance_count'] ?? 0), ''],
                        ['Reviewed today', (int) ($pack['approvalflow_snapshot']['reviewed_today_count'] ?? 0), ''],
                        ['Approved today', (int) ($pack['approvalflow_snapshot']['approved_today_count'] ?? 0), ''],
                        ['Rejected today', (int) ($pack['approvalflow_snapshot']['rejected_today_count'] ?? 0), ''],
                        ['Reviewed (14 days)', (int) ($pack['approvalflow_snapshot']['reviewed_14d_count'] ?? 0), ''],
                        ['Approved (14 days)', (int) ($pack['approvalflow_snapshot']['approved_14d_count'] ?? 0), ''],
                        ['Rejected (14 days)', (int) ($pack['approvalflow_snapshot']['rejected_14d_count'] ?? 0), ''],
                    ]
                ),
            ],
            'auditflow_snapshot' => [
                'filename' => 'atoms-auditflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Events today', (int) ($pack['auditflow_snapshot']['event_count_today'] ?? 0), ''],
                        ['Active users today', (int) ($pack['auditflow_snapshot']['users_today'] ?? 0), ''],
                        ['Events (14 days)', (int) ($pack['auditflow_snapshot']['event_count_14d'] ?? 0), ''],
                        ['Active users (14 days)', (int) ($pack['auditflow_snapshot']['user_count_14d'] ?? 0), ''],
                        ['Entity types (14 days)', (int) ($pack['auditflow_snapshot']['entity_type_count_14d'] ?? 0), ''],
                        ['Sales events (14 days)', (int) ($pack['auditflow_snapshot']['sale_event_count_14d'] ?? 0), ''],
                        ['Payment events (14 days)', (int) ($pack['auditflow_snapshot']['payment_event_count_14d'] ?? 0), ''],
                        ['Approval events (14 days)', (int) ($pack['auditflow_snapshot']['approval_event_count_14d'] ?? 0), ''],
                        ['Inventory events (14 days)', (int) ($pack['auditflow_snapshot']['inventory_event_count_14d'] ?? 0), ''],
                        ['Transfer events (14 days)', (int) ($pack['auditflow_snapshot']['transfer_event_count_14d'] ?? 0), ''],
                        ['Top action (14 days)', 1, (string) ($pack['auditflow_snapshot']['top_action_14d'] ?? '')],
                    ]
                ),
            ],
            'collectionflow_snapshot' => [
                'filename' => 'atoms-collectionflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Customers owing', (int) ($pack['collectionflow_snapshot']['owing_customer_count'] ?? 0), $this->naira((int) ($pack['collectionflow_snapshot']['receivable_total'] ?? 0))],
                        ['Overdue invoices', (int) ($pack['collectionflow_snapshot']['overdue_count'] ?? 0), $this->naira((int) ($pack['collectionflow_snapshot']['overdue_total'] ?? 0))],
                        ['Overdue share', (int) ($pack['collectionflow_snapshot']['overdue_share_pct'] ?? 0), '%'],
                        ['Open invoices', (int) ($pack['collectionflow_snapshot']['open_invoice_count'] ?? 0), $this->naira((int) ($pack['collectionflow_snapshot']['open_invoice_total'] ?? 0))],
                        ['Retail owing', (int) ($pack['collectionflow_snapshot']['retail_owing_count'] ?? 0), ''],
                        ['Wholesale owing', (int) ($pack['collectionflow_snapshot']['wholesale_owing_count'] ?? 0), ''],
                        ['Collections today', (int) ($pack['collectionflow_snapshot']['collection_count_today'] ?? 0), $this->naira((int) ($pack['collectionflow_snapshot']['collection_total_today'] ?? 0))],
                        ['Average collection today', (int) ($pack['collectionflow_snapshot']['avg_collection_today'] ?? 0), $this->naira((int) ($pack['collectionflow_snapshot']['avg_collection_today'] ?? 0))],
                        ['Collections (14 days)', (int) ($pack['collectionflow_snapshot']['collection_count_14d'] ?? 0), $this->naira((int) ($pack['collectionflow_snapshot']['collection_total_14d'] ?? 0))],
                        ['Average collection (14 days)', (int) ($pack['collectionflow_snapshot']['avg_collection_14d'] ?? 0), $this->naira((int) ($pack['collectionflow_snapshot']['avg_collection_14d'] ?? 0))],
                    ]
                ),
            ],
            'alertflow_snapshot' => [
                'filename' => 'atoms-alertflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Unread alerts', (int) ($pack['alertflow_snapshot']['unread_count'] ?? 0), ''],
                        ['Alerts today', (int) ($pack['alertflow_snapshot']['alert_count_today'] ?? 0), ''],
                        ['Unread today', (int) ($pack['alertflow_snapshot']['unread_today'] ?? 0), ''],
                        ['Read today', (int) ($pack['alertflow_snapshot']['read_today'] ?? 0), ''],
                        ['Alerts (14 days)', (int) ($pack['alertflow_snapshot']['alert_count_14d'] ?? 0), ''],
                        ['Active alert types (14d)', (int) ($pack['alertflow_snapshot']['alert_types_active'] ?? 0), ''],
                        ['Low stock alerts (14d)', (int) ($pack['alertflow_snapshot']['low_stock_alert_count_14d'] ?? 0), ''],
                        ['Debt alerts (14d)', (int) ($pack['alertflow_snapshot']['debt_alert_count_14d'] ?? 0), ''],
                        ['Approval alerts (14d)', (int) ($pack['alertflow_snapshot']['approval_alert_count_14d'] ?? 0), ''],
                        ['Operations alerts (14d)', (int) ($pack['alertflow_snapshot']['ops_alert_count_14d'] ?? 0), ''],
                    ]
                ),
            ],
            'expenseflow_snapshot' => [
                'filename' => 'atoms-expenseflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Pending approval', (int) ($pack['expenseflow_snapshot']['pending_count'] ?? 0), $this->naira((int) ($pack['expenseflow_snapshot']['pending_total'] ?? 0))],
                        ['Approval queue (expense)', (int) ($pack['expenseflow_snapshot']['approval_pending_count'] ?? 0), ''],
                        ['Largest pending', 1, $this->naira((int) ($pack['expenseflow_snapshot']['largest_pending_amount'] ?? 0))],
                        ['Posted today', (int) ($pack['expenseflow_snapshot']['posted_today_count'] ?? 0), $this->naira((int) ($pack['expenseflow_snapshot']['posted_today_total'] ?? 0))],
                        ['Average posted today', (int) ($pack['expenseflow_snapshot']['avg_posted_today'] ?? 0), $this->naira((int) ($pack['expenseflow_snapshot']['avg_posted_today'] ?? 0))],
                        ['Posted (14 days)', (int) ($pack['expenseflow_snapshot']['posted_14d_count'] ?? 0), $this->naira((int) ($pack['expenseflow_snapshot']['posted_14d_total'] ?? 0))],
                        ['Average posted (14 days)', (int) ($pack['expenseflow_snapshot']['avg_posted_14d'] ?? 0), $this->naira((int) ($pack['expenseflow_snapshot']['avg_posted_14d'] ?? 0))],
                        ['Categories (14 days)', (int) ($pack['expenseflow_snapshot']['category_count_14d'] ?? 0), $this->naira((int) ($pack['expenseflow_snapshot']['top_category_total_14d'] ?? 0))],
                        ['Top category (14 days)', 1, (string) ($pack['expenseflow_snapshot']['top_category_14d'] ?? '')],
                    ]
                ),
            ],
            'performanceflow_snapshot' => [
                'filename' => 'atoms-performanceflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Low stock alerts', (int) ($pack['performanceflow_snapshot']['low_stock_count'] ?? 0), ''],
                        ['Low stock units', (int) ($pack['performanceflow_snapshot']['low_stock_qty'] ?? 0), ''],
                        ['Slow movers', (int) ($pack['performanceflow_snapshot']['slow_mover_count'] ?? 0), ''],
                        ['Slow mover units', (int) ($pack['performanceflow_snapshot']['slow_mover_qty'] ?? 0), ''],
                        ['Top sellers (14d)', (int) ($pack['performanceflow_snapshot']['top_seller_count'] ?? 0), $this->naira((int) ($pack['performanceflow_snapshot']['top_seller_revenue'] ?? 0))],
                        ['Top seller units (14d)', (int) ($pack['performanceflow_snapshot']['top_seller_units'] ?? 0), ''],
                        ['Top product (14d)', (int) ($pack['performanceflow_snapshot']['top_product_units'] ?? 0), (string) ($pack['performanceflow_snapshot']['top_product_name'] ?? '')],
                        ['Top product revenue (14d)', 1, $this->naira((int) ($pack['performanceflow_snapshot']['top_product_revenue'] ?? 0))],
                        ['Top product profit (14d)', 1, $this->naira((int) ($pack['performanceflow_snapshot']['top_product_profit'] ?? 0))],
                        ['Unread alerts', (int) ($pack['performanceflow_snapshot']['notify_unread'] ?? 0), ''],
                        ['Alerts today', (int) ($pack['performanceflow_snapshot']['alert_today_count'] ?? 0), ''],
                    ]
                ),
            ],
            'customerflow_snapshot' => [
                'filename' => 'atoms-customerflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['New customers today', (int) ($pack['customerflow_snapshot']['new_customers_today'] ?? 0), ''],
                        ['New customers (14d)', (int) ($pack['customerflow_snapshot']['new_customers_14d'] ?? 0), ''],
                        ['Customers owing', (int) ($pack['customerflow_snapshot']['owing_customer_count'] ?? 0), $this->naira((int) ($pack['customerflow_snapshot']['receivable_total'] ?? 0))],
                        ['Average balance owing', 1, $this->naira((int) ($pack['customerflow_snapshot']['avg_balance_owing'] ?? 0))],
                        ['Overdue invoices', (int) ($pack['customerflow_snapshot']['overdue_count'] ?? 0), $this->naira((int) ($pack['customerflow_snapshot']['overdue_total'] ?? 0))],
                        ['Overdue share', (int) ($pack['customerflow_snapshot']['overdue_share_pct'] ?? 0), '%'],
                        ['Open invoices', (int) ($pack['customerflow_snapshot']['open_invoice_count'] ?? 0), $this->naira((int) ($pack['customerflow_snapshot']['open_invoice_total'] ?? 0))],
                        ['Retail owing', (int) ($pack['customerflow_snapshot']['retail_owing_count'] ?? 0), ''],
                        ['Wholesale owing', (int) ($pack['customerflow_snapshot']['wholesale_owing_count'] ?? 0), ''],
                        ['Collections today', (int) ($pack['customerflow_snapshot']['collection_count_today'] ?? 0), $this->naira((int) ($pack['customerflow_snapshot']['collection_total_today'] ?? 0))],
                        ['Collections (14 days)', (int) ($pack['customerflow_snapshot']['collection_count_14d'] ?? 0), $this->naira((int) ($pack['customerflow_snapshot']['collection_total_14d'] ?? 0))],
                    ]
                ),
            ],
            'intakeflow_snapshot' => [
                'filename' => 'atoms-intakeflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Purchases today', (int) ($pack['intakeflow_snapshot']['purchase_count'] ?? 0), $this->naira((int) ($pack['intakeflow_snapshot']['purchase_total'] ?? 0))],
                        ['Average purchase today', 1, $this->naira((int) ($pack['intakeflow_snapshot']['avg_purchase_today'] ?? 0))],
                        ['Purchases (14 days)', (int) ($pack['intakeflow_snapshot']['purchase_count_14d'] ?? 0), $this->naira((int) ($pack['intakeflow_snapshot']['purchase_total_14d'] ?? 0))],
                        ['Average purchase (14 days)', 1, $this->naira((int) ($pack['intakeflow_snapshot']['avg_purchase_14d'] ?? 0))],
                        ['IMEIs registered today', (int) ($pack['intakeflow_snapshot']['imei_count'] ?? 0), ''],
                        ['IMEIs registered (14 days)', (int) ($pack['intakeflow_snapshot']['imei_count_14d'] ?? 0), ''],
                        ['Swaps today', (int) ($pack['intakeflow_snapshot']['swap_count'] ?? 0), $this->naira((int) ($pack['intakeflow_snapshot']['swap_collected'] ?? 0))],
                        ['Swaps (14 days)', (int) ($pack['intakeflow_snapshot']['swap_count_14d'] ?? 0), $this->naira((int) ($pack['intakeflow_snapshot']['swap_collected_14d'] ?? 0))],
                        ['Supplier payments today', (int) ($pack['intakeflow_snapshot']['supplier_payment_count'] ?? 0), $this->naira((int) ($pack['intakeflow_snapshot']['supplier_payment_total'] ?? 0))],
                        ['Supplier payments (14 days)', (int) ($pack['intakeflow_snapshot']['supplier_payment_count_14d'] ?? 0), $this->naira((int) ($pack['intakeflow_snapshot']['supplier_payment_total_14d'] ?? 0))],
                        ['Supplier returns today', (int) ($pack['intakeflow_snapshot']['supplier_return_count'] ?? 0), $this->naira((int) ($pack['intakeflow_snapshot']['supplier_return_total'] ?? 0))],
                        ['Supplier returns (14 days)', (int) ($pack['intakeflow_snapshot']['supplier_return_count_14d'] ?? 0), $this->naira((int) ($pack['intakeflow_snapshot']['supplier_return_total_14d'] ?? 0))],
                        ['Intake events today', (int) ($pack['intakeflow_snapshot']['intake_count_today'] ?? 0), ''],
                        ['Intake events (14 days)', (int) ($pack['intakeflow_snapshot']['intake_count_14d'] ?? 0), ''],
                    ]
                ),
            ],
            'supplierflow_snapshot' => [
                'filename' => 'atoms-supplierflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Suppliers owing', (int) ($pack['supplierflow_snapshot']['owing_supplier_count'] ?? 0), $this->naira((int) ($pack['supplierflow_snapshot']['payable_total'] ?? 0))],
                        ['Average balance owing', 1, $this->naira((int) ($pack['supplierflow_snapshot']['avg_balance_owing'] ?? 0))],
                        ['Open payables', (int) ($pack['supplierflow_snapshot']['open_payable_count'] ?? 0), $this->naira((int) ($pack['supplierflow_snapshot']['open_payable_total'] ?? 0))],
                        ['Aged payables', (int) ($pack['supplierflow_snapshot']['aged_payable_count'] ?? 0), $this->naira((int) ($pack['supplierflow_snapshot']['aged_payable_total'] ?? 0))],
                        ['Aged share', (int) ($pack['supplierflow_snapshot']['aged_share_pct'] ?? 0), '%'],
                        ['Open purchase orders', (int) ($pack['supplierflow_snapshot']['open_po_count'] ?? 0), $this->naira((int) ($pack['supplierflow_snapshot']['open_po_total'] ?? 0))],
                        ['Supplier payments today', (int) ($pack['supplierflow_snapshot']['supplier_payment_count_today'] ?? 0), $this->naira((int) ($pack['supplierflow_snapshot']['supplier_payment_total_today'] ?? 0))],
                        ['Supplier payments (14 days)', (int) ($pack['supplierflow_snapshot']['supplier_payment_count_14d'] ?? 0), $this->naira((int) ($pack['supplierflow_snapshot']['supplier_payment_total_14d'] ?? 0))],
                        ['Supplier returns today', (int) ($pack['supplierflow_snapshot']['supplier_return_count_today'] ?? 0), $this->naira((int) ($pack['supplierflow_snapshot']['supplier_return_total_today'] ?? 0))],
                        ['Supplier returns (14 days)', (int) ($pack['supplierflow_snapshot']['supplier_return_count_14d'] ?? 0), $this->naira((int) ($pack['supplierflow_snapshot']['supplier_return_total_14d'] ?? 0))],
                    ]
                ),
            ],
            'inventoryflow_snapshot' => [
                'filename' => 'atoms-inventoryflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Available stock', (int) ($pack['inventoryflow_snapshot']['available_qty'] ?? 0), $this->naira((int) ($pack['inventoryflow_snapshot']['available_value'] ?? 0))],
                        ['Average unit value', 1, $this->naira((int) ($pack['inventoryflow_snapshot']['avg_unit_value'] ?? 0))],
                        ['On-hand value', 1, $this->naira((int) ($pack['inventoryflow_snapshot']['on_hand_value'] ?? 0))],
                        ['Faulty units', (int) ($pack['inventoryflow_snapshot']['faulty_qty'] ?? 0), $this->naira((int) ($pack['inventoryflow_snapshot']['faulty_value'] ?? 0))],
                        ['Faulty share', (int) ($pack['inventoryflow_snapshot']['faulty_share_pct'] ?? 0), '%'],
                        ['Low stock alerts', (int) ($pack['inventoryflow_snapshot']['low_stock_count'] ?? 0), ''],
                        ['Low stock units', (int) ($pack['inventoryflow_snapshot']['low_stock_qty'] ?? 0), ''],
                        ['Lowest available', (int) ($pack['inventoryflow_snapshot']['lowest_available'] ?? 0), ''],
                        ['IMEI on hand', (int) ($pack['inventoryflow_snapshot']['imei_total'] ?? 0), ''],
                        ['IMEI statuses', (int) ($pack['inventoryflow_snapshot']['status_count'] ?? 0), ''],
                        ['IMEI available', (int) ($pack['inventoryflow_snapshot']['imei_available'] ?? 0), ''],
                        ['IMEI sold', (int) ($pack['inventoryflow_snapshot']['imei_sold'] ?? 0), ''],
                        ['IMEIs registered today', (int) ($pack['inventoryflow_snapshot']['imei_registered_today'] ?? 0), ''],
                    ]
                ),
            ],
            'staffflow_snapshot' => [
                'filename' => 'atoms-staffflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Staff with sales (14d)', (int) ($pack['staffflow_snapshot']['staff_count'] ?? 0), ''],
                        ['Staff invoices (14d)', (int) ($pack['staffflow_snapshot']['staff_invoices'] ?? 0), $this->naira((int) ($pack['staffflow_snapshot']['staff_revenue'] ?? 0))],
                        ['Average revenue per staff', 1, $this->naira((int) ($pack['staffflow_snapshot']['avg_revenue_per_staff'] ?? 0))],
                        ['Staff profit (14d)', (int) ($pack['staffflow_snapshot']['staff_invoices'] ?? 0), $this->naira((int) ($pack['staffflow_snapshot']['staff_profit'] ?? 0))],
                        ['Collection rate (14d)', (int) ($pack['staffflow_snapshot']['collection_rate_14d'] ?? 0), '%'],
                        ['Top staff (14d)', (int) ($pack['staffflow_snapshot']['top_staff_invoices'] ?? 0), (string) ($pack['staffflow_snapshot']['top_staff_name'] ?? '')],
                        ['Top staff revenue (14d)', 1, $this->naira((int) ($pack['staffflow_snapshot']['top_staff_revenue'] ?? 0))],
                        ['Top staff collection rate', (int) ($pack['staffflow_snapshot']['top_staff_collection_rate'] ?? 0), '%'],
                        ['Active branches (14d)', (int) ($pack['staffflow_snapshot']['branch_count'] ?? 0), $this->naira((int) ($pack['staffflow_snapshot']['branch_revenue'] ?? 0))],
                        ['Top branch revenue (14d)', 1, $this->naira((int) ($pack['staffflow_snapshot']['top_branch_revenue'] ?? 0))],
                        ['Device lines (14d)', (int) ($pack['staffflow_snapshot']['device_line_count'] ?? 0), ''],
                        ['Devices sold today', (int) ($pack['staffflow_snapshot']['devices_today'] ?? 0), $this->naira((int) ($pack['staffflow_snapshot']['device_revenue_today'] ?? 0))],
                        ['Sales today', (int) ($pack['staffflow_snapshot']['sales_today_count'] ?? 0), $this->naira((int) ($pack['staffflow_snapshot']['sales_today_total'] ?? 0))],
                    ]
                ),
            ],
            'branchflow_snapshot' => [
                'filename' => 'atoms-branchflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Branches in network', (int) ($pack['branchflow_snapshot']['branch_count'] ?? 0), ''],
                        ['Active branches (14d)', (int) ($pack['branchflow_snapshot']['active_branch_count'] ?? 0), ''],
                        ['Invoices (14d)', (int) ($pack['branchflow_snapshot']['invoice_count'] ?? 0), $this->naira((int) ($pack['branchflow_snapshot']['revenue_14d'] ?? 0))],
                        ['Average revenue per branch', 1, $this->naira((int) ($pack['branchflow_snapshot']['avg_revenue_per_branch'] ?? 0))],
                        ['Collected (14d)', 1, $this->naira((int) ($pack['branchflow_snapshot']['collected_14d'] ?? 0))],
                        ['Collection rate (14d)', (int) ($pack['branchflow_snapshot']['collection_rate_14d'] ?? 0), '%'],
                        ['Profit (14d)', 1, $this->naira((int) ($pack['branchflow_snapshot']['profit_14d'] ?? 0))],
                        ['Average profit per branch', 1, $this->naira((int) ($pack['branchflow_snapshot']['avg_profit_per_branch'] ?? 0))],
                        ['Outstanding due', 1, $this->naira((int) ($pack['branchflow_snapshot']['due_total'] ?? 0))],
                        ['Due share', (int) ($pack['branchflow_snapshot']['due_share_pct'] ?? 0), '%'],
                        ['Network stock', (int) ($pack['branchflow_snapshot']['stock_qty'] ?? 0), $this->naira((int) ($pack['branchflow_snapshot']['stock_value'] ?? 0))],
                        ['Top branch (14d)', (int) ($pack['branchflow_snapshot']['top_branch_invoices'] ?? 0), (string) ($pack['branchflow_snapshot']['top_branch_name'] ?? '')],
                        ['Top branch revenue (14d)', 1, $this->naira((int) ($pack['branchflow_snapshot']['top_branch_revenue'] ?? 0))],
                        ['Top branch profit (14d)', 1, $this->naira((int) ($pack['branchflow_snapshot']['top_branch_profit'] ?? 0))],
                        ['Top branch collection rate', (int) ($pack['branchflow_snapshot']['top_branch_collection_rate'] ?? 0), '%'],
                    ]
                ),
            ],
            'cashflowflow_snapshot' => [
                'filename' => 'atoms-cashflowflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Cash in (14d)', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['inflows_14d'] ?? 0))],
                        ['Outflows (14d)', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['outflows_14d'] ?? 0))],
                        ['Net cash (14d)', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['net_14d'] ?? 0))],
                        ['Average daily inflow (14d)', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['avg_daily_inflow_14d'] ?? 0))],
                        ['Average daily net (14d)', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['avg_daily_net_14d'] ?? 0))],
                        ['At sale (14d)', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['at_sale_14d'] ?? 0))],
                        ['Collections (14d)', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['collections_14d'] ?? 0))],
                        ['Collection share (14d)', (int) ($pack['cashflowflow_snapshot']['collection_share_pct'] ?? 0), '%'],
                        ['Expenses (14d)', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['expenses_14d'] ?? 0))],
                        ['Supplier payments (14d)', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['supplier_payments_14d'] ?? 0))],
                        ['Refunds (14d)', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['refunds_14d'] ?? 0))],
                        ['Outflow share (14d)', (int) ($pack['cashflowflow_snapshot']['outflow_share_pct'] ?? 0), '%'],
                        ['Top payment method (14d)', (int) ($pack['cashflowflow_snapshot']['payment_method_count'] ?? 0), (string) ($pack['cashflowflow_snapshot']['top_payment_method'] ?? '')],
                        ['Top method collected (14d)', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['top_payment_collected'] ?? 0))],
                        ['Cash in today', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['inflows_today'] ?? 0))],
                        ['At sale today', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['at_sale_today'] ?? 0))],
                        ['Collections today', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['collections_today'] ?? 0))],
                        ['Outflows today', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['outflows_today'] ?? 0))],
                        ['Expenses today', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['expenses_today'] ?? 0))],
                        ['Supplier payments today', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['supplier_payments_today'] ?? 0))],
                        ['Refunds today', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['refunds_today'] ?? 0))],
                        ['Net cash today', 1, $this->naira((int) ($pack['cashflowflow_snapshot']['net_today'] ?? 0))],
                    ]
                ),
            ],
            'mixflow_snapshot' => [
                'filename' => 'atoms-mixflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Payment methods (14d)', (int) ($pack['mixflow_snapshot']['payment_method_count'] ?? 0), $this->naira((int) ($pack['mixflow_snapshot']['payment_collected_14d'] ?? 0))],
                        ['Top payment method (14d)', 1, $this->naira((int) ($pack['mixflow_snapshot']['top_payment_collected'] ?? 0))],
                        ['Top payment share (14d)', (int) ($pack['mixflow_snapshot']['top_payment_share_pct'] ?? 0), '%'],
                        ['Retail invoices (14d)', (int) ($pack['mixflow_snapshot']['retail_invoices'] ?? 0), $this->naira((int) ($pack['mixflow_snapshot']['retail_revenue'] ?? 0))],
                        ['Wholesale invoices (14d)', (int) ($pack['mixflow_snapshot']['wholesale_invoices'] ?? 0), $this->naira((int) ($pack['mixflow_snapshot']['wholesale_revenue'] ?? 0))],
                        ['Retail share (14d)', (int) ($pack['mixflow_snapshot']['retail_share_pct'] ?? 0), '%'],
                        ['Wholesale share (14d)', (int) ($pack['mixflow_snapshot']['wholesale_share_pct'] ?? 0), '%'],
                        ['Total invoices (14d)', (int) ($pack['mixflow_snapshot']['invoice_count'] ?? 0), $this->naira((int) ($pack['mixflow_snapshot']['sales_14d'] ?? 0))],
                        ['Average invoice value (14d)', 1, $this->naira((int) ($pack['mixflow_snapshot']['avg_invoice_value_14d'] ?? 0))],
                        ['Sale channels (14d)', (int) ($pack['mixflow_snapshot']['sale_type_count'] ?? 0), ''],
                        ['Invoices today', (int) ($pack['mixflow_snapshot']['invoices_today'] ?? 0), $this->naira((int) ($pack['mixflow_snapshot']['sales_today'] ?? 0))],
                        ['Retail today', (int) ($pack['mixflow_snapshot']['retail_invoices_today'] ?? 0), $this->naira((int) ($pack['mixflow_snapshot']['retail_revenue_today'] ?? 0))],
                        ['Wholesale today', (int) ($pack['mixflow_snapshot']['wholesale_invoices_today'] ?? 0), $this->naira((int) ($pack['mixflow_snapshot']['wholesale_revenue_today'] ?? 0))],
                        ['Payment methods today', (int) ($pack['mixflow_snapshot']['payment_method_count_today'] ?? 0), $this->naira((int) ($pack['mixflow_snapshot']['payment_collected_today'] ?? 0))],
                    ]
                ),
            ],
            'trendflow_snapshot' => [
                'filename' => 'atoms-trendflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Active days (14d)', (int) ($pack['trendflow_snapshot']['active_day_count'] ?? 0), ''],
                        ['Inactive days (14d)', (int) ($pack['trendflow_snapshot']['inactive_day_count'] ?? 0), ''],
                        ['Invoices (14d)', (int) ($pack['trendflow_snapshot']['invoice_count'] ?? 0), $this->naira((int) ($pack['trendflow_snapshot']['sales_14d'] ?? 0))],
                        ['Average invoices per active day', (int) ($pack['trendflow_snapshot']['avg_invoices_per_active_day'] ?? 0), ''],
                        ['Collected (14d)', 1, $this->naira((int) ($pack['trendflow_snapshot']['collected_14d'] ?? 0))],
                        ['Collection rate (14d)', (int) ($pack['trendflow_snapshot']['collection_rate_14d'] ?? 0), '%'],
                        ['Average daily sales', 1, $this->naira((int) ($pack['trendflow_snapshot']['avg_daily_net'] ?? 0))],
                        ['Average daily collected', 1, $this->naira((int) ($pack['trendflow_snapshot']['avg_daily_collected_14d'] ?? 0))],
                        ['Best day', 1, $this->naira((int) ($pack['trendflow_snapshot']['best_day_net'] ?? 0))],
                        ['Best day share (14d)', (int) ($pack['trendflow_snapshot']['best_day_share_pct'] ?? 0), '%'],
                        ['Sales today', (int) ($pack['trendflow_snapshot']['invoices_today'] ?? 0), $this->naira((int) ($pack['trendflow_snapshot']['sales_today'] ?? 0))],
                        ['Collected today', 1, $this->naira((int) ($pack['trendflow_snapshot']['collected_today'] ?? 0))],
                        ['Today vs average (14d)', (int) ($pack['trendflow_snapshot']['today_vs_avg_pct'] ?? 0), '%'],
                        ['Sales yesterday', (int) ($pack['trendflow_snapshot']['invoices_yesterday'] ?? 0), $this->naira((int) ($pack['trendflow_snapshot']['sales_yesterday'] ?? 0))],
                        ['Velocity last 7 days', 1, $this->naira((int) ($pack['trendflow_snapshot']['velocity_7d_net'] ?? 0))],
                        ['Velocity prior 7 days', 1, $this->naira((int) ($pack['trendflow_snapshot']['velocity_prior_7d_net'] ?? 0))],
                        ['Velocity change', (int) ($pack['trendflow_snapshot']['velocity_change_pct'] ?? 0), '%'],
                    ]
                ),
            ],
            'productflow_snapshot' => [
                'filename' => 'atoms-productflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Top sellers (14d)', (int) ($pack['productflow_snapshot']['top_seller_count'] ?? 0), $this->naira((int) ($pack['productflow_snapshot']['top_seller_revenue'] ?? 0))],
                        ['Top seller units (14d)', (int) ($pack['productflow_snapshot']['top_seller_units'] ?? 0), $this->naira((int) ($pack['productflow_snapshot']['top_seller_profit'] ?? 0))],
                        ['Average revenue per unit', 1, $this->naira((int) ($pack['productflow_snapshot']['avg_revenue_per_unit'] ?? 0))],
                        ['Average profit per unit', 1, $this->naira((int) ($pack['productflow_snapshot']['avg_profit_per_unit'] ?? 0))],
                        ['Profit margin (14d)', (int) ($pack['productflow_snapshot']['profit_margin_pct'] ?? 0), '%'],
                        ['Top product (14d)', (int) ($pack['productflow_snapshot']['top_product_units'] ?? 0), (string) ($pack['productflow_snapshot']['top_product_name'] ?? '')],
                        ['Top product revenue (14d)', 1, $this->naira((int) ($pack['productflow_snapshot']['top_product_revenue'] ?? 0))],
                        ['Top product profit (14d)', 1, $this->naira((int) ($pack['productflow_snapshot']['top_product_profit'] ?? 0))],
                        ['Top product share (14d)', (int) ($pack['productflow_snapshot']['top_product_share_pct'] ?? 0), '%'],
                        ['Slow movers', (int) ($pack['productflow_snapshot']['slow_mover_count'] ?? 0), ''],
                        ['Slow mover units', (int) ($pack['productflow_snapshot']['slow_mover_qty'] ?? 0), ''],
                        ['Slow mover share', (int) ($pack['productflow_snapshot']['slow_mover_share_pct'] ?? 0), '%'],
                        ['Low stock alerts', (int) ($pack['productflow_snapshot']['low_stock_count'] ?? 0), ''],
                        ['Low stock units', (int) ($pack['productflow_snapshot']['low_stock_qty'] ?? 0), ''],
                    ]
                ),
            ],
            'ledgerflow_snapshot' => [
                'filename' => 'atoms-ledgerflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Customer receivables', (int) ($pack['ledgerflow_snapshot']['receivable_party_count'] ?? 0), $this->naira((int) ($pack['ledgerflow_snapshot']['receivable_total'] ?? 0))],
                        ['Average receivable per customer', 1, $this->naira((int) ($pack['ledgerflow_snapshot']['avg_receivable_per_customer'] ?? 0))],
                        ['Supplier payables', (int) ($pack['ledgerflow_snapshot']['payable_party_count'] ?? 0), $this->naira((int) ($pack['ledgerflow_snapshot']['payable_total'] ?? 0))],
                        ['Average payable per supplier', 1, $this->naira((int) ($pack['ledgerflow_snapshot']['avg_payable_per_supplier'] ?? 0))],
                        ['Net position', 1, $this->naira((int) ($pack['ledgerflow_snapshot']['net_position'] ?? 0))],
                        ['Overdue invoices', (int) ($pack['ledgerflow_snapshot']['overdue_count'] ?? 0), $this->naira((int) ($pack['ledgerflow_snapshot']['overdue_total'] ?? 0))],
                        ['Overdue share', (int) ($pack['ledgerflow_snapshot']['overdue_share_pct'] ?? 0), '%'],
                        ['Open payables', (int) ($pack['ledgerflow_snapshot']['payable_party_count'] ?? 0), $this->naira((int) ($pack['ledgerflow_snapshot']['open_payable_total'] ?? 0))],
                        ['Cash in (14d)', 1, $this->naira((int) ($pack['ledgerflow_snapshot']['cash_in_14d'] ?? 0))],
                        ['Cash out (14d)', 1, $this->naira((int) ($pack['ledgerflow_snapshot']['cash_out_14d'] ?? 0))],
                        ['Net cash (14d)', 1, $this->naira((int) ($pack['ledgerflow_snapshot']['cash_net_14d'] ?? 0))],
                        ['Expenses (14d)', 1, $this->naira((int) ($pack['ledgerflow_snapshot']['expenses_14d'] ?? 0))],
                        ['Sales (14d)', 1, $this->naira((int) ($pack['ledgerflow_snapshot']['sales_14d'] ?? 0))],
                        ['Collected (14d)', 1, $this->naira((int) ($pack['ledgerflow_snapshot']['collected_14d'] ?? 0))],
                        ['Collection rate (14d)', (int) ($pack['ledgerflow_snapshot']['collection_rate_14d'] ?? 0), '%'],
                        ['Cash in today', 1, $this->naira((int) ($pack['ledgerflow_snapshot']['cash_in_today'] ?? 0))],
                        ['Cash out today', 1, $this->naira((int) ($pack['ledgerflow_snapshot']['cash_out_today'] ?? 0))],
                        ['Net cash today', 1, $this->naira((int) ($pack['ledgerflow_snapshot']['cash_net_today'] ?? 0))],
                        ['Expenses today', 1, $this->naira((int) ($pack['ledgerflow_snapshot']['expenses_today'] ?? 0))],
                        ['Collections today', 1, $this->naira((int) ($pack['ledgerflow_snapshot']['collections_today'] ?? 0))],
                    ]
                ),
            ],
            'executiveflow_snapshot' => [
                'filename' => 'atoms-executiveflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Sales today', (int) ($pack['executiveflow_snapshot']['sales_today_count'] ?? 0), $this->naira((int) ($pack['executiveflow_snapshot']['sales_today_total'] ?? 0))],
                        ['Average sale today', 1, $this->naira((int) ($pack['executiveflow_snapshot']['avg_sale_today'] ?? 0))],
                        ['Today vs average (14d)', (int) ($pack['executiveflow_snapshot']['today_vs_avg_14d_pct'] ?? 0), '%'],
                        ['Sales (14d)', 1, $this->naira((int) ($pack['executiveflow_snapshot']['sales_14d'] ?? 0))],
                        ['Collected (14d)', 1, $this->naira((int) ($pack['executiveflow_snapshot']['collected_14d'] ?? 0))],
                        ['Collection rate (14d)', (int) ($pack['executiveflow_snapshot']['collection_rate_14d'] ?? 0), '%'],
                        ['Net cash today', 1, $this->naira((int) ($pack['executiveflow_snapshot']['cash_net_today'] ?? 0))],
                        ['Net cash (14d)', 1, $this->naira((int) ($pack['executiveflow_snapshot']['cash_net_14d'] ?? 0))],
                        ['Customer receivables', (int) ($pack['executiveflow_snapshot']['receivable_party_count'] ?? 0), $this->naira((int) ($pack['executiveflow_snapshot']['receivable_total'] ?? 0))],
                        ['Supplier payables', (int) ($pack['executiveflow_snapshot']['payable_party_count'] ?? 0), $this->naira((int) ($pack['executiveflow_snapshot']['payable_total'] ?? 0))],
                        ['Net position', 1, $this->naira((int) ($pack['executiveflow_snapshot']['net_position'] ?? 0))],
                        ['Overdue invoices', (int) ($pack['executiveflow_snapshot']['overdue_count'] ?? 0), $this->naira((int) ($pack['executiveflow_snapshot']['overdue_total'] ?? 0))],
                        ['Overdue share', (int) ($pack['executiveflow_snapshot']['overdue_share_pct'] ?? 0), '%'],
                        ['Collections today', 1, $this->naira((int) ($pack['executiveflow_snapshot']['collections_today'] ?? 0))],
                        ['Operations load', (int) ($pack['executiveflow_snapshot']['operations_load'] ?? 0), ''],
                        ['Open repairs', (int) ($pack['executiveflow_snapshot']['open_repair_count'] ?? 0), ''],
                        ['Pending approvals', (int) ($pack['executiveflow_snapshot']['pending_approval_count'] ?? 0), ''],
                        ['In transit', (int) ($pack['executiveflow_snapshot']['in_transit_count'] ?? 0), ''],
                        ['Available stock', (int) ($pack['executiveflow_snapshot']['available_qty'] ?? 0), $this->naira((int) ($pack['executiveflow_snapshot']['available_value'] ?? 0))],
                        ['Alert load', (int) ($pack['executiveflow_snapshot']['alert_load'] ?? 0), ''],
                        ['Low stock alerts', (int) ($pack['executiveflow_snapshot']['low_stock_count'] ?? 0), ''],
                        ['Unread alerts', (int) ($pack['executiveflow_snapshot']['notify_unread'] ?? 0), ''],
                    ]
                ),
            ],
            'agingflow_snapshot' => [
                'filename' => 'atoms-agingflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Open receivables', (int) ($pack['agingflow_snapshot']['receivable_line_count'] ?? 0), $this->naira((int) ($pack['agingflow_snapshot']['receivable_total'] ?? 0))],
                        ['Receivables 0–30 days', 1, $this->naira((int) ($pack['agingflow_snapshot']['receivable_0_30'] ?? 0))],
                        ['Receivables 31–60 days', 1, $this->naira((int) ($pack['agingflow_snapshot']['receivable_31_60'] ?? 0))],
                        ['Receivables 61–90 days', 1, $this->naira((int) ($pack['agingflow_snapshot']['receivable_61_90'] ?? 0))],
                        ['Receivables 90+ days', 1, $this->naira((int) ($pack['agingflow_snapshot']['receivable_90_plus'] ?? 0))],
                        ['Receivable stale total', 1, $this->naira((int) ($pack['agingflow_snapshot']['receivable_stale_total'] ?? 0))],
                        ['Receivable current share', (int) ($pack['agingflow_snapshot']['receivable_current_share_pct'] ?? 0), '%'],
                        ['Receivable aged share (90+)', (int) ($pack['agingflow_snapshot']['receivable_aged_share_pct'] ?? 0), '%'],
                        ['Open payables', (int) ($pack['agingflow_snapshot']['payable_line_count'] ?? 0), $this->naira((int) ($pack['agingflow_snapshot']['payable_total'] ?? 0))],
                        ['Payables 0–30 days', 1, $this->naira((int) ($pack['agingflow_snapshot']['payable_0_30'] ?? 0))],
                        ['Payables 31–60 days', 1, $this->naira((int) ($pack['agingflow_snapshot']['payable_31_60'] ?? 0))],
                        ['Payables 61–90 days', 1, $this->naira((int) ($pack['agingflow_snapshot']['payable_61_90'] ?? 0))],
                        ['Payables 90+ days', 1, $this->naira((int) ($pack['agingflow_snapshot']['payable_90_plus'] ?? 0))],
                        ['Payable stale total', 1, $this->naira((int) ($pack['agingflow_snapshot']['payable_stale_total'] ?? 0))],
                        ['Payable current share', (int) ($pack['agingflow_snapshot']['payable_current_share_pct'] ?? 0), '%'],
                        ['Payable aged share (90+)', (int) ($pack['agingflow_snapshot']['payable_aged_share_pct'] ?? 0), '%'],
                        ['Net aging position', 1, $this->naira((int) ($pack['agingflow_snapshot']['net_aging_position'] ?? 0))],
                        ['Stale share (combined)', (int) ($pack['agingflow_snapshot']['stale_share_pct'] ?? 0), '%'],
                        ['Payment methods (14d)', (int) ($pack['agingflow_snapshot']['payment_method_count'] ?? 0), $this->naira((int) ($pack['agingflow_snapshot']['payment_collected_14d'] ?? 0))],
                    ]
                ),
            ],
            'tradeflow_snapshot' => [
                'filename' => 'atoms-tradeflow-snapshot-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Count', 'Amount'],
                    [
                        ['Wholesale owing', (int) ($pack['tradeflow_snapshot']['wholesale_owing_count'] ?? 0), $this->naira((int) ($pack['tradeflow_snapshot']['wholesale_owing_total'] ?? 0))],
                        ['Retail owing', (int) ($pack['tradeflow_snapshot']['retail_owing_count'] ?? 0), $this->naira((int) ($pack['tradeflow_snapshot']['retail_owing_total'] ?? 0))],
                        ['Total owing', (int) ($pack['tradeflow_snapshot']['total_owing_count'] ?? 0), $this->naira((int) ($pack['tradeflow_snapshot']['total_owing_total'] ?? 0))],
                        ['Wholesale owing share', (int) ($pack['tradeflow_snapshot']['wholesale_owing_share_pct'] ?? 0), '%'],
                        ['Swaps today', (int) ($pack['tradeflow_snapshot']['swap_today_count'] ?? 0), $this->naira((int) ($pack['tradeflow_snapshot']['swap_collected_today'] ?? 0))],
                        ['Swaps (14d)', (int) ($pack['tradeflow_snapshot']['swap_14d_count'] ?? 0), $this->naira((int) ($pack['tradeflow_snapshot']['swap_collected_14d'] ?? 0))],
                        ['Average swap value (14d)', 1, $this->naira((int) ($pack['tradeflow_snapshot']['avg_swap_value_14d'] ?? 0))],
                        ['Swap collection share (14d)', (int) ($pack['tradeflow_snapshot']['swap_collection_share_pct'] ?? 0), '%'],
                        ['Retail sales (14d)', (int) ($pack['tradeflow_snapshot']['retail_invoices_14d'] ?? 0), $this->naira((int) ($pack['tradeflow_snapshot']['retail_sales_14d'] ?? 0))],
                        ['Wholesale sales (14d)', (int) ($pack['tradeflow_snapshot']['wholesale_invoices_14d'] ?? 0), $this->naira((int) ($pack['tradeflow_snapshot']['wholesale_sales_14d'] ?? 0))],
                        ['Retail share (14d)', (int) ($pack['tradeflow_snapshot']['retail_share_pct'] ?? 0), '%'],
                        ['Wholesale share (14d)', (int) ($pack['tradeflow_snapshot']['wholesale_share_pct'] ?? 0), '%'],
                    ]
                ),
            ],
            'movement' => [
                'filename' => 'atoms-movement-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Event', 'Product', 'Variant', 'Qty'],
                    array_map(fn($r) => [
                        $r['event_type'],
                        $r['product_name'],
                        $r['variant_label'] ?? '',
                        (int) $r['qty'],
                    ], $pack['movement']['by_variant'])
                ),
            ],
            'cash' => [
                'filename' => 'atoms-cash-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Bucket', 'Method', 'Amount'],
                    array_merge(
                        array_map(fn($r) => ['At sale', $r['method'], $this->naira((int) $r['amount'])], $pack['cash']['at_sale']),
                        array_map(fn($r) => ['Collections', $r['method'], $this->naira((int) $r['amount'])], $pack['cash']['collections']),
                        [
                            ['Inflows', '', $this->naira((int) $pack['cash']['inflows'])],
                            ['Expenses', '', $this->naira((int) $pack['cash']['expenses'])],
                            ['Supplier payments', '', $this->naira((int) $pack['cash']['supplier_payments'])],
                            ['Refunds', '', $this->naira((int) $pack['cash']['refunds'])],
                            ['Net', '', $this->naira((int) $pack['cash']['net'])],
                        ]
                    )
                ),
            ],
            'imei' => [
                'filename' => 'atoms-imei-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['IMEI', 'Serial', 'Status', 'Product', 'Variant', 'Branch', 'Cost'],
                    array_map(fn($r) => [
                        $r['imei'],
                        $r['serial_number'] ?? '',
                        $r['status'],
                        $r['product_name'],
                        $r['variant_label'] ?? '',
                        $r['branch_name'],
                        $this->naira((int) $r['cost_price']),
                    ], $pack['imei_lines'])
                ),
            ],
            'imei_status' => [
                'filename' => 'atoms-imei-status-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Status', 'Qty'],
                    array_map(fn($r) => [
                        $r['status'] ?? '',
                        (int) ($r['qty'] ?? 0),
                    ], $pack['imei_status_lines'])
                ),
            ],
            'payables' => [
                'filename' => 'atoms-payables-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Supplier', 'Balance'],
                    array_map(fn($p) => [$p['name'] ?? ('#' . $p['party_id']), $this->naira((int) $p['balance_after'])], $pack['payables']['parties'])
                ),
            ],
            'branches' => [
                'filename' => 'atoms-branches-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Branch', 'Invoices', 'Revenue', 'Collected', 'Due', 'Profit', 'Stock qty', 'Stock value', 'Collection %'],
                    array_map(fn($b) => [
                        $b['name'],
                        (int) $b['invoices'],
                        $this->naira((int) $b['revenue']),
                        $this->naira((int) $b['collected']),
                        $this->naira((int) $b['due']),
                        $this->naira((int) $b['profit']),
                        (int) $b['stock_qty'],
                        $this->naira((int) $b['stock_value']),
                        $b['collection_rate'],
                    ], $pack['branches'])
                ),
            ],
            'staff' => [
                'filename' => 'atoms-staff-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Staff', 'Invoices', 'Revenue', 'Collected', 'Profit', 'Collection %'],
                    array_map(fn($s) => [
                        $s['name'],
                        (int) $s['invoices'],
                        $this->naira((int) $s['revenue']),
                        $this->naira((int) $s['collected']),
                        $this->naira((int) $s['profit']),
                        $s['collection_rate'],
                    ], $pack['staff'])
                ),
            ],
            'staff_devices' => [
                'filename' => 'atoms-staff-devices-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Staff', 'Invoice', 'Posted', 'IMEI', 'Product', 'Variant', 'Price'],
                    array_map(fn($l) => [
                        $l['salesperson_name'] ?? '',
                        $l['invoice_number'] ?? '',
                        $l['posted_at'] ?? '',
                        $l['imei'] ?? '',
                        $l['product_name'] ?? '',
                        $l['variant_label'] ?? '',
                        $this->naira((int) ($l['selling_price'] ?? 0)),
                    ], $pack['staff_devices'])
                ),
            ],
            'recent_imeis' => [
                'filename' => 'atoms-recent-imeis-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['IMEI', 'Device', 'Status', 'Source', 'Cost', 'Registered'],
                    array_map(fn($l) => [
                        $l['imei'] ?? '',
                        $l['device_summary'] ?? '',
                        $l['status'] ?? '',
                        $l['source_type'] ?? '',
                        $this->naira((int) ($l['cost_price'] ?? 0)),
                        $l['created_at'] ?? '',
                    ], $pack['recent_imeis'])
                ),
            ],
            'today_imeis' => [
                'filename' => 'atoms-today-imeis-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['IMEI', 'Device', 'Status', 'Source', 'Cost', 'Registered'],
                    array_map(fn($l) => [
                        $l['imei'] ?? '',
                        $l['device_summary'] ?? '',
                        $l['status'] ?? '',
                        $l['source_type'] ?? '',
                        $this->naira((int) ($l['cost_price'] ?? 0)),
                        $l['created_at'] ?? '',
                    ], $pack['today_imeis'])
                ),
            ],
            'low_stock' => [
                'filename' => 'atoms-low-stock-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Product', 'Variant', 'Branch', 'Available', 'Threshold'],
                    array_map(fn($l) => [
                        $l['name'] ?? '',
                        $l['variant_label'] ?? '',
                        $l['branch_name'] ?? '',
                        (int) ($l['qty'] ?? 0),
                        (int) ($l['low_stock_threshold'] ?? 0),
                    ], $pack['low_stock'])
                ),
            ],
            'receivables' => [
                'filename' => 'atoms-receivables-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Customer', 'Balance'],
                    array_map(fn($p) => [$p['name'] ?? ('#' . $p['party_id']), $this->naira((int) $p['balance_after'])], $pack['receivables']['parties'])
                ),
            ],
            'receivable_invoices' => [
                'filename' => 'atoms-receivable-invoices-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Customer', 'Invoice', 'Devices', 'Due', 'Age (days)'],
                    array_map(fn($l) => [
                        $l['name'] ?? '',
                        $l['invoice_number'] ?? '',
                        $l['device_summary'] ?? '',
                        $this->naira((int) $l['amount']),
                        (int) ($l['days'] ?? 0),
                    ], $pack['receivable_invoices'])
                ),
            ],
            'receivable_aging' => [
                'filename' => 'atoms-receivable-aging-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Customer', 'Invoice', 'Devices', 'Due', 'Age (days)', 'Bucket'],
                    array_map(function ($l) {
                        $aging = new DebtAging();

                        return [
                            $l['name'] ?? '',
                            $l['invoice_number'] ?? '',
                            $l['device_summary'] ?? '',
                            $this->naira((int) $l['amount']),
                            (int) ($l['days'] ?? 0),
                            $aging->bucket((int) ($l['days'] ?? 0)),
                        ];
                    }, $pack['receivable_aging']['lines'] ?? [])
                ),
            ],
            'top_products' => [
                'filename' => 'atoms-top-products-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Product', 'Variant', 'Brand', 'Units', 'Revenue', 'Profit'],
                    array_map(fn($p) => [
                        $p['name'] ?? '',
                        $p['variant_label'] ?? '',
                        $p['brand'] ?? '',
                        (int) ($p['units'] ?? 0),
                        $this->naira((int) ($p['revenue'] ?? 0)),
                        $this->naira((int) ($p['profit'] ?? 0)),
                    ], $pack['top_products'])
                ),
            ],
            'payment_mix' => [
                'filename' => 'atoms-payment-mix-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Method', 'Invoices', 'Collected'],
                    array_map(fn($m) => [
                        $m['method'] ?? '',
                        (int) ($m['invoices'] ?? 0),
                        $this->naira((int) ($m['collected'] ?? 0)),
                    ], $pack['payment_mix'])
                ),
            ],
            'sale_types' => [
                'filename' => 'atoms-sale-types-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Type', 'Invoices', 'Net'],
                    array_map(fn($t) => [
                        $t['label'] ?? ($t['type'] ?? ''),
                        (int) ($t['invoices'] ?? 0),
                        $this->naira((int) ($t['net'] ?? 0)),
                    ], $pack['sale_types'])
                ),
            ],
            'sales_trend' => [
                'filename' => 'atoms-sales-trend-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Date', 'Invoices', 'Net', 'Collected'],
                    array_map(fn($t) => [
                        $t['date'] ?? '',
                        (int) ($t['invoices'] ?? 0),
                        $this->naira((int) ($t['net'] ?? 0)),
                        $this->naira((int) ($t['collected'] ?? 0)),
                    ], $pack['sales_trend'])
                ),
            ],
            'payable_purchases' => [
                'filename' => 'atoms-payable-purchases-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Supplier', 'PO invoice', 'Variants', 'Amount', 'Age (days)'],
                    array_map(fn($l) => [
                        $l['name'] ?? '',
                        $l['invoice_number'] ?? '',
                        $l['variant_summary'] ?? '',
                        $this->naira((int) $l['amount']),
                        (int) ($l['days'] ?? 0),
                    ], $pack['payable_purchases'])
                ),
            ],
            'payable_aging' => [
                'filename' => 'atoms-payable-aging-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Supplier', 'PO invoice', 'Variants', 'Amount', 'Age (days)', 'Bucket'],
                    array_map(function ($l) {
                        $aging = new DebtAging();

                        return [
                            $l['name'] ?? '',
                            $l['invoice_number'] ?? '',
                            $l['variant_summary'] ?? '',
                            $this->naira((int) $l['amount']),
                            (int) ($l['days'] ?? 0),
                            $aging->bucket((int) ($l['days'] ?? 0)),
                        ];
                    }, $pack['payable_aging']['lines'] ?? [])
                ),
            ],
            'open_repairs' => [
                'filename' => 'atoms-open-repairs-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Ticket', 'Customer', 'Device', 'Status', 'Engineer', 'Age (days)'],
                    array_map(fn($l) => [
                        $l['ticket_number'] ?? '',
                        $l['customer_name'] ?? '',
                        $l['device_summary'] ?? '',
                        $l['status'] ?? '',
                        $l['engineer_name'] ?? '',
                        (int) ($l['days'] ?? 0),
                    ], $pack['open_repairs'])
                ),
            ],
            'faulty_devices' => [
                'filename' => 'atoms-faulty-devices-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['IMEI', 'Device', 'Age (days)'],
                    array_map(fn($l) => [
                        $l['imei'] ?? '',
                        $l['device_summary'] ?? '',
                        (int) ($l['days'] ?? 0),
                    ], $pack['faulty_devices'])
                ),
            ],
            'open_stock_counts' => [
                'filename' => 'atoms-open-stock-counts-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Count', 'Branch', 'Status', 'Missing', 'Extra', 'Missing devices', 'Age (days)'],
                    array_map(fn($l) => [
                        (string) ($l['id'] ?? ''),
                        $l['branch_name'] ?? '',
                        $l['status'] ?? '',
                        (int) ($l['missing_qty'] ?? 0),
                        (int) ($l['extra_qty'] ?? 0),
                        $l['missing_summary'] ?? '',
                        (int) ($l['days'] ?? 0),
                    ], $pack['open_stock_counts'])
                ),
            ],
            'recent_returns' => [
                'filename' => 'atoms-recent-returns-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Return', 'Invoice', 'Customer', 'Device', 'Type', 'Resolution', 'Refund', 'Posted'],
                    array_map(fn($l) => [
                        (string) ($l['id'] ?? ''),
                        $l['invoice_number'] ?? '',
                        $l['customer_name'] ?? '',
                        $l['device_summary'] ?? '',
                        $l['return_type'] ?? '',
                        $l['resolution'] ?? '',
                        $this->naira((int) ($l['refund_amount'] ?? 0)),
                        $l['posted_at'] ?? '',
                    ], $pack['recent_returns'])
                ),
            ],
            'today_returns' => [
                'filename' => 'atoms-today-returns-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Return', 'Invoice', 'Customer', 'Device', 'Type', 'Resolution', 'Refund', 'Posted'],
                    array_map(fn($l) => [
                        (string) ($l['id'] ?? ''),
                        $l['invoice_number'] ?? '',
                        $l['customer_name'] ?? '',
                        $l['device_summary'] ?? '',
                        $l['return_type'] ?? '',
                        $l['resolution'] ?? '',
                        $this->naira((int) ($l['refund_amount'] ?? 0)),
                        $l['posted_at'] ?? '',
                    ], $pack['today_returns'])
                ),
            ],
            'pending_expenses' => [
                'filename' => 'atoms-pending-expenses-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Expense', 'Branch', 'Category', 'Vendor', 'Amount', 'Description', 'Age (days)'],
                    array_map(fn($l) => [
                        (string) ($l['id'] ?? ''),
                        $l['branch_name'] ?? '',
                        $l['category'] ?? '',
                        $l['vendor'] ?? '',
                        $this->naira((int) ($l['amount'] ?? 0)),
                        $l['description'] ?? '',
                        (int) ($l['days'] ?? 0),
                    ], $pack['pending_expenses'])
                ),
            ],
            'pending_approvals' => [
                'filename' => 'atoms-pending-approvals-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Request', 'Type', 'Summary', 'Requester', 'Branch', 'Age (days)'],
                    array_map(fn($l) => [
                        '#' . ($l['id'] ?? ''),
                        $l['type_label'] ?? '',
                        $l['summary'] ?? '',
                        $l['requester_name'] ?? '',
                        $l['branch_name'] ?? '',
                        (int) ($l['days'] ?? 0),
                    ], $pack['pending_approvals'])
                ),
            ],
            'wholesale_receivables' => [
                'filename' => 'atoms-wholesale-receivables-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Customer', 'Invoice', 'Devices', 'Due', 'Age (days)'],
                    array_map(fn($l) => [
                        $l['name'] ?? '',
                        $l['invoice_number'] ?? '',
                        $l['device_summary'] ?? '',
                        $this->naira((int) $l['amount']),
                        (int) ($l['days'] ?? 0),
                    ], $pack['wholesale_receivables'])
                ),
            ],
            'retail_receivables' => [
                'filename' => 'atoms-retail-receivables-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Customer', 'Invoice', 'Devices', 'Due', 'Age (days)'],
                    array_map(fn($l) => [
                        $l['name'] ?? '',
                        $l['invoice_number'] ?? '',
                        $l['device_summary'] ?? '',
                        $this->naira((int) $l['amount']),
                        (int) ($l['days'] ?? 0),
                    ], $pack['retail_receivables'])
                ),
            ],
            'recent_swaps' => [
                'filename' => 'atoms-recent-swaps-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Swap', 'Customer', 'Devices', 'Difference', 'Collected', 'Posted'],
                    array_map(fn($l) => [
                        $l['invoice_number'] ?? ('#' . ($l['id'] ?? '')),
                        $l['customer_name'] ?? '',
                        $l['device_summary'] ?? '',
                        $this->naira((int) ($l['difference'] ?? 0)),
                        $this->naira((int) ($l['paid_amount'] ?? 0)),
                        $l['posted_at'] ?? '',
                    ], $pack['recent_swaps'])
                ),
            ],
            'today_swaps' => [
                'filename' => 'atoms-today-swaps-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Swap', 'Customer', 'Devices', 'Difference', 'Collected', 'Posted'],
                    array_map(fn($l) => [
                        $l['invoice_number'] ?? ('#' . ($l['id'] ?? '')),
                        $l['customer_name'] ?? '',
                        $l['device_summary'] ?? '',
                        $this->naira((int) ($l['difference'] ?? 0)),
                        $this->naira((int) ($l['paid_amount'] ?? 0)),
                        $l['posted_at'] ?? '',
                    ], $pack['today_swaps'])
                ),
            ],
            'recent_sales' => [
                'filename' => 'atoms-recent-sales-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Invoice', 'Type', 'Customer', 'Devices', 'Total', 'Paid', 'Due', 'Posted'],
                    array_map(fn($l) => [
                        $l['invoice_number'] ?? '',
                        $l['sale_type_label'] ?? ($l['sale_type'] ?? ''),
                        $l['customer_name'] ?? '',
                        $l['device_summary'] ?? '',
                        $this->naira((int) ($l['total'] ?? 0)),
                        $this->naira((int) ($l['paid_amount'] ?? 0)),
                        $this->naira((int) ($l['due_amount'] ?? 0)),
                        $l['posted_at'] ?? '',
                    ], $pack['recent_sales'])
                ),
            ],
            'today_sales' => [
                'filename' => 'atoms-today-sales-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Invoice', 'Type', 'Customer', 'Devices', 'Total', 'Paid', 'Due', 'Posted'],
                    array_map(fn($l) => [
                        $l['invoice_number'] ?? '',
                        $l['sale_type_label'] ?? ($l['sale_type'] ?? ''),
                        $l['customer_name'] ?? '',
                        $l['device_summary'] ?? '',
                        $this->naira((int) ($l['total'] ?? 0)),
                        $this->naira((int) ($l['paid_amount'] ?? 0)),
                        $this->naira((int) ($l['due_amount'] ?? 0)),
                        $l['posted_at'] ?? '',
                    ], $pack['today_sales'])
                ),
            ],
            'recent_payments' => [
                'filename' => 'atoms-recent-payments-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Customer', 'Invoice', 'Amount', 'Method', 'Status', 'Posted'],
                    array_map(fn($l) => [
                        $l['customer_name'] ?? '',
                        $l['invoice_number'] ?? '',
                        $this->naira((int) ($l['amount'] ?? 0)),
                        $l['method'] ?? '',
                        $l['status'] ?? '',
                        $l['posted_at'] ?? '',
                    ], $pack['recent_payments'])
                ),
            ],
            'today_payments' => [
                'filename' => 'atoms-today-payments-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Customer', 'Invoice', 'Amount', 'Method', 'Status', 'Posted'],
                    array_map(fn($l) => [
                        $l['customer_name'] ?? '',
                        $l['invoice_number'] ?? '',
                        $this->naira((int) ($l['amount'] ?? 0)),
                        $l['method'] ?? '',
                        $l['status'] ?? '',
                        $l['posted_at'] ?? '',
                    ], $pack['today_payments'])
                ),
            ],
            'supplier_payments' => [
                'filename' => 'atoms-supplier-payments-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Supplier', 'PO invoice', 'Amount', 'Method', 'Posted'],
                    array_map(fn($l) => [
                        $l['supplier_name'] ?? '',
                        $l['purchase_invoice'] ?? '',
                        $this->naira((int) ($l['amount'] ?? 0)),
                        $l['method'] ?? '',
                        $l['posted_at'] ?? '',
                    ], $pack['supplier_payments'])
                ),
            ],
            'today_supplier_payments' => [
                'filename' => 'atoms-today-supplier-payments-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Supplier', 'PO invoice', 'Amount', 'Method', 'Posted'],
                    array_map(fn($l) => [
                        $l['supplier_name'] ?? '',
                        $l['purchase_invoice'] ?? '',
                        $this->naira((int) ($l['amount'] ?? 0)),
                        $l['method'] ?? '',
                        $l['posted_at'] ?? '',
                    ], $pack['today_supplier_payments'])
                ),
            ],
            'recent_purchases' => [
                'filename' => 'atoms-recent-purchases-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Supplier', 'PO invoice', 'Items', 'Total', 'Units', 'Posted'],
                    array_map(fn($l) => [
                        $l['supplier_name'] ?? '',
                        $l['invoice_number'] ?? '',
                        $l['item_summary'] ?? '',
                        $this->naira((int) ($l['total'] ?? 0)),
                        (int) ($l['units'] ?? 0),
                        $l['posted_at'] ?? '',
                    ], $pack['recent_purchases'])
                ),
            ],
            'today_purchases' => [
                'filename' => 'atoms-today-purchases-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Supplier', 'PO invoice', 'Items', 'Total', 'Units', 'Posted'],
                    array_map(fn($l) => [
                        $l['supplier_name'] ?? '',
                        $l['invoice_number'] ?? '',
                        $l['item_summary'] ?? '',
                        $this->naira((int) ($l['total'] ?? 0)),
                        (int) ($l['units'] ?? 0),
                        $l['posted_at'] ?? '',
                    ], $pack['today_purchases'])
                ),
            ],
            'supplier_returns' => [
                'filename' => 'atoms-supplier-returns-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Supplier', 'IMEI', 'Device', 'Credit', 'Posted'],
                    array_map(fn($l) => [
                        $l['supplier_name'] ?? '',
                        $l['imei'] ?? '',
                        $l['device_summary'] ?? '',
                        $this->naira((int) ($l['amount'] ?? 0)),
                        $l['posted_at'] ?? '',
                    ], $pack['supplier_returns'])
                ),
            ],
            'today_supplier_returns' => [
                'filename' => 'atoms-today-supplier-returns-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Supplier', 'IMEI', 'Device', 'Credit', 'Posted'],
                    array_map(fn($l) => [
                        $l['supplier_name'] ?? '',
                        $l['imei'] ?? '',
                        $l['device_summary'] ?? '',
                        $this->naira((int) ($l['amount'] ?? 0)),
                        $l['posted_at'] ?? '',
                    ], $pack['today_supplier_returns'])
                ),
            ],
            'payment_reversals' => [
                'filename' => 'atoms-payment-reversals-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Customer', 'Invoice', 'Amount', 'Method', 'Reason', 'Posted'],
                    array_map(fn($l) => [
                        $l['customer_name'] ?? '',
                        $l['invoice_number'] ?? '',
                        $this->naira((int) ($l['amount'] ?? 0)),
                        $l['method'] ?? '',
                        $l['notes'] ?? '',
                        $l['posted_at'] ?? '',
                    ], $pack['payment_reversals'])
                ),
            ],
            'today_reversals' => [
                'filename' => 'atoms-today-reversals-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Customer', 'Invoice', 'Amount', 'Method', 'Reason', 'Posted'],
                    array_map(fn($l) => [
                        $l['customer_name'] ?? '',
                        $l['invoice_number'] ?? '',
                        $this->naira((int) ($l['amount'] ?? 0)),
                        $l['method'] ?? '',
                        $l['notes'] ?? '',
                        $l['posted_at'] ?? '',
                    ], $pack['today_reversals'])
                ),
            ],
            'voided_sales' => [
                'filename' => 'atoms-voided-sales-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Invoice', 'Type', 'Customer', 'Devices', 'Total', 'Reason', 'Voided'],
                    array_map(fn($l) => [
                        $l['invoice_number'] ?? '',
                        $l['sale_type_label'] ?? ($l['sale_type'] ?? ''),
                        $l['customer_name'] ?? '',
                        $l['device_summary'] ?? '',
                        $this->naira((int) ($l['total'] ?? 0)),
                        $l['void_reason'] ?? '',
                        $l['voided_at'] ?? '',
                    ], $pack['voided_sales'])
                ),
            ],
            'today_voided_sales' => [
                'filename' => 'atoms-today-voided-sales-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Invoice', 'Type', 'Customer', 'Devices', 'Total', 'Reason', 'Voided'],
                    array_map(fn($l) => [
                        $l['invoice_number'] ?? '',
                        $l['sale_type_label'] ?? ($l['sale_type'] ?? ''),
                        $l['customer_name'] ?? '',
                        $l['device_summary'] ?? '',
                        $this->naira((int) ($l['total'] ?? 0)),
                        $l['void_reason'] ?? '',
                        $l['voided_at'] ?? '',
                    ], $pack['today_voided_sales'])
                ),
            ],
            'recent_expenses' => [
                'filename' => 'atoms-recent-expenses-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Category', 'Vendor', 'Branch', 'Amount', 'Description', 'Posted'],
                    array_map(fn($l) => [
                        $l['category'] ?? '',
                        $l['vendor'] ?? '',
                        $l['branch_name'] ?? '',
                        $this->naira((int) ($l['amount'] ?? 0)),
                        $l['description'] ?? '',
                        $l['posted_at'] ?? '',
                    ], $pack['recent_expenses'])
                ),
            ],
            'today_expenses' => [
                'filename' => 'atoms-today-expenses-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Category', 'Vendor', 'Branch', 'Amount', 'Description', 'Posted'],
                    array_map(fn($l) => [
                        $l['category'] ?? '',
                        $l['vendor'] ?? '',
                        $l['branch_name'] ?? '',
                        $this->naira((int) ($l['amount'] ?? 0)),
                        $l['description'] ?? '',
                        $l['posted_at'] ?? '',
                    ], $pack['today_expenses'])
                ),
            ],
            'recent_audit' => [
                'filename' => 'atoms-recent-audit-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['When', 'Action', 'Entity', 'User', 'Branch', 'Summary'],
                    array_map(fn($l) => [
                        $l['created_at'] ?? '',
                        $l['action_label'] ?? '',
                        $l['entity_type'] ?? '',
                        $l['user_name'] ?? '',
                        $l['branch_name'] ?? '',
                        $l['summary'] ?? '',
                    ], $pack['recent_audit'])
                ),
            ],
            'today_audit' => [
                'filename' => 'atoms-today-audit-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['When', 'Action', 'Entity', 'User', 'Branch', 'Summary'],
                    array_map(fn($l) => [
                        $l['created_at'] ?? '',
                        $l['action_label'] ?? '',
                        $l['entity_type'] ?? '',
                        $l['user_name'] ?? '',
                        $l['branch_name'] ?? '',
                        $l['summary'] ?? '',
                    ], $pack['today_audit'])
                ),
            ],
            'today_alerts' => [
                'filename' => 'atoms-today-alerts-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['When', 'Type', 'Title', 'Detail', 'Read'],
                    array_map(fn($l) => [
                        $l['created_at'] ?? '',
                        $l['type'] ?? '',
                        $l['title'] ?? '',
                        $l['body'] ?? '',
                        !empty($l['is_read']) ? 'Yes' : 'No',
                    ], $pack['today_alerts'])
                ),
            ],
            'unread_alerts' => [
                'filename' => 'atoms-unread-alerts-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['When', 'Type', 'Title', 'Detail'],
                    array_map(fn($l) => [
                        $l['created_at'] ?? '',
                        $l['type'] ?? '',
                        $l['title'] ?? '',
                        $l['body'] ?? '',
                    ], array_values(array_filter(
                        (new NotifyService())->alertLines($branchId, 50),
                        static fn(array $row): bool => empty($row['is_read'])
                    )))
                ),
            ],
            'recent_transfers' => [
                'filename' => 'atoms-recent-transfers-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Transfer', 'From', 'To', 'Status', 'Devices', 'Activity'],
                    array_map(fn($l) => [
                        '#' . ($l['id'] ?? ''),
                        $l['from_branch_name'] ?? '',
                        $l['to_branch_name'] ?? '',
                        $l['status'] ?? '',
                        $l['device_summary'] ?? '',
                        $l['activity_at'] ?? '',
                    ], $pack['recent_transfers'])
                ),
            ],
            'today_transfers' => [
                'filename' => 'atoms-today-transfers-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Transfer', 'From', 'To', 'Status', 'Devices', 'Activity'],
                    array_map(fn($l) => [
                        '#' . ($l['id'] ?? ''),
                        $l['from_branch_name'] ?? '',
                        $l['to_branch_name'] ?? '',
                        $l['status'] ?? '',
                        $l['device_summary'] ?? '',
                        $l['activity_at'] ?? '',
                    ], $pack['today_transfers'])
                ),
            ],
            'recent_stock_counts' => [
                'filename' => 'atoms-recent-stock-counts-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Count', 'Branch', 'Expected', 'Counted', 'Missing', 'Extra', 'Posted'],
                    array_map(fn($l) => [
                        '#' . ($l['id'] ?? ''),
                        $l['branch_name'] ?? '',
                        (int) ($l['expected_qty'] ?? 0),
                        (int) ($l['counted_qty'] ?? 0),
                        (int) ($l['missing_qty'] ?? 0),
                        (int) ($l['extra_qty'] ?? 0),
                        $l['posted_at'] ?? '',
                    ], $pack['recent_stock_counts'])
                ),
            ],
            'today_stock_counts' => [
                'filename' => 'atoms-today-stock-counts-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Count', 'Branch', 'Expected', 'Counted', 'Missing', 'Extra', 'Posted'],
                    array_map(fn($l) => [
                        '#' . ($l['id'] ?? ''),
                        $l['branch_name'] ?? '',
                        (int) ($l['expected_qty'] ?? 0),
                        (int) ($l['counted_qty'] ?? 0),
                        (int) ($l['missing_qty'] ?? 0),
                        (int) ($l['extra_qty'] ?? 0),
                        $l['posted_at'] ?? '',
                    ], $pack['today_stock_counts'])
                ),
            ],
            'recent_repairs' => [
                'filename' => 'atoms-recent-repairs-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Ticket', 'Customer', 'Device', 'Engineer', 'Outcome', 'Completed'],
                    array_map(fn($l) => [
                        $l['ticket_number'] ?? '',
                        $l['customer_name'] ?? '',
                        $l['device_summary'] ?? '',
                        $l['engineer_name'] ?? '',
                        $l['status'] ?? '',
                        $l['completed_at'] ?? '',
                    ], $pack['recent_repairs'])
                ),
            ],
            'today_repairs' => [
                'filename' => 'atoms-today-repairs-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Ticket', 'Customer', 'Device', 'Engineer', 'Outcome', 'Completed'],
                    array_map(fn($l) => [
                        $l['ticket_number'] ?? '',
                        $l['customer_name'] ?? '',
                        $l['device_summary'] ?? '',
                        $l['engineer_name'] ?? '',
                        $l['status'] ?? '',
                        $l['completed_at'] ?? '',
                    ], $pack['today_repairs'])
                ),
            ],
            'recent_approvals' => [
                'filename' => 'atoms-recent-approvals-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Request', 'Type', 'Summary', 'Decision', 'Reviewer', 'Reviewed'],
                    array_map(fn($l) => [
                        '#' . ($l['id'] ?? ''),
                        $l['type_label'] ?? '',
                        $l['summary'] ?? '',
                        $l['status'] ?? '',
                        $l['reviewer_name'] ?? '',
                        $l['reviewed_at'] ?? '',
                    ], $pack['recent_approvals'])
                ),
            ],
            'today_approvals' => [
                'filename' => 'atoms-today-approvals-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Request', 'Type', 'Summary', 'Decision', 'Reviewer', 'Reviewed'],
                    array_map(fn($l) => [
                        '#' . ($l['id'] ?? ''),
                        $l['type_label'] ?? '',
                        $l['summary'] ?? '',
                        $l['status'] ?? '',
                        $l['reviewer_name'] ?? '',
                        $l['reviewed_at'] ?? '',
                    ], $pack['today_approvals'])
                ),
            ],
            'recent_customers' => [
                'filename' => 'atoms-recent-customers-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Customer', 'Phone', 'Balance', 'Created'],
                    array_map(fn($l) => [
                        $l['name'] ?? '',
                        $l['phone'] ?? '',
                        $this->naira((int) ($l['balance'] ?? 0)),
                        $l['created_at'] ?? '',
                    ], $pack['recent_customers'])
                ),
            ],
            'today_customers' => [
                'filename' => 'atoms-today-customers-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Customer', 'Phone', 'Balance', 'Created'],
                    array_map(fn($l) => [
                        $l['name'] ?? '',
                        $l['phone'] ?? '',
                        $this->naira((int) ($l['balance'] ?? 0)),
                        $l['created_at'] ?? '',
                    ], $pack['today_customers'])
                ),
            ],
            'slow_movers' => [
                'filename' => 'atoms-slow-movers-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Product', 'Variant', 'Qty', 'Oldest stock'],
                    array_map(fn($l) => [
                        $l['name'] ?? '',
                        $l['variant_label'] ?? '',
                        (int) ($l['qty'] ?? 0),
                        $l['oldest'] ?? '',
                    ], $pack['slow_movers'])
                ),
            ],
            default => [
                'filename' => 'atoms-receivables-' . $stamp . '.csv',
                'csv'      => $csv->toString(
                    ['Customer', 'Balance'],
                    array_map(fn($p) => [$p['name'] ?? ('#' . $p['party_id']), $this->naira((int) $p['balance_after'])], $pack['receivables']['parties'])
                ),
            ],
        };

        return $this->formatExport($result, $format, $type, $from, $to);
    }

    /**
     * @param array{filename: string, csv: string} $result
     * @return array{csv?: string, html?: string, base64?: string, filename: string, format: string, title?: string}
     */
    private function formatExport(array $result, string $format, string $type, string $from, string $to): array
    {
        $title = 'Abu Twins · ' . str_replace('_', ' ', $type) . ' · ' . ($from === $to ? $from : $from . ' to ' . $to);
        $csv   = (string) ($result['csv'] ?? '');
        $base  = (string) preg_replace('/\.csv$/i', '', (string) ($result['filename'] ?? 'atoms-report'));
        [$headers, $rows] = $this->csvMatrix($csv);

        if ($format === 'docx') {
            $binary = (new DocxExporter())->fromTable($title, $headers, $rows);

            return [
                'format'   => 'docx',
                'filename' => $base . '.docx',
                'title'    => $title,
                'base64'   => base64_encode($binary),
            ];
        }

        if ($format === 'pdf') {
            return [
                'format'   => 'pdf',
                'filename' => $base . '.pdf',
                'title'    => $title,
                'html'     => $this->exportHtml($title, $headers, $rows),
            ];
        }

        return [
            'format'   => 'csv',
            'filename' => $base . '.csv',
            'title'    => $title,
            'csv'      => $csv,
        ];
    }

    /**
     * @return array{0: list<string>, 1: list<list<string>>}
     */
    private function csvMatrix(string $csv): array
    {
        $fh = fopen('php://temp', 'r+');
        if ($fh === false) {
            return [[], []];
        }
        fwrite($fh, $csv);
        rewind($fh);
        $headers = fgetcsv($fh) ?: [];
        $headers = array_map(static fn($h) => (string) $h, $headers);
        $rows    = [];
        while (($cols = fgetcsv($fh)) !== false) {
            if ($cols === [null]) {
                continue;
            }
            $rows[] = array_map(static fn($c) => (string) ($c ?? ''), $cols);
        }
        fclose($fh);

        return [$headers, $rows];
    }

    /**
     * @param list<string>        $headers
     * @param list<list<string>>  $rows
     */
    private function exportHtml(string $title, array $headers, array $rows): string
    {
        $th = '';
        foreach ($headers as $h) {
            $th .= '<th>' . esc_html($h) . '</th>';
        }
        $body = '';
        foreach ($rows as $row) {
            $body .= '<tr>';
            foreach ($headers as $i => $_) {
                $body .= '<td>' . esc_html((string) ($row[$i] ?? '')) . '</td>';
            }
            $body .= '</tr>';
        }
        if ($body === '') {
            $body = '<tr><td colspan="' . max(1, count($headers)) . '">No rows in this period.</td></tr>';
        }

        return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' . esc_html($title) . '</title>'
            . '<style>body{font-family:system-ui,sans-serif;color:#0f172a;padding:24px}'
            . 'h1{font-size:18px;margin:0 0 8px}p{color:#64748b;margin:0 0 16px;font-size:12px}'
            . 'table{width:100%;border-collapse:collapse;font-size:12px}'
            . 'th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}'
            . 'th{background:#f8fafc}@media print{body{padding:0}}</style></head><body>'
            . '<h1>' . esc_html($title) . '</h1>'
            . '<p>Abu Twins Invent · print or Save as PDF</p>'
            . '<table><thead><tr>' . $th . '</tr></thead><tbody>' . $body . '</tbody></table>'
            . '<script>window.onload=function(){window.print();}</script>'
            . '</body></html>';
    }

    /**
     * @return array<string, mixed>
     */
    public function sales(string $from, string $to, ?int $branchId = null): array
    {
        global $wpdb;
        $sales     = $this->db->table('sales');
        $returns   = $this->db->table('returns');
        $customers = $this->db->table('customers');
        [$start, $end] = $this->periodBounds($from, $to);
        $where  = "s.status = 'completed' AND s.posted_at >= %s AND s.posted_at <= %s";
        $params = [$start, $end];
        if ($branchId) {
            $where   .= ' AND s.branch_id = %d';
            $params[] = $branchId;
        }

        $totals = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT COUNT(*) AS invoices, COALESCE(SUM(s.subtotal),0) AS gross, COALESCE(SUM(s.discount),0) AS discounts,
                        COALESCE(SUM(s.total),0) AS net, COALESCE(SUM(s.paid_amount),0) AS collected, COALESCE(SUM(s.due_amount),0) AS receivables
                 FROM {$sales} s WHERE {$where}",
                ...$params
            ),
            ARRAY_A
        ) ?: [];

        $retWhere  = "status = 'completed' AND posted_at >= %s AND posted_at <= %s";
        $retParams = [$start, $end];
        if ($branchId) {
            $retWhere   .= ' AND branch_id = %d';
            $retParams[] = $branchId;
        }
        $refunded = (int) $wpdb->get_var($wpdb->prepare("SELECT COALESCE(SUM(refund_amount),0) FROM {$returns} WHERE {$retWhere}", ...$retParams));

        $cost   = $this->cogs($from, $to, $branchId);
        $net    = (int) ($totals['net'] ?? 0);
        $profit = $net - $cost - $refunded;

        $invoices = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.id, s.invoice_number, s.posted_at, s.total, s.paid_amount, s.due_amount, s.sale_type, s.payment_method,
                        c.name AS customer_name
                 FROM {$sales} s
                 LEFT JOIN {$customers} c ON c.id = s.customer_id
                 WHERE {$where}
                 ORDER BY s.posted_at DESC",
                ...$params
            ),
            ARRAY_A
        ) ?: [];

        $byTypeRows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.sale_type, COUNT(*) AS invoices, COALESCE(SUM(s.total),0) AS net
                 FROM {$sales} s
                 WHERE {$where}
                 GROUP BY s.sale_type",
                ...$params
            ),
            ARRAY_A
        ) ?: [];
        $policy = new WholesalePolicy();
        $byType = [
            WholesalePolicy::RETAIL    => ['invoices' => 0, 'net' => 0],
            WholesalePolicy::WHOLESALE => ['invoices' => 0, 'net' => 0],
        ];
        foreach ($byTypeRows as $typeRow) {
            $key = $policy->normalize((string) ($typeRow['sale_type'] ?? ''));
            $byType[$key]['invoices'] += (int) ($typeRow['invoices'] ?? 0);
            $byType[$key]['net']      += (int) ($typeRow['net'] ?? 0);
        }

        $linesTotal = 0;
        foreach ($invoices as $line) {
            $linesTotal += (int) ($line['total'] ?? 0);
        }

        return [
            'from'         => $from,
            'to'           => $to,
            'branch_id'    => $branchId,
            'invoices'     => (int) ($totals['invoices'] ?? 0),
            'gross'        => (int) ($totals['gross'] ?? 0),
            'discounts'    => (int) ($totals['discounts'] ?? 0),
            'net'          => $net,
            'collected'    => (int) ($totals['collected'] ?? 0),
            'receivables'  => (int) ($totals['receivables'] ?? 0),
            'returns'      => $refunded,
            'cogs'         => $cost,
            'profit'       => $profit,
            'by_type'      => $byType,
            'lines'        => $invoices,
            'lines_total'  => $linesTotal,
            'reconciled'   => $linesTotal === $net,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function saleDeviceLines(string $from, string $to, ?int $branchId = null): array
    {
        global $wpdb;
        $sales     = $this->db->table('sales');
        $items     = $this->db->table('sale_items');
        $imeis     = $this->db->table('imeis');
        $products  = $this->db->table('products');
        $variants  = $this->db->table('product_variants');
        $customers = $this->db->table('customers');
        [$start, $end] = $this->periodBounds($from, $to);
        $where     = "s.status = 'completed' AND s.posted_at >= %s AND s.posted_at <= %s";
        $params    = [$start, $end];
        if ($branchId) {
            $where   .= ' AND s.branch_id = %d';
            $params[] = $branchId;
        }

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.id AS sale_id, s.invoice_number, s.posted_at, s.sale_type, s.total, s.paid_amount, s.due_amount,
                        s.salesperson_id, c.name AS customer_name, i.imei, p.name AS product_name,
                        v.color, v.storage, v.variant_name, si.selling_price
                 FROM {$items} si
                 INNER JOIN {$sales} s ON s.id = si.sale_id
                 INNER JOIN {$imeis} i ON i.id = si.imei_id
                 INNER JOIN {$products} p ON p.id = si.product_id
                 LEFT JOIN {$variants} v ON v.id = si.variant_id
                 LEFT JOIN {$customers} c ON c.id = s.customer_id
                 WHERE {$where}
                 ORDER BY s.posted_at DESC, s.id DESC, si.id ASC",
                ...$params
            ),
            ARRAY_A
        ) ?: [];

        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $row['variant_label'] = $labels->format($row);
            $uid = (int) ($row['salesperson_id'] ?? 0);
            if ($uid) {
                $user = get_userdata($uid);
                $row['salesperson_name'] = $user ? $user->display_name : ('User #' . $uid);
            } else {
                $row['salesperson_name'] = '';
            }
        }
        unset($row);

        return $rows;
    }

    /**
     * @return array<string, mixed>
     */
    public function inventory(?int $branchId = null): array
    {
        global $wpdb;
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $branches = $this->db->table('branches');
        $variants = $this->db->table('product_variants');
        $where    = "i.status = 'available'";
        $params   = [];
        if ($branchId) {
            $where   .= ' AND i.branch_id = %d';
            $params[] = $branchId;
        }

        $sql = "SELECT p.id AS product_id, p.name, p.brand,
                       v.id AS variant_id, v.color, v.storage, v.variant_name,
                       i.branch_id, b.name AS branch_name, b.code AS branch_code,
                       COUNT(*) AS qty, COALESCE(SUM(i.cost_price),0) AS valuation
                FROM {$imeis} i
                INNER JOIN {$products} p ON p.id = i.product_id
                INNER JOIN {$branches} b ON b.id = i.branch_id
                LEFT JOIN {$variants} v ON v.id = i.variant_id
                WHERE {$where}
                GROUP BY p.id, v.id, i.branch_id
                ORDER BY p.name, v.variant_name, b.name";

        $rows = $params
            ? $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A)
            : $wpdb->get_results($sql, ARRAY_A);

        $totals    = [];
        $valuation = 0;
        $labels    = new VariantLabel();
        foreach ($rows ?: [] as $row) {
            $pid = (int) $row['product_id'];
            $vid = (int) ($row['variant_id'] ?? 0);
            $key = $pid . ':' . $vid;
            if (!isset($totals[$key])) {
                $totals[$key] = [
                    'product_id'    => $pid,
                    'variant_id'    => $vid ?: null,
                    'name'          => $row['name'],
                    'variant_label' => $labels->format($row),
                    'brand'         => $row['brand'],
                    'branches'      => [],
                    'total'         => 0,
                    'valuation'     => 0,
                ];
            }
            $totals[$key]['branches'][] = [
                'branch_id'   => (int) $row['branch_id'],
                'branch_name' => $row['branch_name'],
                'branch_code' => $row['branch_code'],
                'qty'         => (int) $row['qty'],
            ];
            $totals[$key]['total']     += (int) $row['qty'];
            $totals[$key]['valuation'] += (int) $row['valuation'];
            $valuation                 += (int) $row['valuation'];
        }

        $faultyWhere  = "status = 'faulty'";
        $faultyParams = [];
        if ($branchId) {
            $faultyWhere   .= ' AND branch_id = %d';
            $faultyParams[] = $branchId;
        }
        $faultySql = "SELECT COUNT(*) AS qty, COALESCE(SUM(cost_price),0) AS valuation FROM {$imeis} WHERE {$faultyWhere}";
        $faulty    = $faultyParams
            ? $wpdb->get_row($wpdb->prepare($faultySql, ...$faultyParams), ARRAY_A)
            : $wpdb->get_row($faultySql, ARRAY_A);
        $qtyStock  = $this->quantityStockTotals($branchId);

        return [
            'products'           => array_values($totals),
            'rows'               => $rows ?: [],
            'available_qty'      => array_sum(array_map(static fn($r) => (int) $r['qty'], $rows ?: [])),
            'available_value'    => $valuation,
            'faulty_qty'         => (int) ($faulty['qty'] ?? 0),
            'faulty_value'       => (int) ($faulty['valuation'] ?? 0),
            'on_hand_value'      => $valuation + (int) ($faulty['valuation'] ?? 0),
            'quantity_qty'       => $qtyStock['qty'],
            'quantity_value'     => $qtyStock['value'],
        ];
    }

    /**
     * @return array{qty: int, value: int, sku_count: int}
     */
    public function quantityStockTotals(?int $branchId = null): array
    {
        global $wpdb;
        $stock    = $this->db->table('branch_stock');
        $products = $this->db->table('products');
        $where    = "p.track_mode = 'quantity' AND p.is_active = 1 AND s.qty_on_hand > 0";
        $params   = [];
        if ($branchId) {
            $where   .= ' AND s.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT COALESCE(SUM(s.qty_on_hand), 0) AS qty,
                       COALESCE(SUM(s.qty_on_hand * s.avg_cost), 0) AS value,
                       COUNT(DISTINCT s.product_id) AS sku_count
                FROM {$stock} s
                INNER JOIN {$products} p ON p.id = s.product_id
                WHERE {$where}";
        $row = $params
            ? $wpdb->get_row($wpdb->prepare($sql, ...$params), ARRAY_A)
            : $wpdb->get_row($sql, ARRAY_A);

        return [
            'qty'       => (int) ($row['qty'] ?? 0),
            'value'     => (int) ($row['value'] ?? 0),
            'sku_count' => (int) ($row['sku_count'] ?? 0),
        ];
    }

    public function inboundReservedCount(?int $branchId = null): int
    {
        global $wpdb;
        $table = $this->db->table('imeis');
        if ($branchId) {
            return (int) $wpdb->get_var(
                $wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE status = 'reserved' AND branch_id = %d", $branchId)
            );
        }

        return (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table} WHERE status = 'reserved'");
    }

    /**
     * @return array<string, int>
     */
    public function imeiSummary(?int $branchId = null): array
    {
        global $wpdb;
        $table = $this->db->table('imeis');
        if ($branchId) {
            $rows = $wpdb->get_results(
                $wpdb->prepare("SELECT status, COUNT(*) AS qty FROM {$table} WHERE branch_id = %d GROUP BY status", $branchId),
                ARRAY_A
            ) ?: [];
        } else {
            $rows = $wpdb->get_results("SELECT status, COUNT(*) AS qty FROM {$table} GROUP BY status", ARRAY_A) ?: [];
        }
        $out = [];
        foreach ($rows as $row) {
            $out[(string) $row['status']] = (int) $row['qty'];
        }

        return $out;
    }

    /**
     * @return list<array{status: string, qty: int}>
     */
    public function imeiStatusLines(?int $branchId = null): array
    {
        $summary = $this->imeiSummary($branchId);
        $lines   = [];
        foreach ($summary as $status => $qty) {
            $lines[] = ['status' => (string) $status, 'qty' => (int) $qty];
        }
        usort($lines, static fn($a, $b) => $b['qty'] <=> $a['qty']);

        return $lines;
    }

    /**
     * @return array{available_qty: int, available_value: int, faulty_qty: int, faulty_value: int, on_hand_value: int}
     */
    public function inventorySnapshot(?int $branchId = null): array
    {
        $inv = $this->inventory($branchId);

        return [
            'available_qty'   => (int) ($inv['available_qty'] ?? 0),
            'available_value' => (int) ($inv['available_value'] ?? 0),
            'faulty_qty'      => (int) ($inv['faulty_qty'] ?? 0),
            'faulty_value'    => (int) ($inv['faulty_value'] ?? 0),
            'on_hand_value'   => (int) ($inv['on_hand_value'] ?? 0),
            'quantity_qty'    => (int) ($inv['quantity_qty'] ?? 0),
            'quantity_value'  => (int) ($inv['quantity_value'] ?? 0),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function inventoryLines(?int $branchId = null, int $limit = 15): array
    {
        $products = $this->inventory($branchId)['products'] ?? [];
        usort($products, static fn($a, $b) => (int) $b['valuation'] <=> (int) $a['valuation']);

        return array_slice($products, 0, max(1, $limit));
    }

    /**
     * @return array{purchase_count: int, purchase_total: int, swap_count: int, swap_collected: int, imei_count: int, supplier_payment_count: int, supplier_payment_total: int, supplier_return_count: int, supplier_return_total: int}
     */
    public function intakeSnapshot(?int $branchId = null): array
    {
        $purchases = (new PurchaseService())->recentLines($branchId, 1);
        $swaps     = (new SwapService())->recentLines($branchId, 1);
        $imeis     = (new ImeiService())->recentLines($branchId, 1);
        $payments  = (new SupplierService())->recentPaymentLines($branchId, 1);
        $returns   = (new SupplierService())->recentReturnLines($branchId, 1);

        return [
            'purchase_count'          => count($purchases),
            'purchase_total'          => array_sum(array_map(static fn($r) => (int) ($r['total'] ?? 0), $purchases)),
            'swap_count'              => count($swaps),
            'swap_collected'          => array_sum(array_map(static fn($r) => (int) ($r['paid_amount'] ?? 0), $swaps)),
            'imei_count'              => count($imeis),
            'inbound_reserved_count'  => $this->inboundReservedCount($branchId),
            'supplier_payment_count'  => count($payments),
            'supplier_payment_total'  => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $payments)),
            'supplier_return_count'   => count($returns),
            'supplier_return_total'   => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $returns)),
        ];
    }

    /**
     * @return array{open_repair_count: int, pending_approval_count: int, in_transit_count: int, open_stock_count_count: int, faulty_device_count: int, pending_expense_count: int, pending_expense_total: int, open_purchase_count: int, open_purchase_total: int, stuck_repair_count: int, stuck_transfer_count: int, stuck_faulty_count: int}
     */
    public function operationsSnapshot(?int $branchId = null): array
    {
        $ops           = (new SettingsService())->expose();
        $repairDays    = (int) ($ops['repair_days'] ?? 3);
        $transferHours = (int) ($ops['transfer_hours'] ?? 24);
        $returnDays    = (int) ($ops['return_days'] ?? 2);

        $openRepairs      = (new RepairService())->openLines($branchId);
        $pendingApprovals = (new ApprovalService())->pendingLines($branchId);
        $inTransit        = (new TransferService())->transitLines($branchId);
        $openCounts       = (new StockCountService())->openLines($branchId);
        $faultyDevices    = (new ImeiService())->faultyLines($branchId);
        $pendingExpenses  = (new ExpenseService())->pendingLines($branchId);
        $openPurchases    = (new PurchaseService())->openLines($branchId);
        $stuckRepairs     = (new RepairService())->openLines($branchId, $repairDays);
        $stuckTransfers   = (new TransferService())->stuckLines($branchId, $transferHours);
        $stuckFaulty      = (new ImeiService())->faultyLines($branchId, $returnDays);
        $qtyStock         = $this->quantityStockTotals($branchId);

        return [
            'open_repair_count'        => count($openRepairs),
            'pending_approval_count'   => count($pendingApprovals),
            'in_transit_count'         => count($inTransit),
            'open_stock_count_count'   => count($openCounts),
            'faulty_device_count'      => count($faultyDevices),
            'pending_expense_count'    => count($pendingExpenses),
            'pending_expense_total'    => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $pendingExpenses)),
            'open_purchase_count'      => count($openPurchases),
            'open_purchase_total'      => array_sum(array_map(static fn($r) => (int) ($r['total'] ?? 0), $openPurchases)),
            'stuck_repair_count'       => count($stuckRepairs),
            'stuck_transfer_count'     => count($stuckTransfers),
            'stuck_faulty_count'       => count($stuckFaulty),
            'inbound_reserved_count'   => $this->inboundReservedCount($branchId),
            'quantity_stock_qty'       => $qtyStock['qty'],
            'quantity_sku_count'       => $qtyStock['sku_count'],
        ];
    }

    /**
     * @return array{overdue_count: int, overdue_total: int, retail_count: int, retail_total: int, wholesale_count: int, wholesale_total: int, open_invoice_count: int, open_invoice_total: int, collection_count: int, collection_total: int, notify_unread: int}
     */
    public function receivablesSnapshot(?int $branchId = null): array
    {
        $debtDays  = (int) ((new SettingsService())->expose()['debt_days'] ?? 7);
        $analytics = new AnalyticsService();
        $overdue   = $analytics->receivableLines($branchId, $debtDays);
        $retail    = $analytics->retailReceivableLines($branchId);
        $wholesale = $analytics->wholesaleReceivableLines($branchId);
        $open      = $analytics->receivableLines($branchId);
        $payments  = (new PaymentService())->recentLines($branchId, 1);

        return [
            'overdue_count'        => count($overdue),
            'overdue_total'        => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $overdue)),
            'retail_count'         => count($retail),
            'retail_total'         => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $retail)),
            'wholesale_count'      => count($wholesale),
            'wholesale_total'      => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $wholesale)),
            'open_invoice_count'   => count($open),
            'open_invoice_total'   => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $open)),
            'collection_count'     => count($payments),
            'collection_total'     => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $payments)),
            'notify_unread'        => (new NotifyService())->unreadCount($branchId),
        ];
    }

    /**
     * @return array{open_payable_count: int, open_payable_total: int, aged_payable_count: int, aged_payable_total: int, open_purchase_count: int, open_purchase_total: int, supplier_payment_count: int, supplier_payment_total: int, supplier_return_count: int, supplier_return_total: int}
     */
    public function payablesSnapshot(?int $branchId = null): array
    {
        $debtDays        = (int) ((new SettingsService())->expose()['debt_days'] ?? 7);
        $openPayables    = (new AnalyticsService())->payableLines($branchId);
        $agedPayables    = array_values(array_filter(
            $openPayables,
            static fn(array $row): bool => (int) ($row['days'] ?? 0) >= max(0, $debtDays)
        ));
        $openPurchases   = (new PurchaseService())->openLines($branchId);
        $supplierPayments = (new SupplierService())->recentPaymentLines($branchId, 1);
        $supplierReturns = (new SupplierService())->recentReturnLines($branchId, 1);

        return [
            'open_payable_count'       => count($openPayables),
            'open_payable_total'       => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $openPayables)),
            'aged_payable_count'       => count($agedPayables),
            'aged_payable_total'       => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $agedPayables)),
            'open_purchase_count'      => count($openPurchases),
            'open_purchase_total'      => array_sum(array_map(static fn($r) => (int) ($r['total'] ?? 0), $openPurchases)),
            'supplier_payment_count'   => count($supplierPayments),
            'supplier_payment_total'   => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $supplierPayments)),
            'supplier_return_count'    => count($supplierReturns),
            'supplier_return_total'    => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $supplierReturns)),
        ];
    }

    /**
     * @return array{return_count: int, return_total: int, reversal_count: int, reversal_total: int, voided_count: int, voided_total: int}
     */
    public function adjustmentsSnapshot(?int $branchId = null): array
    {
        $returns   = (new ReturnService())->recentLines($branchId, 1);
        $reversals = (new PaymentService())->reversalLines($branchId, 1);
        $voided    = (new SaleService())->voidedLines($branchId, 1);

        return [
            'return_count'    => count($returns),
            'return_total'    => array_sum(array_map(static fn($r) => (int) ($r['refund_amount'] ?? 0), $returns)),
            'reversal_count'  => count($reversals),
            'reversal_total'  => array_sum(array_map(static fn($r) => abs((int) ($r['amount'] ?? 0)), $reversals)),
            'voided_count'    => count($voided),
            'voided_total'    => array_sum(array_map(static fn($r) => (int) ($r['total'] ?? 0), $voided)),
        ];
    }

    /**
     * @return array{low_stock_count: int, slow_mover_count: int, top_seller_count: int, top_seller_units: int, top_seller_revenue: int, notify_unread: int, alert_today_count: int}
     */
    public function performanceSnapshot(?int $branchId = null): array
    {
        $lowStock    = (new ProductService())->lowStockAlerts($branchId);
        $slowMovers  = (new AnalyticsService())->slowMovers($branchId);
        $topProducts = (new AnalyticsService())->topProducts(14, $branchId);
        $todayAlerts = (new NotifyService())->recentLines($branchId, 1);

        return [
            'low_stock_count'    => count($lowStock),
            'slow_mover_count'   => count($slowMovers),
            'top_seller_count'   => count($topProducts),
            'top_seller_units'   => array_sum(array_map(static fn($r) => (int) ($r['units'] ?? 0), $topProducts)),
            'top_seller_revenue' => array_sum(array_map(static fn($r) => (int) ($r['revenue'] ?? 0), $topProducts)),
            'notify_unread'      => (new NotifyService())->unreadCount($branchId),
            'alert_today_count'  => count($todayAlerts),
        ];
    }

    /**
     * @return array{staff_count: int, staff_invoices: int, staff_revenue: int, staff_profit: int, top_staff_revenue: int, branch_count: int, branch_invoices: int, branch_revenue: int, top_branch_revenue: int, sales_today_count: int, sales_today_total: int}
     */
    public function staffSnapshot(?int $branchId = null): array
    {
        $staff    = (new AnalyticsService())->staffSales(14, $branchId);
        $branches = (new AnalyticsService())->branchPerformance(14);
        if ($branchId) {
            $branches = array_values(array_filter(
                $branches,
                static fn(array $row): bool => (int) ($row['id'] ?? 0) === $branchId
            ));
        }

        $todaySales = (new SaleService())->recentLines($branchId, 1);
        $activeBranches = array_filter(
            $branches,
            static fn(array $row): bool => (int) ($row['invoices'] ?? 0) > 0
        );

        return [
            'staff_count'        => count($staff),
            'staff_invoices'     => array_sum(array_map(static fn($r) => (int) ($r['invoices'] ?? 0), $staff)),
            'staff_revenue'      => array_sum(array_map(static fn($r) => (int) ($r['revenue'] ?? 0), $staff)),
            'staff_profit'       => array_sum(array_map(static fn($r) => (int) ($r['profit'] ?? 0), $staff)),
            'top_staff_revenue'  => (int) ($staff[0]['revenue'] ?? 0),
            'branch_count'       => count($activeBranches),
            'branch_invoices'    => array_sum(array_map(static fn($r) => (int) ($r['invoices'] ?? 0), $branches)),
            'branch_revenue'     => array_sum(array_map(static fn($r) => (int) ($r['revenue'] ?? 0), $branches)),
            'top_branch_revenue' => (int) ($branches[0]['revenue'] ?? 0),
            'sales_today_count'  => count($todaySales),
            'sales_today_total'  => array_sum(array_map(static fn($r) => (int) ($r['total'] ?? 0), $todaySales)),
        ];
    }

    /**
     * @return array{transfer_count: int, imei_count: int, stock_count_count: int, in_transit_count: int, stuck_transfer_count: int, movement_14d_count: int, sale_event_count: int, transfer_event_count: int, intake_event_count: int}
     */
    public function movementSnapshot(?int $branchId = null): array
    {
        $ops           = (new SettingsService())->expose();
        $transferHours = (int) ($ops['transfer_hours'] ?? 24);
        $transfers     = (new TransferService())->recentLines($branchId, 1);
        $imeis         = (new ImeiService())->recentLines($branchId, 1);
        $stockCounts   = (new StockCountService())->recentLines($branchId, 1);
        $inTransit     = (new TransferService())->transitLines($branchId);
        $stuckTransfers = (new TransferService())->stuckLines($branchId, $transferHours);
        $movement14    = $this->recentMovement($branchId, 14);
        $events        = $movement14['events'];

        $eventQty = static function (array $eventRows, string $type): int {
            foreach ($eventRows as $event) {
                if (($event['event_type'] ?? '') === $type) {
                    return (int) ($event['qty'] ?? 0);
                }
            }

            return 0;
        };

        return [
            'transfer_count'       => count($transfers),
            'imei_count'           => count($imeis),
            'stock_count_count'    => count($stockCounts),
            'in_transit_count'     => count($inTransit),
            'stuck_transfer_count' => count($stuckTransfers),
            'movement_14d_count'   => array_sum(array_map(static fn($e) => (int) ($e['qty'] ?? 0), $events)),
            'sale_event_count'     => $eventQty($events, 'complete_sale'),
            'transfer_event_count' => $eventQty($events, 'transfer_dispatch') + $eventQty($events, 'transfer_receive'),
            'intake_event_count'   => $eventQty($events, 'purchase_received') + $eventQty($events, 'swap_in'),
        ];
    }

    /**
     * @return array{receivable_total: int, receivable_party_count: int, payable_total: int, payable_party_count: int, overdue_count: int, overdue_total: int, open_payable_total: int, cash_in_14d: int, cash_net_14d: int, cash_net_today: int, sales_14d: int, collected_14d: int, collections_today: int}
     */
    public function ledgerSnapshot(?int $branchId = null): array
    {
        $receivablesSnap = $this->receivablesSnapshot($branchId);
        $payablesSnap    = $this->payablesSnapshot($branchId);
        $cash14          = $this->recentCash($branchId, 14);
        $cashToday       = $this->recentCash($branchId, 1);
        $trend           = (new AnalyticsService())->salesTrend(14, $branchId);
        $recvParties     = $this->partyBalances('customer', true);
        $payParties      = $this->partyBalances('supplier', true);

        return [
            'receivable_total'       => is_array($recvParties) ? (int) ($recvParties['total'] ?? 0) : 0,
            'receivable_party_count' => is_array($recvParties) ? count($recvParties['parties'] ?? []) : 0,
            'payable_total'          => is_array($payParties) ? (int) ($payParties['total'] ?? 0) : 0,
            'payable_party_count'    => is_array($payParties) ? count($payParties['parties'] ?? []) : 0,
            'overdue_count'          => (int) ($receivablesSnap['overdue_count'] ?? 0),
            'overdue_total'          => (int) ($receivablesSnap['overdue_total'] ?? 0),
            'open_payable_total'     => (int) ($payablesSnap['open_payable_total'] ?? 0),
            'cash_in_14d'            => (int) ($cash14['inflows'] ?? 0),
            'cash_net_14d'           => (int) ($cash14['net'] ?? 0),
            'cash_net_today'         => (int) ($cashToday['net'] ?? 0),
            'sales_14d'              => array_sum(array_map(static fn($t) => (int) ($t['net'] ?? 0), $trend)),
            'collected_14d'          => array_sum(array_map(static fn($t) => (int) ($t['collected'] ?? 0), $trend)),
            'collections_today'      => (int) ($receivablesSnap['collection_total'] ?? 0),
        ];
    }

    /**
     * @return array{open_repair_count: int, stuck_repair_count: int, completed_today_count: int, completed_14d_count: int, faulty_device_count: int, stuck_faulty_count: int}
     */
    public function repairSnapshot(?int $branchId = null): array
    {
        $ops        = (new SettingsService())->expose();
        $repairDays = (int) ($ops['repair_days'] ?? 3);
        $returnDays = (int) ($ops['return_days'] ?? 2);

        $openRepairs     = (new RepairService())->openLines($branchId);
        $stuckRepairs    = (new RepairService())->openLines($branchId, $repairDays);
        $completedToday  = (new RepairService())->recentLines($branchId, 1);
        $completed14     = (new RepairService())->recentLines($branchId, 14);
        $faultyDevices   = (new ImeiService())->faultyLines($branchId);
        $stuckFaulty     = (new ImeiService())->faultyLines($branchId, $returnDays);

        return [
            'open_repair_count'     => count($openRepairs),
            'stuck_repair_count'    => count($stuckRepairs),
            'completed_today_count' => count($completedToday),
            'completed_14d_count'   => count($completed14),
            'faulty_device_count'   => count($faultyDevices),
            'stuck_faulty_count'    => count($stuckFaulty),
        ];
    }

    /**
     * @return array{pending_approval_count: int, approval_reviewed_today_count: int, audit_today_count: int, audit_14d_count: int, new_customer_today_count: int, new_customer_14d_count: int}
     */
    public function complianceSnapshot(?int $branchId = null): array
    {
        $pendingApprovals = (new ApprovalService())->pendingLines($branchId);
        $reviewedToday    = (new ApprovalService())->recentLines($branchId, 1);
        $auditToday       = (new AuditLogger())->recentLines($branchId, 1);
        $audit14          = (new AuditLogger())->recentLines($branchId, 14);
        $newToday         = (new CustomerService())->recentLines($branchId, 1);
        $new14            = (new CustomerService())->recentLines($branchId, 14);

        return [
            'pending_approval_count'        => count($pendingApprovals),
            'approval_reviewed_today_count' => count($reviewedToday),
            'audit_today_count'             => count($auditToday),
            'audit_14d_count'               => count($audit14),
            'new_customer_today_count'      => count($newToday),
            'new_customer_14d_count'        => count($new14),
        ];
    }

    /**
     * @return array{wholesale_owing_count: int, wholesale_owing_total: int, retail_owing_count: int, retail_owing_total: int, swap_today_count: int, swap_collected_today: int, swap_14d_count: int, swap_collected_14d: int, retail_sales_14d: int, wholesale_sales_14d: int, retail_invoices_14d: int, wholesale_invoices_14d: int}
     */
    public function tradeSnapshot(?int $branchId = null): array
    {
        $analytics  = new AnalyticsService();
        $wholesale  = $analytics->wholesaleReceivableLines($branchId);
        $retail     = $analytics->retailReceivableLines($branchId);
        $swapsToday = (new SwapService())->recentLines($branchId, 1);
        $swaps14    = (new SwapService())->recentLines($branchId, 14);
        $saleTypes  = $analytics->saleTypeMix(14, $branchId);

        $typeMetric = static function (array $types, string $key, string $field): int {
            foreach ($types as $row) {
                if (($row['type'] ?? '') === $key) {
                    return (int) ($row[$field] ?? 0);
                }
            }

            return 0;
        };

        return [
            'wholesale_owing_count'  => count($wholesale),
            'wholesale_owing_total'  => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $wholesale)),
            'retail_owing_count'     => count($retail),
            'retail_owing_total'     => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $retail)),
            'swap_today_count'       => count($swapsToday),
            'swap_collected_today'   => array_sum(array_map(static fn($r) => (int) ($r['paid_amount'] ?? 0), $swapsToday)),
            'swap_14d_count'         => count($swaps14),
            'swap_collected_14d'     => array_sum(array_map(static fn($r) => (int) ($r['paid_amount'] ?? 0), $swaps14)),
            'retail_sales_14d'       => $typeMetric($saleTypes, 'retail', 'net'),
            'wholesale_sales_14d'    => $typeMetric($saleTypes, 'wholesale', 'net'),
            'retail_invoices_14d'    => $typeMetric($saleTypes, 'retail', 'invoices'),
            'wholesale_invoices_14d' => $typeMetric($saleTypes, 'wholesale', 'invoices'),
        ];
    }

    /**
     * @return array{receivable_line_count: int, receivable_total: int, receivable_0_30: int, receivable_31_60: int, receivable_61_90: int, receivable_90_plus: int, payable_line_count: int, payable_total: int, payable_0_30: int, payable_31_60: int, payable_61_90: int, payable_90_plus: int, payment_method_count: int, payment_collected_14d: int}
     */
    public function agingSnapshot(?int $branchId = null): array
    {
        $analytics   = new AnalyticsService();
        $recvAging   = $analytics->receivableAging($branchId);
        $payAging    = $analytics->payableAging($branchId);
        $paymentMix  = $analytics->paymentMix(14, $branchId);
        $recvBuckets = $recvAging['buckets'] ?? [];
        $payBuckets  = $payAging['buckets'] ?? [];

        return [
            'receivable_line_count'  => count($recvAging['lines'] ?? []),
            'receivable_total'       => array_sum(array_map(static fn($v) => (int) $v, $recvBuckets)),
            'receivable_0_30'        => (int) ($recvBuckets['0-30'] ?? 0),
            'receivable_31_60'       => (int) ($recvBuckets['31-60'] ?? 0),
            'receivable_61_90'       => (int) ($recvBuckets['61-90'] ?? 0),
            'receivable_90_plus'     => (int) ($recvBuckets['90+'] ?? 0),
            'payable_line_count'     => count($payAging['lines'] ?? []),
            'payable_total'          => array_sum(array_map(static fn($v) => (int) $v, $payBuckets)),
            'payable_0_30'           => (int) ($payBuckets['0-30'] ?? 0),
            'payable_31_60'          => (int) ($payBuckets['31-60'] ?? 0),
            'payable_61_90'          => (int) ($payBuckets['61-90'] ?? 0),
            'payable_90_plus'        => (int) ($payBuckets['90+'] ?? 0),
            'payment_method_count'   => count($paymentMix),
            'payment_collected_14d'  => array_sum(array_map(static fn($r) => (int) ($r['collected'] ?? 0), $paymentMix)),
        ];
    }

    /**
     * @return array{sales_today_count: int, sales_today_total: int, sales_14d: int, cash_net_today: int, cash_net_14d: int, receivable_total: int, receivable_party_count: int, payable_total: int, payable_party_count: int, overdue_count: int, overdue_total: int, collections_today: int, open_repair_count: int, pending_approval_count: int, in_transit_count: int, available_qty: int, available_value: int, low_stock_count: int, notify_unread: int}
     */
    public function executiveSnapshot(?int $branchId = null): array
    {
        $ledger      = $this->ledgerSnapshot($branchId);
        $staff       = $this->staffSnapshot($branchId);
        $operations  = $this->operationsSnapshot($branchId);
        $inventory   = $this->inventorySnapshot($branchId);
        $performance = $this->performanceSnapshot($branchId);
        $receivables = $this->receivablesSnapshot($branchId);

        return [
            'sales_today_count'        => (int) ($staff['sales_today_count'] ?? 0),
            'sales_today_total'        => (int) ($staff['sales_today_total'] ?? 0),
            'sales_14d'                => (int) ($ledger['sales_14d'] ?? 0),
            'cash_net_today'           => (int) ($ledger['cash_net_today'] ?? 0),
            'cash_net_14d'             => (int) ($ledger['cash_net_14d'] ?? 0),
            'receivable_total'         => (int) ($ledger['receivable_total'] ?? 0),
            'receivable_party_count'   => (int) ($ledger['receivable_party_count'] ?? 0),
            'payable_total'            => (int) ($ledger['payable_total'] ?? 0),
            'payable_party_count'      => (int) ($ledger['payable_party_count'] ?? 0),
            'overdue_count'            => (int) ($receivables['overdue_count'] ?? 0),
            'overdue_total'            => (int) ($receivables['overdue_total'] ?? 0),
            'collections_today'        => (int) ($receivables['collection_total'] ?? 0),
            'open_repair_count'        => (int) ($operations['open_repair_count'] ?? 0),
            'pending_approval_count'   => (int) ($operations['pending_approval_count'] ?? 0),
            'in_transit_count'         => (int) ($operations['in_transit_count'] ?? 0),
            'available_qty'            => (int) ($inventory['available_qty'] ?? 0),
            'available_value'          => (int) ($inventory['available_value'] ?? 0),
            'low_stock_count'          => (int) ($performance['low_stock_count'] ?? 0),
            'notify_unread'            => (int) ($performance['notify_unread'] ?? 0),
        ];
    }

    /**
     * @return array{branch_count: int, active_branch_count: int, invoice_count: int, revenue_14d: int, collected_14d: int, profit_14d: int, due_total: int, stock_qty: int, stock_value: int, top_branch_revenue: int, top_branch_profit: int}
     */
    public function branchSnapshot(?int $branchId = null): array
    {
        $branches = (new AnalyticsService())->branchPerformance(14);
        if ($branchId) {
            $branches = array_values(array_filter(
                $branches,
                static fn(array $row): bool => (int) ($row['id'] ?? 0) === $branchId
            ));
        }

        $activeBranches = array_filter(
            $branches,
            static fn(array $row): bool => (int) ($row['invoices'] ?? 0) > 0
        );
        $profits = array_map(static fn(array $row): int => (int) ($row['profit'] ?? 0), $branches);

        return [
            'branch_count'        => count($branches),
            'active_branch_count' => count($activeBranches),
            'invoice_count'       => array_sum(array_map(static fn(array $row): int => (int) ($row['invoices'] ?? 0), $branches)),
            'revenue_14d'         => array_sum(array_map(static fn(array $row): int => (int) ($row['revenue'] ?? 0), $branches)),
            'collected_14d'       => array_sum(array_map(static fn(array $row): int => (int) ($row['collected'] ?? 0), $branches)),
            'profit_14d'          => array_sum($profits),
            'due_total'           => array_sum(array_map(static fn(array $row): int => (int) ($row['due'] ?? 0), $branches)),
            'stock_qty'           => array_sum(array_map(static fn(array $row): int => (int) ($row['stock_qty'] ?? 0), $branches)),
            'stock_value'         => array_sum(array_map(static fn(array $row): int => (int) ($row['stock_value'] ?? 0), $branches)),
            'top_branch_revenue'  => (int) ($branches[0]['revenue'] ?? 0),
            'top_branch_profit'   => $profits !== [] ? max($profits) : 0,
        ];
    }

    /**
     * @return array{payment_method_count: int, payment_collected_14d: int, top_payment_method: string, top_payment_collected: int, sale_type_count: int, retail_invoices: int, retail_revenue: int, wholesale_invoices: int, wholesale_revenue: int, invoice_count: int, sales_14d: int}
     */
    public function mixSnapshot(?int $branchId = null): array
    {
        $analytics  = new AnalyticsService();
        $paymentMix = $analytics->paymentMix(14, $branchId);
        $saleTypes  = $analytics->saleTypeMix(14, $branchId);

        $typeMetric = static function (array $types, string $key, string $field): int {
            foreach ($types as $row) {
                if (($row['type'] ?? '') === $key) {
                    return (int) ($row[$field] ?? 0);
                }
            }

            return 0;
        };

        return [
            'payment_method_count'  => count($paymentMix),
            'payment_collected_14d' => array_sum(array_map(static fn(array $row): int => (int) ($row['collected'] ?? 0), $paymentMix)),
            'top_payment_method'    => (string) ($paymentMix[0]['method'] ?? ''),
            'top_payment_collected' => (int) ($paymentMix[0]['collected'] ?? 0),
            'sale_type_count'       => count($saleTypes),
            'retail_invoices'       => $typeMetric($saleTypes, 'retail', 'invoices'),
            'retail_revenue'        => $typeMetric($saleTypes, 'retail', 'net'),
            'wholesale_invoices'    => $typeMetric($saleTypes, 'wholesale', 'invoices'),
            'wholesale_revenue'     => $typeMetric($saleTypes, 'wholesale', 'net'),
            'invoice_count'         => array_sum(array_map(static fn(array $row): int => (int) ($row['invoices'] ?? 0), $saleTypes)),
            'sales_14d'             => array_sum(array_map(static fn(array $row): int => (int) ($row['net'] ?? 0), $saleTypes)),
        ];
    }

    /**
     * @return array{top_seller_count: int, top_seller_units: int, top_seller_revenue: int, top_seller_profit: int, top_product_name: string, top_product_profit: int, slow_mover_count: int, slow_mover_qty: int}
     */
    public function productSnapshot(?int $branchId = null): array
    {
        $topProducts = (new AnalyticsService())->topProducts(14, $branchId);
        $slowMovers  = (new AnalyticsService())->slowMovers($branchId);
        $top         = $topProducts[0] ?? null;
        $topName     = '';
        if ($top) {
            $topName = (string) ($top['name'] ?? '');
            if (($top['variant_label'] ?? '') !== '') {
                $topName .= ' · ' . (string) $top['variant_label'];
            }
        }

        return [
            'top_seller_count'   => count($topProducts),
            'top_seller_units'   => array_sum(array_map(static fn(array $row): int => (int) ($row['units'] ?? 0), $topProducts)),
            'top_seller_revenue' => array_sum(array_map(static fn(array $row): int => (int) ($row['revenue'] ?? 0), $topProducts)),
            'top_seller_profit'  => array_sum(array_map(static fn(array $row): int => (int) ($row['profit'] ?? 0), $topProducts)),
            'top_product_name'   => $topName,
            'top_product_profit' => (int) ($top['profit'] ?? 0),
            'slow_mover_count'   => count($slowMovers),
            'slow_mover_qty'     => array_sum(array_map(static fn(array $row): int => (int) ($row['qty'] ?? 0), $slowMovers)),
        ];
    }

    /**
     * @return array{day_count: int, active_day_count: int, invoice_count: int, sales_14d: int, collected_14d: int, sales_today: int, invoices_today: int, best_day_net: int, best_day_date: string, avg_daily_net: int}
     */
    public function trendSnapshot(?int $branchId = null): array
    {
        $trend = (new AnalyticsService())->salesTrend(14, $branchId);
        $activeDays = array_values(array_filter(
            $trend,
            static fn(array $row): bool => (int) ($row['invoices'] ?? 0) > 0
        ));
        $bestDay = null;
        foreach ($activeDays as $row) {
            if ($bestDay === null || (int) ($row['net'] ?? 0) > (int) ($bestDay['net'] ?? 0)) {
                $bestDay = $row;
            }
        }
        $todayRow = $trend[count($trend) - 1] ?? [];
        $sales14d = array_sum(array_map(static fn(array $row): int => (int) ($row['net'] ?? 0), $trend));
        $activeCount = count($activeDays);

        return [
            'day_count'        => count($trend),
            'active_day_count' => $activeCount,
            'invoice_count'    => array_sum(array_map(static fn(array $row): int => (int) ($row['invoices'] ?? 0), $trend)),
            'sales_14d'        => $sales14d,
            'collected_14d'    => array_sum(array_map(static fn(array $row): int => (int) ($row['collected'] ?? 0), $trend)),
            'sales_today'      => (int) ($todayRow['net'] ?? 0),
            'invoices_today'   => (int) ($todayRow['invoices'] ?? 0),
            'best_day_net'     => (int) ($bestDay['net'] ?? 0),
            'best_day_date'    => (string) ($bestDay['date'] ?? ''),
            'avg_daily_net'    => $activeCount > 0 ? (int) round($sales14d / $activeCount) : 0,
        ];
    }

    /**
     * @return array{inflows_14d: int, outflows_14d: int, net_14d: int, expenses_14d: int, supplier_payments_14d: int, refunds_14d: int, at_sale_14d: int, collections_14d: int, inflows_today: int, outflows_today: int, net_today: int}
     */
    public function cashflowSnapshot(?int $branchId = null): array
    {
        $cash14    = $this->recentCash($branchId, 14);
        $cashToday = $this->recentCash($branchId, 1);

        return [
            'inflows_14d'           => (int) ($cash14['inflows'] ?? 0),
            'outflows_14d'          => (int) ($cash14['outflows'] ?? 0),
            'net_14d'               => (int) ($cash14['net'] ?? 0),
            'expenses_14d'          => (int) ($cash14['expenses'] ?? 0),
            'supplier_payments_14d' => (int) ($cash14['supplier_payments'] ?? 0),
            'refunds_14d'           => (int) ($cash14['refunds'] ?? 0),
            'at_sale_14d'           => (int) ($cash14['at_sale_total'] ?? 0),
            'collections_14d'       => (int) ($cash14['collections_total'] ?? 0),
            'inflows_today'         => (int) ($cashToday['inflows'] ?? 0),
            'outflows_today'        => (int) ($cashToday['outflows'] ?? 0),
            'net_today'             => (int) ($cashToday['net'] ?? 0),
        ];
    }

    /**
     * @return array{device_line_count: int, staff_count: int, invoice_count: int, revenue_total: int, top_staff_name: string, top_staff_units: int, devices_today: int, revenue_today: int}
     */
    public function staffDeviceSnapshot(?int $branchId = null): array
    {
        $analytics  = new AnalyticsService();
        $lines14    = $analytics->staffDeviceLines(14, $branchId);
        $linesToday = $analytics->staffDeviceLines(1, $branchId);
        $staffCounts = [];

        foreach ($lines14 as $line) {
            $name = (string) ($line['salesperson_name'] ?? '');
            if ($name === '') {
                $name = 'Unassigned';
            }
            $staffCounts[$name] = ($staffCounts[$name] ?? 0) + 1;
        }

        arsort($staffCounts);
        $topStaff      = (string) (array_key_first($staffCounts) ?? '');
        $topStaffUnits = (int) ($staffCounts[$topStaff] ?? 0);
        $invoices      = array_unique(array_map(
            static fn(array $row): string => (string) ($row['invoice_number'] ?? ''),
            $lines14
        ));

        return [
            'device_line_count' => count($lines14),
            'staff_count'       => count($staffCounts),
            'invoice_count'     => count(array_filter($invoices, static fn(string $invoice): bool => $invoice !== '')),
            'revenue_total'     => array_sum(array_map(static fn(array $row): int => (int) ($row['selling_price'] ?? 0), $lines14)),
            'top_staff_name'    => $topStaff,
            'top_staff_units'   => $topStaffUnits,
            'devices_today'     => count($linesToday),
            'revenue_today'     => array_sum(array_map(static fn(array $row): int => (int) ($row['selling_price'] ?? 0), $linesToday)),
        ];
    }

    /**
     * @return array{low_stock_count: int, low_stock_qty: int, lowest_available: int, available_qty: int, available_value: int, faulty_qty: int, imei_total: int, status_count: int}
     */
    public function stockSnapshot(?int $branchId = null): array
    {
        $lowStock  = (new ProductService())->lowStockAlerts($branchId);
        $inventory = $this->inventorySnapshot($branchId);
        $imeiStatus = $this->imeiStatusLines($branchId);
        $lowQtys   = array_map(static fn(array $row): int => (int) ($row['qty'] ?? 0), $lowStock);
        $qtyStock  = $this->quantityStockTotals($branchId);

        return [
            'low_stock_count'  => count($lowStock),
            'low_stock_qty'    => array_sum($lowQtys),
            'lowest_available' => $lowQtys !== [] ? min($lowQtys) : 0,
            'available_qty'    => (int) ($inventory['available_qty'] ?? 0),
            'available_value'  => (int) ($inventory['available_value'] ?? 0),
            'faulty_qty'       => (int) ($inventory['faulty_qty'] ?? 0),
            'imei_total'       => array_sum(array_map(static fn(array $row): int => (int) ($row['qty'] ?? 0), $imeiStatus)),
            'status_count'     => count($imeiStatus),
            'quantity_qty'     => $qtyStock['qty'],
            'quantity_value'   => $qtyStock['value'],
            'quantity_sku_count' => $qtyStock['sku_count'],
            'inbound_reserved_count' => $this->inboundReservedCount($branchId),
        ];
    }

    /**
     * @return array{imei_total: int, status_count: int, available_qty: int, sold_qty: int, faulty_qty: int, reserved_qty: int, under_repair_qty: int, transferred_qty: int, registered_today: int}
     */
    public function imeiSnapshot(?int $branchId = null): array
    {
        $summary = $this->imeiSummary($branchId);
        $qty     = static fn(string $status) => (int) ($summary[$status] ?? 0);
        $today   = (new ImeiService())->recentLines($branchId, 1);

        return [
            'imei_total'       => array_sum($summary),
            'status_count'     => count($summary),
            'available_qty'    => $qty('available'),
            'sold_qty'         => $qty('sold'),
            'faulty_qty'       => $qty('faulty'),
            'reserved_qty'     => $qty('reserved'),
            'under_repair_qty' => $qty('under_repair'),
            'transferred_qty'  => $qty('transferred'),
            'registered_today' => count($today),
        ];
    }

    /**
     * @return array{in_transit_count: int, in_transit_devices: int, stuck_transfer_count: int, stuck_device_count: int, transfer_count_today: int, dispatched_today: int, received_today: int, outbound_in_transit: int, inbound_in_transit: int}
     */
    public function transferSnapshot(?int $branchId = null): array
    {
        $ops           = (new SettingsService())->expose();
        $transferHours = (int) ($ops['transfer_hours'] ?? 24);
        $transfers     = new TransferService();
        $inTransit     = $transfers->transitLines($branchId);
        $stuck         = $transfers->stuckLines($branchId, $transferHours);
        $today         = $transfers->recentLines($branchId, 1);

        $deviceQty = static fn(array $rows): int => array_sum(array_map(
            static fn(array $row): int => (int) ($row['device_count'] ?? 0),
            $rows
        ));
        $statusCount = static fn(array $rows, string $status): int => count(array_filter(
            $rows,
            static fn(array $row): bool => ($row['status'] ?? '') === $status
        ));

        $outbound = 0;
        $inbound  = 0;
        if ($branchId) {
            foreach ($inTransit as $row) {
                if ((int) ($row['from_branch_id'] ?? 0) === $branchId) {
                    $outbound++;
                }
                if ((int) ($row['to_branch_id'] ?? 0) === $branchId) {
                    $inbound++;
                }
            }
        }

        return [
            'in_transit_count'       => count($inTransit),
            'in_transit_devices'     => $deviceQty($inTransit),
            'stuck_transfer_count'   => count($stuck),
            'stuck_device_count'     => $deviceQty($stuck),
            'transfer_count_today'   => count($today),
            'dispatched_today'       => $statusCount($today, 'dispatched'),
            'received_today'         => $statusCount($today, 'received'),
            'outbound_in_transit'    => $outbound,
            'inbound_in_transit'     => $inbound,
        ];
    }

    /**
     * @return array{open_po_count: int, open_po_total: int, pending_units: int, ordered_count: int, inspecting_count: int, purchase_count_today: int, purchase_total_today: int, purchase_units_today: int}
     */
    public function purchaseSnapshot(?int $branchId = null): array
    {
        $open  = (new PurchaseService())->openLines($branchId);
        $today = (new PurchaseService())->recentLines($branchId, 1);

        $pendingUnits = static fn(array $rows): int => array_sum(array_map(
            static fn(array $row): int => max(0, (int) ($row['units'] ?? 0) - (int) ($row['received'] ?? 0)),
            $rows
        ));
        $statusCount = static fn(array $rows, string $status): int => count(array_filter(
            $rows,
            static fn(array $row): bool => ($row['status'] ?? '') === $status
        ));

        return [
            'open_po_count'        => count($open),
            'open_po_total'        => array_sum(array_map(static fn(array $row): int => (int) ($row['total'] ?? 0), $open)),
            'pending_units'        => $pendingUnits($open),
            'ordered_count'        => $statusCount($open, 'ordered'),
            'inspecting_count'     => $statusCount($open, 'inspecting'),
            'purchase_count_today' => count($today),
            'purchase_total_today' => array_sum(array_map(static fn(array $row): int => (int) ($row['total'] ?? 0), $today)),
            'purchase_units_today' => array_sum(array_map(static fn(array $row): int => (int) ($row['units'] ?? 0), $today)),
        ];
    }

    /**
     * @return array{return_count_today: int, return_total_today: int, return_count_14d: int, return_total_14d: int, swap_count_today: int, swap_collected_today: int, swap_count_14d: int, swap_collected_14d: int, reversal_count_today: int, reversal_total_today: int, voided_count_today: int, voided_total_today: int}
     */
    public function returnsSnapshot(?int $branchId = null): array
    {
        $returnsToday = (new ReturnService())->recentLines($branchId, 1);
        $returns14    = (new ReturnService())->recentLines($branchId, 14);
        $swapsToday   = (new SwapService())->recentLines($branchId, 1);
        $swaps14      = (new SwapService())->recentLines($branchId, 14);
        $reversals    = (new PaymentService())->reversalLines($branchId, 1);
        $voided       = (new SaleService())->voidedLines($branchId, 1);

        return [
            'return_count_today'    => count($returnsToday),
            'return_total_today'    => array_sum(array_map(static fn(array $row): int => (int) ($row['refund_amount'] ?? 0), $returnsToday)),
            'return_count_14d'      => count($returns14),
            'return_total_14d'      => array_sum(array_map(static fn(array $row): int => (int) ($row['refund_amount'] ?? 0), $returns14)),
            'swap_count_today'      => count($swapsToday),
            'swap_collected_today'  => array_sum(array_map(static fn(array $row): int => (int) ($row['paid_amount'] ?? 0), $swapsToday)),
            'swap_count_14d'        => count($swaps14),
            'swap_collected_14d'    => array_sum(array_map(static fn(array $row): int => (int) ($row['paid_amount'] ?? 0), $swaps14)),
            'reversal_count_today'  => count($reversals),
            'reversal_total_today'  => array_sum(array_map(static fn(array $row): int => abs((int) ($row['amount'] ?? 0)), $reversals)),
            'voided_count_today'    => count($voided),
            'voided_total_today'    => array_sum(array_map(static fn(array $row): int => (int) ($row['total'] ?? 0), $voided)),
        ];
    }

    /**
     * @return array{faulty_device_count: int, stuck_faulty_count: int, under_repair_qty: int, returned_qty: int, open_repair_count: int, stuck_repair_count: int, repair_completed_today: int, repair_completed_14d: int}
     */
    public function faultySnapshot(?int $branchId = null): array
    {
        $ops        = (new SettingsService())->expose();
        $repairDays = (int) ($ops['repair_days'] ?? 3);
        $returnDays = (int) ($ops['return_days'] ?? 2);
        $summary    = $this->imeiSummary($branchId);
        $qty        = static fn(string $status): int => (int) ($summary[$status] ?? 0);

        $openRepairs    = (new RepairService())->openLines($branchId);
        $stuckRepairs   = (new RepairService())->openLines($branchId, $repairDays);
        $completedToday = (new RepairService())->recentLines($branchId, 1);
        $completed14    = (new RepairService())->recentLines($branchId, 14);
        $faultyDevices  = (new ImeiService())->faultyLines($branchId);
        $stuckFaulty    = (new ImeiService())->faultyLines($branchId, $returnDays);

        return [
            'faulty_device_count'    => count($faultyDevices),
            'stuck_faulty_count'     => count($stuckFaulty),
            'under_repair_qty'       => $qty('under_repair'),
            'returned_qty'           => $qty('returned'),
            'open_repair_count'      => count($openRepairs),
            'stuck_repair_count'     => count($stuckRepairs),
            'repair_completed_today' => count($completedToday),
            'repair_completed_14d'   => count($completed14),
        ];
    }

    /**
     * @return array{new_customers_today: int, new_customers_14d: int, owing_customer_count: int, receivable_total: int, overdue_count: int, overdue_total: int, retail_owing_count: int, wholesale_owing_count: int}
     */
    public function customerSnapshot(?int $branchId = null): array
    {
        $newToday    = (new CustomerService())->recentLines($branchId, 1);
        $new14       = (new CustomerService())->recentLines($branchId, 14);
        $recvParties = $this->partyBalances('customer', true);
        $receivables = $this->receivablesSnapshot($branchId);
        $retail      = (new AnalyticsService())->retailReceivableLines($branchId);
        $wholesale   = (new AnalyticsService())->wholesaleReceivableLines($branchId);

        return [
            'new_customers_today'  => count($newToday),
            'new_customers_14d'    => count($new14),
            'owing_customer_count' => is_array($recvParties) ? count($recvParties['parties'] ?? []) : 0,
            'receivable_total'     => is_array($recvParties) ? (int) ($recvParties['total'] ?? 0) : 0,
            'overdue_count'        => (int) ($receivables['overdue_count'] ?? 0),
            'overdue_total'        => (int) ($receivables['overdue_total'] ?? 0),
            'retail_owing_count'   => count($retail),
            'wholesale_owing_count'=> count($wholesale),
        ];
    }

    /**
     * @return array{owing_supplier_count: int, payable_total: int, open_payable_count: int, open_payable_total: int, aged_payable_count: int, aged_payable_total: int, open_po_count: int, open_po_total: int, supplier_payment_count_today: int, supplier_payment_total_today: int, supplier_return_count_today: int, supplier_return_total_today: int}
     */
    public function supplierSnapshot(?int $branchId = null): array
    {
        $payParties = $this->partyBalances('supplier', true);
        $payables   = $this->payablesSnapshot($branchId);

        return [
            'owing_supplier_count'          => is_array($payParties) ? count($payParties['parties'] ?? []) : 0,
            'payable_total'                 => is_array($payParties) ? (int) ($payParties['total'] ?? 0) : 0,
            'open_payable_count'            => (int) ($payables['open_payable_count'] ?? 0),
            'open_payable_total'            => (int) ($payables['open_payable_total'] ?? 0),
            'aged_payable_count'            => (int) ($payables['aged_payable_count'] ?? 0),
            'aged_payable_total'            => (int) ($payables['aged_payable_total'] ?? 0),
            'open_po_count'                 => (int) ($payables['open_purchase_count'] ?? 0),
            'open_po_total'                 => (int) ($payables['open_purchase_total'] ?? 0),
            'supplier_payment_count_today'  => (int) ($payables['supplier_payment_count'] ?? 0),
            'supplier_payment_total_today'  => (int) ($payables['supplier_payment_total'] ?? 0),
            'supplier_return_count_today'   => (int) ($payables['supplier_return_count'] ?? 0),
            'supplier_return_total_today'   => (int) ($payables['supplier_return_total'] ?? 0),
        ];
    }

    /**
     * @return array{open_count_count: int, pending_approval_count: int, open_missing_units: int, open_extra_units: int, posted_today_count: int, posted_14d_count: int, missing_units_today: int, missing_units_14d: int}
     */
    public function countSnapshot(?int $branchId = null): array
    {
        $openCounts  = (new StockCountService())->openLines($branchId);
        $postedToday = (new StockCountService())->recentLines($branchId, 1);
        $posted14    = (new StockCountService())->recentLines($branchId, 14);

        $openCount            = 0;
        $pendingApprovalCount = 0;
        $openMissing          = 0;
        $openExtra            = 0;
        foreach ($openCounts as $row) {
            if (($row['status'] ?? '') === 'open') {
                $openCount++;
            } elseif (($row['status'] ?? '') === 'pending_approval') {
                $pendingApprovalCount++;
            }
            $openMissing += (int) ($row['missing_qty'] ?? 0);
            $openExtra   += (int) ($row['extra_qty'] ?? 0);
        }

        $sumMissing = static fn(array $rows): int => array_sum(array_map(static fn($r) => (int) ($r['missing_qty'] ?? 0), $rows));

        return [
            'open_count_count'       => $openCount,
            'pending_approval_count' => $pendingApprovalCount,
            'open_missing_units'     => $openMissing,
            'open_extra_units'       => $openExtra,
            'posted_today_count'     => count($postedToday),
            'posted_14d_count'       => count($posted14),
            'missing_units_today'    => $sumMissing($postedToday),
            'missing_units_14d'      => $sumMissing($posted14),
        ];
    }

    /**
     * @return array{pending_count: int, price_override_count: int, expense_count: int, stock_variance_count: int, reviewed_today_count: int, reviewed_14d_count: int, approved_today_count: int, rejected_today_count: int}
     */
    public function approvalSnapshot(?int $branchId = null): array
    {
        global $wpdb;
        $table = $this->db->table('approvals');
        $today = function_exists('current_time') ? current_time('Y-m-d') : gmdate('Y-m-d');
        $start = $today . ' 00:00:00';
        $end   = $today . ' 23:59:59';

        $countPending = static function (string $type, ?int $branchId) use ($wpdb, $table): int {
            $where  = "status = 'pending' AND type = %s";
            $params = [$type];
            if ($branchId) {
                $where   .= ' AND branch_id = %d';
                $params[] = $branchId;
            }

            return (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where}", ...$params));
        };

        $countReviewed = static function (string $status, int $days, ?int $branchId) use ($wpdb, $table): int {
            $where  = "status = %s AND reviewed_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
            $params = [$status, max(1, $days)];
            if ($branchId) {
                $where   .= ' AND branch_id = %d';
                $params[] = $branchId;
            }

            return (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where}", ...$params));
        };

        $countReviewedToday = static function (?int $branchId) use ($wpdb, $table, $start, $end): int {
            $where  = "status IN ('approved','rejected') AND reviewed_at >= %s AND reviewed_at <= %s";
            $params = [$start, $end];
            if ($branchId) {
                $where   .= ' AND branch_id = %d';
                $params[] = $branchId;
            }

            return (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where}", ...$params));
        };

        $countStatusToday = static function (string $status, ?int $branchId) use ($wpdb, $table, $start, $end): int {
            $where  = "status = %s AND reviewed_at >= %s AND reviewed_at <= %s";
            $params = [$status, $start, $end];
            if ($branchId) {
                $where   .= ' AND branch_id = %d';
                $params[] = $branchId;
            }

            return (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where}", ...$params));
        };

        $pendingTotal = $countPending('price_override', $branchId)
            + $countPending('expense', $branchId)
            + $countPending('stock_adjustment', $branchId);

        return [
            'pending_count'         => $pendingTotal,
            'price_override_count'  => $countPending('price_override', $branchId),
            'expense_count'         => $countPending('expense', $branchId),
            'stock_variance_count'  => $countPending('stock_adjustment', $branchId),
            'reviewed_today_count'  => $countReviewedToday($branchId),
            'reviewed_14d_count'    => $countReviewed('approved', 14, $branchId) + $countReviewed('rejected', 14, $branchId),
            'approved_today_count'  => $countStatusToday('approved', $branchId),
            'rejected_today_count'  => $countStatusToday('rejected', $branchId),
        ];
    }

    /**
     * @return array{event_count_today: int, event_count_14d: int, user_count_14d: int, entity_type_count_14d: int, sale_event_count_14d: int, approval_event_count_14d: int, inventory_event_count_14d: int, top_action_14d: string}
     */
    public function auditSnapshot(?int $branchId = null): array
    {
        global $wpdb;
        $table = $this->db->table('audit_logs');
        $today = function_exists('current_time') ? current_time('Y-m-d') : gmdate('Y-m-d');
        $start = $today . ' 00:00:00';
        $end   = $today . ' 23:59:59';

        $countWhere = static function (string $window, ?int $branchId) use ($wpdb, $table, $start, $end): int {
            if ($window === 'today') {
                $where  = 'created_at >= %s AND created_at <= %s';
                $params = [$start, $end];
            } else {
                $where  = 'created_at >= DATE_SUB(NOW(), INTERVAL %d DAY)';
                $params = [max(1, (int) $window)];
            }
            if ($branchId) {
                $where   .= ' AND branch_id = %d';
                $params[] = $branchId;
            }

            return (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where}", ...$params));
        };

        $countMatch = static function (string $matchWhere, ?int $branchId) use ($wpdb, $table): int {
            $where  = "created_at >= DATE_SUB(NOW(), INTERVAL %d DAY) AND ({$matchWhere})";
            $params = [14];
            if ($branchId) {
                $where   .= ' AND branch_id = %d';
                $params[] = $branchId;
            }

            return (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where}", ...$params));
        };

        $distinct = static function (string $column, ?int $branchId) use ($wpdb, $table): int {
            $where  = 'created_at >= DATE_SUB(NOW(), INTERVAL %d DAY)';
            $params = [14];
            if ($branchId) {
                $where   .= ' AND branch_id = %d';
                $params[] = $branchId;
            }

            return (int) $wpdb->get_var(
                $wpdb->prepare("SELECT COUNT(DISTINCT {$column}) FROM {$table} WHERE {$where}", ...$params)
            );
        };

        $topAction = static function (?int $branchId) use ($wpdb, $table): string {
            $where  = 'created_at >= DATE_SUB(NOW(), INTERVAL %d DAY)';
            $params = [14];
            if ($branchId) {
                $where   .= ' AND branch_id = %d';
                $params[] = $branchId;
            }
            $row = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT action, COUNT(*) AS cnt FROM {$table} WHERE {$where} GROUP BY action ORDER BY cnt DESC LIMIT 1",
                    ...$params
                ),
                ARRAY_A
            );

            return (string) ($row['action'] ?? '');
        };

        return [
            'event_count_today'        => $countWhere('today', $branchId),
            'event_count_14d'          => $countWhere('14', $branchId),
            'user_count_14d'           => $distinct('user_id', $branchId),
            'entity_type_count_14d'    => $distinct('entity_type', $branchId),
            'sale_event_count_14d'     => $countMatch("entity_type = 'sale' OR action LIKE 'sale.%'", $branchId),
            'approval_event_count_14d' => $countMatch("entity_type = 'approval' OR action LIKE 'approval.%'", $branchId),
            'inventory_event_count_14d'=> $countMatch(
                "entity_type IN ('imei','stock_count','transfer') OR action LIKE 'imei.%' OR action LIKE 'stock_count.%' OR action LIKE 'transfer.%'",
                $branchId
            ),
            'top_action_14d'           => $topAction($branchId),
        ];
    }

    /**
     * @return array{owing_customer_count: int, receivable_total: int, overdue_count: int, overdue_total: int, open_invoice_count: int, open_invoice_total: int, retail_owing_count: int, wholesale_owing_count: int, collection_count_today: int, collection_total_today: int, collection_count_14d: int, collection_total_14d: int}
     */
    public function collectionSnapshot(?int $branchId = null): array
    {
        $receivables     = $this->receivablesSnapshot($branchId);
        $recvParties     = $this->partyBalances('customer', true);
        $collectionsToday = (new PaymentService())->recentLines($branchId, 1);
        $collections14   = (new PaymentService())->recentLines($branchId, 14);
        $retail          = (new AnalyticsService())->retailReceivableLines($branchId);
        $wholesale       = (new AnalyticsService())->wholesaleReceivableLines($branchId);

        return [
            'owing_customer_count'   => is_array($recvParties) ? count($recvParties['parties'] ?? []) : 0,
            'receivable_total'       => is_array($recvParties) ? (int) ($recvParties['total'] ?? 0) : 0,
            'overdue_count'          => (int) ($receivables['overdue_count'] ?? 0),
            'overdue_total'          => (int) ($receivables['overdue_total'] ?? 0),
            'open_invoice_count'     => (int) ($receivables['open_invoice_count'] ?? 0),
            'open_invoice_total'     => (int) ($receivables['open_invoice_total'] ?? 0),
            'retail_owing_count'     => count($retail),
            'wholesale_owing_count'  => count($wholesale),
            'collection_count_today' => count($collectionsToday),
            'collection_total_today'   => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $collectionsToday)),
            'collection_count_14d'   => count($collections14),
            'collection_total_14d'     => array_sum(array_map(static fn($r) => (int) ($r['amount'] ?? 0), $collections14)),
        ];
    }

    /**
     * @return array{unread_count: int, alert_count_today: int, alert_count_14d: int, low_stock_alert_count_14d: int, debt_alert_count_14d: int, approval_alert_count_14d: int, ops_alert_count_14d: int}
     */
    public function alertSnapshot(?int $branchId = null): array
    {
        global $wpdb;
        $table = $this->db->table('notifications');
        $uid   = (new Context())->userId();
        $today = function_exists('current_time') ? current_time('Y-m-d') : gmdate('Y-m-d');
        $start = $today . ' 00:00:00';
        $end   = $today . ' 23:59:59';

        $countWhere = static function (string $window, ?int $branchId) use ($wpdb, $table, $uid, $start, $end): int {
            $where  = '(user_id IS NULL OR user_id = %d)';
            $params = [$uid];
            if ($window === 'today') {
                $where   .= ' AND created_at >= %s AND created_at <= %s';
                $params[] = $start;
                $params[] = $end;
            } else {
                $where   .= ' AND created_at >= DATE_SUB(NOW(), INTERVAL %d DAY)';
                $params[] = max(1, (int) $window);
            }
            if ($branchId) {
                $where   .= ' AND (branch_id IS NULL OR branch_id = %d)';
                $params[] = $branchId;
            }

            return (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where}", ...$params));
        };

        $countType = static function (string $type, int $days, ?int $branchId) use ($wpdb, $table, $uid): int {
            $where  = 'type = %s AND (user_id IS NULL OR user_id = %d) AND created_at >= DATE_SUB(NOW(), INTERVAL %d DAY)';
            $params = [$type, $uid, max(1, $days)];
            if ($branchId) {
                $where   .= ' AND (branch_id IS NULL OR branch_id = %d)';
                $params[] = $branchId;
            }

            return (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where}", ...$params));
        };

        $countTypes = static function (array $types, int $days, ?int $branchId) use ($countType): int {
            $total = 0;
            foreach ($types as $type) {
                $total += $countType($type, $days, $branchId);
            }

            return $total;
        };

        return [
            'unread_count'               => (new NotifyService())->unreadCount($branchId),
            'alert_count_today'          => $countWhere('today', $branchId),
            'alert_count_14d'            => $countWhere('14', $branchId),
            'low_stock_alert_count_14d'  => $countType('low_stock', 14, $branchId),
            'debt_alert_count_14d'       => $countType('outstanding_debt', 14, $branchId),
            'approval_alert_count_14d'   => $countTypes(['approval_request', 'approval_reminder'], 14, $branchId),
            'ops_alert_count_14d'        => $countTypes(['transfer_stuck', 'repair_stuck', 'return_escalation'], 14, $branchId),
        ];
    }

    /**
     * @return array{sale_count_today: int, sale_total_today: int, collected_today: int, due_total_today: int, credit_sale_count_today: int, sale_count_14d: int, sale_total_14d: int, collected_14d: int, retail_count_14d: int, wholesale_count_14d: int, voided_count_today: int, voided_total_today: int}
     */
    public function salesSnapshot(?int $branchId = null): array
    {
        $salesToday  = (new SaleService())->recentLines($branchId, 1);
        $sales14     = (new SaleService())->recentLines($branchId, 14);
        $voidedToday = (new SaleService())->voidedLines($branchId, 1);

        $sum = static fn(array $rows, string $key): int => array_sum(
            array_map(static fn(array $row): int => (int) ($row[$key] ?? 0), $rows)
        );
        $countType = static fn(array $rows, string $type): int => count(array_filter(
            $rows,
            static fn(array $row): bool => (string) ($row['sale_type'] ?? 'retail') === $type
        ));
        $creditCount = static fn(array $rows): int => count(array_filter(
            $rows,
            static fn(array $row): bool => (int) ($row['due_amount'] ?? 0) > 0
        ));

        return [
            'sale_count_today'       => count($salesToday),
            'sale_total_today'       => $sum($salesToday, 'total'),
            'collected_today'        => $sum($salesToday, 'paid_amount'),
            'due_total_today'        => $sum($salesToday, 'due_amount'),
            'credit_sale_count_today'=> $creditCount($salesToday),
            'sale_count_14d'         => count($sales14),
            'sale_total_14d'         => $sum($sales14, 'total'),
            'collected_14d'          => $sum($sales14, 'paid_amount'),
            'retail_count_14d'       => $countType($sales14, 'retail'),
            'wholesale_count_14d'    => $countType($sales14, 'wholesale'),
            'voided_count_today'     => count($voidedToday),
            'voided_total_today'     => $sum($voidedToday, 'total'),
        ];
    }

    /**
     * @return array{customer_payment_count_today: int, customer_payment_total_today: int, customer_payment_count_14d: int, customer_payment_total_14d: int, supplier_payment_count_today: int, supplier_payment_total_today: int, supplier_payment_count_14d: int, supplier_payment_total_14d: int, reversal_count_today: int, reversal_total_today: int, reversal_count_14d: int, reversal_total_14d: int}
     */
    public function paymentSnapshot(?int $branchId = null): array
    {
        $postedOnly = static fn(array $rows): array => array_values(array_filter(
            $rows,
            static fn(array $row): bool => (string) ($row['status'] ?? '') === 'posted'
        ));
        $customerToday  = $postedOnly((new PaymentService())->recentLines($branchId, 1));
        $customer14     = $postedOnly((new PaymentService())->recentLines($branchId, 14));
        $supplierToday  = (new SupplierService())->recentPaymentLines($branchId, 1);
        $supplier14     = (new SupplierService())->recentPaymentLines($branchId, 14);
        $reversalsToday = (new PaymentService())->reversalLines($branchId, 1);
        $reversals14    = (new PaymentService())->reversalLines($branchId, 14);

        $sum = static fn(array $rows, string $key): int => array_sum(
            array_map(static fn(array $row): int => (int) ($row[$key] ?? 0), $rows)
        );
        $absSum = static fn(array $rows, string $key): int => array_sum(
            array_map(static fn(array $row): int => abs((int) ($row[$key] ?? 0)), $rows)
        );

        return [
            'customer_payment_count_today' => count($customerToday),
            'customer_payment_total_today' => $sum($customerToday, 'amount'),
            'customer_payment_count_14d' => count($customer14),
            'customer_payment_total_14d' => $sum($customer14, 'amount'),
            'supplier_payment_count_today' => count($supplierToday),
            'supplier_payment_total_today' => $sum($supplierToday, 'amount'),
            'supplier_payment_count_14d' => count($supplier14),
            'supplier_payment_total_14d' => $sum($supplier14, 'amount'),
            'reversal_count_today'       => count($reversalsToday),
            'reversal_total_today'       => $absSum($reversalsToday, 'amount'),
            'reversal_count_14d'         => count($reversals14),
            'reversal_total_14d'         => $absSum($reversals14, 'amount'),
        ];
    }

    /**
     * @return array{swap_count_today: int, collected_today: int, difference_total_today: int, swap_count_14d: int, collected_14d: int, difference_total_14d: int, upgrade_count_14d: int, downgrade_count_14d: int, even_swap_count_14d: int}
     */
    public function swapSnapshot(?int $branchId = null): array
    {
        $swapsToday = (new SwapService())->recentLines($branchId, 1);
        $swaps14    = (new SwapService())->recentLines($branchId, 14);

        $sum = static fn(array $rows, string $key): int => array_sum(
            array_map(static fn(array $row): int => (int) ($row[$key] ?? 0), $rows)
        );
        $countDiff = static fn(array $rows, int $sign): int => count(array_filter(
            $rows,
            static function (array $row) use ($sign): bool {
                $diff = (int) ($row['difference'] ?? 0);
                if ($sign > 0) {
                    return $diff > 0;
                }
                if ($sign < 0) {
                    return $diff < 0;
                }

                return $diff === 0;
            }
        ));

        return [
            'swap_count_today'       => count($swapsToday),
            'collected_today'        => $sum($swapsToday, 'paid_amount'),
            'difference_total_today' => $sum($swapsToday, 'difference'),
            'swap_count_14d'         => count($swaps14),
            'collected_14d'          => $sum($swaps14, 'paid_amount'),
            'difference_total_14d'   => $sum($swaps14, 'difference'),
            'upgrade_count_14d'      => $countDiff($swaps14, 1),
            'downgrade_count_14d'    => $countDiff($swaps14, -1),
            'even_swap_count_14d'    => $countDiff($swaps14, 0),
        ];
    }

    /**
     * @return array{return_count_today: int, return_total_today: int, return_count_14d: int, return_total_14d: int, refund_resolution_count_14d: int, replacement_resolution_count_14d: int, faulty_return_count_14d: int, warranty_return_count_14d: int}
     */
    public function returnSnapshot(?int $branchId = null): array
    {
        $returnsToday = (new ReturnService())->recentLines($branchId, 1);
        $returns14    = (new ReturnService())->recentLines($branchId, 14);

        $sum = static fn(array $rows, string $key): int => array_sum(
            array_map(static fn(array $row): int => (int) ($row[$key] ?? 0), $rows)
        );
        $countField = static fn(array $rows, string $field, string $value): int => count(array_filter(
            $rows,
            static fn(array $row): bool => (string) ($row[$field] ?? '') === $value
        ));

        return [
            'return_count_today'             => count($returnsToday),
            'return_total_today'             => $sum($returnsToday, 'refund_amount'),
            'return_count_14d'               => count($returns14),
            'return_total_14d'               => $sum($returns14, 'refund_amount'),
            'refund_resolution_count_14d'      => $countField($returns14, 'resolution', 'refund'),
            'replacement_resolution_count_14d' => $countField($returns14, 'resolution', 'replacement'),
            'faulty_return_count_14d'        => $countField($returns14, 'return_type', 'faulty'),
            'warranty_return_count_14d'      => $countField($returns14, 'return_type', 'warranty'),
        ];
    }

    /**
     * @return array{reversal_count_today: int, reversal_total_today: int, reversal_count_14d: int, reversal_total_14d: int, voided_count_today: int, voided_total_today: int, voided_count_14d: int, voided_total_14d: int, adjustment_count_today: int, adjustment_total_today: int}
     */
    public function adjustmentSnapshot(?int $branchId = null): array
    {
        $reversalsToday = (new PaymentService())->reversalLines($branchId, 1);
        $reversals14    = (new PaymentService())->reversalLines($branchId, 14);
        $voidedToday    = (new SaleService())->voidedLines($branchId, 1);
        $voided14       = (new SaleService())->voidedLines($branchId, 14);

        $sum = static fn(array $rows, string $key): int => array_sum(
            array_map(static fn(array $row): int => (int) ($row[$key] ?? 0), $rows)
        );
        $absSum = static fn(array $rows, string $key): int => array_sum(
            array_map(static fn(array $row): int => abs((int) ($row[$key] ?? 0)), $rows)
        );

        $reversalTotalToday = $absSum($reversalsToday, 'amount');
        $voidedTotalToday   = $sum($voidedToday, 'total');

        return [
            'reversal_count_today'   => count($reversalsToday),
            'reversal_total_today'   => $reversalTotalToday,
            'reversal_count_14d'     => count($reversals14),
            'reversal_total_14d'     => $absSum($reversals14, 'amount'),
            'voided_count_today'     => count($voidedToday),
            'voided_total_today'     => $voidedTotalToday,
            'voided_count_14d'       => count($voided14),
            'voided_total_14d'       => $sum($voided14, 'total'),
            'adjustment_count_today' => count($reversalsToday) + count($voidedToday),
            'adjustment_total_today' => $reversalTotalToday + $voidedTotalToday,
        ];
    }

    /**
     * @return array{open_po_count: int, open_po_total: int, pending_units: int, ordered_count: int, inspecting_count: int, purchase_count_today: int, purchase_total_today: int, purchase_units_today: int, purchase_count_14d: int, purchase_total_14d: int, purchase_units_14d: int}
     */
    public function procurementSnapshot(?int $branchId = null): array
    {
        $base     = $this->purchaseSnapshot($branchId);
        $recent14 = (new PurchaseService())->recentLines($branchId, 14);

        return array_merge($base, [
            'purchase_count_14d' => count($recent14),
            'purchase_total_14d' => array_sum(array_map(static fn(array $row): int => (int) ($row['total'] ?? 0), $recent14)),
            'purchase_units_14d' => array_sum(array_map(static fn(array $row): int => (int) ($row['units'] ?? 0), $recent14)),
        ]);
    }

    /**
     * @return array{purchase_count_today: int, purchase_total_today: int, imei_count_today: int, supplier_payment_count_today: int, supplier_payment_total_today: int, swap_count_today: int, swap_collected_today: int, supplier_return_count_today: int, supplier_return_total_today: int, purchase_count_14d: int, purchase_total_14d: int, imei_count_14d: int, supplier_payment_count_14d: int, supplier_payment_total_14d: int, swap_count_14d: int, swap_collected_14d: int, supplier_return_count_14d: int, supplier_return_total_14d: int, receiving_count_today: int, receiving_count_14d: int}
     */
    public function receivingSnapshot(?int $branchId = null): array
    {
        $today       = $this->intakeSnapshot($branchId);
        $purchases14 = (new PurchaseService())->recentLines($branchId, 14);
        $swaps14     = (new SwapService())->recentLines($branchId, 14);
        $imeis14     = (new ImeiService())->recentLines($branchId, 14);
        $payments14  = (new SupplierService())->recentPaymentLines($branchId, 14);
        $returns14   = (new SupplierService())->recentReturnLines($branchId, 14);

        $sum = static fn(array $rows, string $key): int => array_sum(
            array_map(static fn(array $row): int => (int) ($row[$key] ?? 0), $rows)
        );

        $purchaseCountToday = (int) ($today['purchase_count'] ?? 0);
        $imeiCountToday     = (int) ($today['imei_count'] ?? 0);
        $paymentCountToday  = (int) ($today['supplier_payment_count'] ?? 0);
        $swapCountToday     = (int) ($today['swap_count'] ?? 0);
        $returnCountToday   = (int) ($today['supplier_return_count'] ?? 0);

        $purchaseCount14 = count($purchases14);
        $imeiCount14     = count($imeis14);
        $paymentCount14  = count($payments14);
        $swapCount14     = count($swaps14);
        $returnCount14   = count($returns14);

        return [
            'purchase_count_today'           => $purchaseCountToday,
            'purchase_total_today'           => (int) ($today['purchase_total'] ?? 0),
            'imei_count_today'               => $imeiCountToday,
            'supplier_payment_count_today'   => $paymentCountToday,
            'supplier_payment_total_today'   => (int) ($today['supplier_payment_total'] ?? 0),
            'swap_count_today'               => $swapCountToday,
            'swap_collected_today'           => (int) ($today['swap_collected'] ?? 0),
            'supplier_return_count_today'    => $returnCountToday,
            'supplier_return_total_today'    => (int) ($today['supplier_return_total'] ?? 0),
            'purchase_count_14d'             => $purchaseCount14,
            'purchase_total_14d'             => $sum($purchases14, 'total'),
            'imei_count_14d'                 => $imeiCount14,
            'supplier_payment_count_14d'     => $paymentCount14,
            'supplier_payment_total_14d'     => $sum($payments14, 'amount'),
            'swap_count_14d'                 => $swapCount14,
            'swap_collected_14d'             => $sum($swaps14, 'paid_amount'),
            'supplier_return_count_14d'      => $returnCount14,
            'supplier_return_total_14d'      => $sum($returns14, 'amount'),
            'receiving_count_today'          => $purchaseCountToday + $imeiCountToday + $paymentCountToday + $swapCountToday + $returnCountToday,
            'receiving_count_14d'            => $purchaseCount14 + $imeiCount14 + $paymentCount14 + $swapCount14 + $returnCount14,
        ];
    }

    /**
     * @return array{owing_supplier_count: int, payable_total: int, open_payable_count: int, open_payable_total: int, aged_payable_count: int, aged_payable_total: int, open_po_count: int, open_po_total: int, supplier_payment_count_today: int, supplier_payment_total_today: int, supplier_payment_count_14d: int, supplier_payment_total_14d: int, supplier_return_count_today: int, supplier_return_total_today: int, supplier_return_count_14d: int, supplier_return_total_14d: int}
     */
    public function payableSnapshot(?int $branchId = null): array
    {
        $base       = $this->supplierSnapshot($branchId);
        $payments14 = (new SupplierService())->recentPaymentLines($branchId, 14);
        $returns14  = (new SupplierService())->recentReturnLines($branchId, 14);

        $sum = static fn(array $rows, string $key): int => array_sum(
            array_map(static fn(array $row): int => (int) ($row[$key] ?? 0), $rows)
        );

        return [
            'owing_supplier_count'         => (int) ($base['owing_supplier_count'] ?? 0),
            'payable_total'                => (int) ($base['payable_total'] ?? 0),
            'open_payable_count'           => (int) ($base['open_payable_count'] ?? 0),
            'open_payable_total'           => (int) ($base['open_payable_total'] ?? 0),
            'aged_payable_count'           => (int) ($base['aged_payable_count'] ?? 0),
            'aged_payable_total'           => (int) ($base['aged_payable_total'] ?? 0),
            'open_po_count'                => (int) ($base['open_po_count'] ?? 0),
            'open_po_total'                => (int) ($base['open_po_total'] ?? 0),
            'supplier_payment_count_today' => (int) ($base['supplier_payment_count_today'] ?? 0),
            'supplier_payment_total_today' => (int) ($base['supplier_payment_total_today'] ?? 0),
            'supplier_payment_count_14d'   => count($payments14),
            'supplier_payment_total_14d'   => $sum($payments14, 'amount'),
            'supplier_return_count_today'  => (int) ($base['supplier_return_count_today'] ?? 0),
            'supplier_return_total_today'  => (int) ($base['supplier_return_total_today'] ?? 0),
            'supplier_return_count_14d'    => count($returns14),
            'supplier_return_total_14d'    => $sum($returns14, 'amount'),
        ];
    }

    /**
     * @return array{owing_customer_count: int, receivable_total: int, overdue_count: int, overdue_total: int, open_invoice_count: int, open_invoice_total: int, retail_owing_count: int, wholesale_owing_count: int, new_customers_today: int, new_customers_14d: int, collection_count_today: int, collection_total_today: int, collection_count_14d: int, collection_total_14d: int}
     */
    public function receivableSnapshot(?int $branchId = null): array
    {
        $base     = $this->collectionSnapshot($branchId);
        $newToday = (new CustomerService())->recentLines($branchId, 1);
        $new14    = (new CustomerService())->recentLines($branchId, 14);

        return array_merge($base, [
            'new_customers_today' => count($newToday),
            'new_customers_14d'   => count($new14),
        ]);
    }

    /**
     * @return array{open_repair_count: int, pending_approval_count: int, in_transit_count: int, open_stock_count_count: int, faulty_device_count: int, pending_expense_count: int, pending_expense_total: int, open_purchase_count: int, open_purchase_total: int, stuck_repair_count: int, stuck_transfer_count: int, stuck_faulty_count: int, repair_completed_today: int, repair_completed_14d: int, transfer_count_today: int, transfer_count_14d: int, stock_count_posted_today: int, stock_count_posted_14d: int, approval_count_today: int, approval_count_14d: int, expense_posted_today: int, expense_posted_total_today: int, expense_posted_14d: int, expense_posted_total_14d: int, workflow_events_today: int, workflow_events_14d: int}
     */
    public function workflowSnapshot(?int $branchId = null): array
    {
        $base           = $this->operationsSnapshot($branchId);
        $repairsToday   = (new RepairService())->recentLines($branchId, 1);
        $repairs14      = (new RepairService())->recentLines($branchId, 14);
        $transfersToday = (new TransferService())->recentLines($branchId, 1);
        $transfers14    = (new TransferService())->recentLines($branchId, 14);
        $countsToday    = (new StockCountService())->recentLines($branchId, 1);
        $counts14       = (new StockCountService())->recentLines($branchId, 14);
        $approvalsToday = (new ApprovalService())->recentLines($branchId, 1);
        $approvals14    = (new ApprovalService())->recentLines($branchId, 14);
        $expensesToday  = (new ExpenseService())->recentLines($branchId, 1);
        $expenses14     = (new ExpenseService())->recentLines($branchId, 14);

        $sum = static fn(array $rows, string $key): int => array_sum(
            array_map(static fn(array $row): int => (int) ($row[$key] ?? 0), $rows)
        );

        $repairToday   = count($repairsToday);
        $transferToday = count($transfersToday);
        $countToday    = count($countsToday);
        $approvalToday = count($approvalsToday);
        $expenseToday  = count($expensesToday);
        $repair14      = count($repairs14);
        $transfer14    = count($transfers14);
        $count14       = count($counts14);
        $approval14    = count($approvals14);
        $expense14     = count($expenses14);

        return array_merge($base, [
            'repair_completed_today'     => $repairToday,
            'repair_completed_14d'       => $repair14,
            'transfer_count_today'       => $transferToday,
            'transfer_count_14d'         => $transfer14,
            'stock_count_posted_today'   => $countToday,
            'stock_count_posted_14d'     => $count14,
            'approval_count_today'       => $approvalToday,
            'approval_count_14d'         => $approval14,
            'expense_posted_today'       => $expenseToday,
            'expense_posted_total_today' => $sum($expensesToday, 'amount'),
            'expense_posted_14d'         => $expense14,
            'expense_posted_total_14d'   => $sum($expenses14, 'amount'),
            'workflow_events_today'      => $repairToday + $transferToday + $countToday + $approvalToday + $expenseToday,
            'workflow_events_14d'        => $repair14 + $transfer14 + $count14 + $approval14 + $expense14,
        ]);
    }

    /**
     * @return array{in_transit_count: int, in_transit_devices: int, stuck_transfer_count: int, stuck_device_count: int, transfer_count_today: int, dispatched_today: int, received_today: int, outbound_in_transit: int, inbound_in_transit: int, transfer_count_14d: int, dispatched_14d: int, received_14d: int, devices_moved_14d: int}
     */
    public function transitSnapshot(?int $branchId = null): array
    {
        $base     = $this->transferSnapshot($branchId);
        $recent14 = (new TransferService())->recentLines($branchId, 14);

        $deviceQty = static fn(array $rows): int => array_sum(array_map(
            static fn(array $row): int => (int) ($row['device_count'] ?? 0),
            $rows
        ));
        $statusCount = static fn(array $rows, string $status): int => count(array_filter(
            $rows,
            static fn(array $row): bool => ($row['status'] ?? '') === $status
        ));

        return array_merge($base, [
            'transfer_count_14d' => count($recent14),
            'dispatched_14d'     => $statusCount($recent14, 'dispatched'),
            'received_14d'       => $statusCount($recent14, 'received'),
            'devices_moved_14d'  => $deviceQty($recent14),
        ]);
    }

    /**
     * @return array{low_stock_count: int, low_stock_qty: int, lowest_available: int, available_qty: int, available_value: int, faulty_qty: int, imei_total: int, status_count: int, on_hand_value: int, faulty_value: int, imei_available: int, imei_sold: int, imei_registered_today: int, imei_registered_14d: int, slow_mover_count: int, slow_mover_qty: int}
     */
    public function stockflowSnapshot(?int $branchId = null): array
    {
        $stock     = $this->stockSnapshot($branchId);
        $inventory = $this->inventorySnapshot($branchId);
        $imei      = $this->imeiSnapshot($branchId);
        $imeis14   = (new ImeiService())->recentLines($branchId, 14);
        $slow      = (new AnalyticsService())->slowMovers($branchId);
        $slowQtys  = array_map(static fn(array $row): int => (int) ($row['qty'] ?? 0), $slow);

        return array_merge($stock, [
            'on_hand_value'         => (int) ($inventory['on_hand_value'] ?? 0),
            'faulty_value'          => (int) ($inventory['faulty_value'] ?? 0),
            'imei_available'        => (int) ($imei['available_qty'] ?? 0),
            'imei_sold'             => (int) ($imei['sold_qty'] ?? 0),
            'imei_registered_today' => (int) ($imei['registered_today'] ?? 0),
            'imei_registered_14d'   => count($imeis14),
            'slow_mover_count'      => count($slow),
            'slow_mover_qty'        => array_sum($slowQtys),
        ]);
    }

    /**
     * @return array{faulty_device_count: int, stuck_faulty_count: int, under_repair_qty: int, returned_qty: int, open_repair_count: int, stuck_repair_count: int, repair_completed_today: int, repair_completed_14d: int, repair_opened_today: int, repair_intake_14d: int, service_queue_total: int, return_count_today: int, return_count_14d: int}
     */
    public function serviceSnapshot(?int $branchId = null): array
    {
        $base        = $this->faultySnapshot($branchId);
        $openRepairs = (new RepairService())->openLines($branchId);
        $returnsToday = (new ReturnService())->recentLines($branchId, 1);
        $returns14    = (new ReturnService())->recentLines($branchId, 14);

        $openedToday = count(array_filter(
            $openRepairs,
            static fn(array $row): bool => (int) ($row['days'] ?? 999) === 0
        ));
        $openRecent = count(array_filter(
            $openRepairs,
            static fn(array $row): bool => (int) ($row['days'] ?? 999) < 14
        ));

        return array_merge($base, [
            'repair_opened_today'  => $openedToday,
            'repair_intake_14d'    => $openRecent + (int) ($base['repair_completed_14d'] ?? 0),
            'service_queue_total'  => (int) ($base['open_repair_count'] ?? 0) + (int) ($base['faulty_device_count'] ?? 0),
            'return_count_today'   => count($returnsToday),
            'return_count_14d'     => count($returns14),
        ]);
    }

    /**
     * @return array{open_count_count: int, pending_approval_count: int, open_missing_units: int, open_extra_units: int, posted_today_count: int, posted_14d_count: int, missing_units_today: int, missing_units_14d: int, count_queue_total: int, stock_variance_pending: int, extra_units_today: int, extra_units_14d: int}
     */
    public function countflowSnapshot(?int $branchId = null): array
    {
        $base         = $this->countSnapshot($branchId);
        $approval     = $this->approvalSnapshot($branchId);
        $postedToday  = (new StockCountService())->recentLines($branchId, 1);
        $posted14     = (new StockCountService())->recentLines($branchId, 14);
        $sumExtra     = static fn(array $rows): int => array_sum(array_map(
            static fn(array $row): int => (int) ($row['extra_qty'] ?? 0),
            $rows
        ));

        return array_merge($base, [
            'count_queue_total'      => (int) ($base['open_count_count'] ?? 0) + (int) ($base['pending_approval_count'] ?? 0),
            'stock_variance_pending' => (int) ($approval['stock_variance_count'] ?? 0),
            'extra_units_today'      => $sumExtra($postedToday),
            'extra_units_14d'        => $sumExtra($posted14),
        ]);
    }

    /**
     * @return array{pending_count: int, price_override_count: int, expense_count: int, stock_variance_count: int, reviewed_today_count: int, reviewed_14d_count: int, approved_today_count: int, rejected_today_count: int, approved_14d_count: int, rejected_14d_count: int, pending_type_count: int}
     */
    public function approvalflowSnapshot(?int $branchId = null): array
    {
        $base      = $this->approvalSnapshot($branchId);
        $recent14  = (new ApprovalService())->recentLines($branchId, 14);
        $statusCount = static fn(array $rows, string $status): int => count(array_filter(
            $rows,
            static fn(array $row): bool => ($row['status'] ?? '') === $status
        ));

        $pendingTypes = 0;
        if ((int) ($base['price_override_count'] ?? 0) > 0) {
            $pendingTypes++;
        }
        if ((int) ($base['expense_count'] ?? 0) > 0) {
            $pendingTypes++;
        }
        if ((int) ($base['stock_variance_count'] ?? 0) > 0) {
            $pendingTypes++;
        }

        return array_merge($base, [
            'approved_14d_count'  => $statusCount($recent14, 'approved'),
            'rejected_14d_count'  => $statusCount($recent14, 'rejected'),
            'pending_type_count'  => $pendingTypes,
        ]);
    }

    /**
     * @return array{event_count_today: int, event_count_14d: int, user_count_14d: int, entity_type_count_14d: int, sale_event_count_14d: int, approval_event_count_14d: int, inventory_event_count_14d: int, top_action_14d: string, users_today: int, payment_event_count_14d: int, transfer_event_count_14d: int}
     */
    public function auditflowSnapshot(?int $branchId = null): array
    {
        $base       = $this->auditSnapshot($branchId);
        $todayLines = (new AuditLogger())->recentLines($branchId, 1);
        $recent14   = (new AuditLogger())->recentLines($branchId, 14);

        $eventMatch = static function (array $rows, string $entityType, string $actionPrefix): int {
            return count(array_filter(
                $rows,
                static fn(array $row): bool => ($row['entity_type'] ?? '') === $entityType
                    || str_starts_with((string) ($row['action'] ?? ''), $actionPrefix)
            ));
        };

        $userIds = array_unique(array_filter(array_map(
            static fn(array $row): int => (int) ($row['user_id'] ?? 0),
            $todayLines
        )));

        return array_merge($base, [
            'users_today'              => count($userIds),
            'payment_event_count_14d'  => $eventMatch($recent14, 'payment', 'payment.'),
            'transfer_event_count_14d' => $eventMatch($recent14, 'transfer', 'transfer.'),
        ]);
    }

    /**
     * @return array{owing_customer_count: int, receivable_total: int, overdue_count: int, overdue_total: int, open_invoice_count: int, open_invoice_total: int, retail_owing_count: int, wholesale_owing_count: int, collection_count_today: int, collection_total_today: int, collection_count_14d: int, collection_total_14d: int, avg_collection_today: int, avg_collection_14d: int, overdue_share_pct: int}
     */
    public function collectionflowSnapshot(?int $branchId = null): array
    {
        $base        = $this->collectionSnapshot($branchId);
        $recvTotal   = (int) ($base['receivable_total'] ?? 0);
        $overdueTotal = (int) ($base['overdue_total'] ?? 0);
        $countToday  = (int) ($base['collection_count_today'] ?? 0);
        $count14     = (int) ($base['collection_count_14d'] ?? 0);
        $totalToday  = (int) ($base['collection_total_today'] ?? 0);
        $total14     = (int) ($base['collection_total_14d'] ?? 0);

        return array_merge($base, [
            'avg_collection_today' => $countToday > 0 ? (int) round($totalToday / $countToday) : 0,
            'avg_collection_14d'     => $count14 > 0 ? (int) round($total14 / $count14) : 0,
            'overdue_share_pct'    => $recvTotal > 0 ? (int) round(($overdueTotal * 100) / $recvTotal) : 0,
        ]);
    }

    /**
     * @return array{unread_count: int, alert_count_today: int, alert_count_14d: int, low_stock_alert_count_14d: int, debt_alert_count_14d: int, approval_alert_count_14d: int, ops_alert_count_14d: int, unread_today: int, read_today: int, alert_types_active: int}
     */
    public function alertflowSnapshot(?int $branchId = null): array
    {
        $base       = $this->alertSnapshot($branchId);
        $todayLines = (new NotifyService())->recentLines($branchId, 1);

        $isUnread = static fn(array $row): bool => empty($row['is_read']);
        $activeTypes = 0;
        foreach (['low_stock_alert_count_14d', 'debt_alert_count_14d', 'approval_alert_count_14d', 'ops_alert_count_14d'] as $key) {
            if ((int) ($base[$key] ?? 0) > 0) {
                $activeTypes++;
            }
        }

        return array_merge($base, [
            'unread_today'       => count(array_filter($todayLines, $isUnread)),
            'read_today'         => count(array_filter($todayLines, static fn(array $row): bool => !$isUnread($row))),
            'alert_types_active' => $activeTypes,
        ]);
    }

    /**
     * @return array{pending_count: int, pending_total: int, posted_today_count: int, posted_today_total: int, posted_14d_count: int, posted_14d_total: int, category_count_14d: int, top_category_14d: string, top_category_total_14d: int, largest_pending_amount: int, approval_pending_count: int, avg_posted_today: int, avg_posted_14d: int}
     */
    public function expenseflowSnapshot(?int $branchId = null): array
    {
        $base         = (new ExpenseService())->snapshot($branchId);
        $approval     = $this->approvalSnapshot($branchId);
        $postedToday  = (int) ($base['posted_today_count'] ?? 0);
        $posted14     = (int) ($base['posted_14d_count'] ?? 0);
        $totalToday   = (int) ($base['posted_today_total'] ?? 0);
        $total14      = (int) ($base['posted_14d_total'] ?? 0);

        return array_merge($base, [
            'approval_pending_count' => (int) ($approval['expense_count'] ?? 0),
            'avg_posted_today'       => $postedToday > 0 ? (int) round($totalToday / $postedToday) : 0,
            'avg_posted_14d'         => $posted14 > 0 ? (int) round($total14 / $posted14) : 0,
        ]);
    }

    /**
     * @return array{low_stock_count: int, slow_mover_count: int, top_seller_count: int, top_seller_units: int, top_seller_revenue: int, notify_unread: int, alert_today_count: int, slow_mover_qty: int, top_product_name: string, top_product_units: int, top_product_revenue: int, top_product_profit: int, low_stock_qty: int}
     */
    public function performanceflowSnapshot(?int $branchId = null): array
    {
        $base    = $this->performanceSnapshot($branchId);
        $product = $this->productSnapshot($branchId);
        $top     = (new AnalyticsService())->topProducts(14, $branchId)[0] ?? null;
        $lowStock = (new ProductService())->lowStockAlerts($branchId);

        return array_merge($base, [
            'slow_mover_qty'      => (int) ($product['slow_mover_qty'] ?? 0),
            'top_product_name'    => (string) ($product['top_product_name'] ?? ''),
            'top_product_units'   => (int) ($top['units'] ?? 0),
            'top_product_revenue' => (int) ($top['revenue'] ?? 0),
            'top_product_profit'  => (int) ($product['top_product_profit'] ?? 0),
            'low_stock_qty'       => array_sum(array_map(static fn(array $row): int => (int) ($row['qty'] ?? 0), $lowStock)),
        ]);
    }

    /**
     * @return array{new_customers_today: int, new_customers_14d: int, owing_customer_count: int, receivable_total: int, overdue_count: int, overdue_total: int, retail_owing_count: int, wholesale_owing_count: int, open_invoice_count: int, open_invoice_total: int, collection_count_today: int, collection_total_today: int, collection_count_14d: int, collection_total_14d: int, avg_balance_owing: int, overdue_share_pct: int}
     */
    public function customerflowSnapshot(?int $branchId = null): array
    {
        $base         = $this->customerSnapshot($branchId);
        $collection   = $this->collectionSnapshot($branchId);
        $owingCount   = (int) ($base['owing_customer_count'] ?? 0);
        $recvTotal    = (int) ($base['receivable_total'] ?? 0);
        $overdueTotal = (int) ($base['overdue_total'] ?? 0);

        return array_merge($base, [
            'open_invoice_count'     => (int) ($collection['open_invoice_count'] ?? 0),
            'open_invoice_total'     => (int) ($collection['open_invoice_total'] ?? 0),
            'collection_count_today' => (int) ($collection['collection_count_today'] ?? 0),
            'collection_total_today' => (int) ($collection['collection_total_today'] ?? 0),
            'collection_count_14d'   => (int) ($collection['collection_count_14d'] ?? 0),
            'collection_total_14d'   => (int) ($collection['collection_total_14d'] ?? 0),
            'avg_balance_owing'      => $owingCount > 0 ? (int) round($recvTotal / $owingCount) : 0,
            'overdue_share_pct'      => $recvTotal > 0 ? (int) round(($overdueTotal * 100) / $recvTotal) : 0,
        ]);
    }

    /**
     * @return array{purchase_count: int, purchase_total: int, swap_count: int, swap_collected: int, imei_count: int, supplier_payment_count: int, supplier_payment_total: int, supplier_return_count: int, supplier_return_total: int, purchase_count_14d: int, purchase_total_14d: int, imei_count_14d: int, supplier_payment_count_14d: int, supplier_payment_total_14d: int, swap_count_14d: int, swap_collected_14d: int, supplier_return_count_14d: int, supplier_return_total_14d: int, intake_count_today: int, intake_count_14d: int, avg_purchase_today: int, avg_purchase_14d: int}
     */
    public function intakeflowSnapshot(?int $branchId = null): array
    {
        $base               = $this->intakeSnapshot($branchId);
        $receiving          = $this->receivingSnapshot($branchId);
        $purchaseCountToday = (int) ($base['purchase_count'] ?? 0);
        $purchaseTotalToday = (int) ($base['purchase_total'] ?? 0);
        $purchaseCount14    = (int) ($receiving['purchase_count_14d'] ?? 0);
        $purchaseTotal14    = (int) ($receiving['purchase_total_14d'] ?? 0);

        return array_merge($base, [
            'purchase_count_14d'          => $purchaseCount14,
            'purchase_total_14d'          => $purchaseTotal14,
            'imei_count_14d'              => (int) ($receiving['imei_count_14d'] ?? 0),
            'supplier_payment_count_14d'  => (int) ($receiving['supplier_payment_count_14d'] ?? 0),
            'supplier_payment_total_14d'  => (int) ($receiving['supplier_payment_total_14d'] ?? 0),
            'swap_count_14d'              => (int) ($receiving['swap_count_14d'] ?? 0),
            'swap_collected_14d'          => (int) ($receiving['swap_collected_14d'] ?? 0),
            'supplier_return_count_14d'   => (int) ($receiving['supplier_return_count_14d'] ?? 0),
            'supplier_return_total_14d'   => (int) ($receiving['supplier_return_total_14d'] ?? 0),
            'intake_count_today'          => (int) ($receiving['receiving_count_today'] ?? 0),
            'intake_count_14d'            => (int) ($receiving['receiving_count_14d'] ?? 0),
            'avg_purchase_today'          => $purchaseCountToday > 0 ? (int) round($purchaseTotalToday / $purchaseCountToday) : 0,
            'avg_purchase_14d'            => $purchaseCount14 > 0 ? (int) round($purchaseTotal14 / $purchaseCount14) : 0,
        ]);
    }

    /**
     * @return array{owing_supplier_count: int, payable_total: int, open_payable_count: int, open_payable_total: int, aged_payable_count: int, aged_payable_total: int, open_po_count: int, open_po_total: int, supplier_payment_count_today: int, supplier_payment_total_today: int, supplier_return_count_today: int, supplier_return_total_today: int, supplier_payment_count_14d: int, supplier_payment_total_14d: int, supplier_return_count_14d: int, supplier_return_total_14d: int, avg_balance_owing: int, aged_share_pct: int}
     */
    public function supplierflowSnapshot(?int $branchId = null): array
    {
        $base         = $this->supplierSnapshot($branchId);
        $payable      = $this->payableSnapshot($branchId);
        $owingCount   = (int) ($base['owing_supplier_count'] ?? 0);
        $payableTotal = (int) ($base['payable_total'] ?? 0);
        $agedTotal    = (int) ($base['aged_payable_total'] ?? 0);

        return array_merge($base, [
            'supplier_payment_count_14d' => (int) ($payable['supplier_payment_count_14d'] ?? 0),
            'supplier_payment_total_14d' => (int) ($payable['supplier_payment_total_14d'] ?? 0),
            'supplier_return_count_14d'  => (int) ($payable['supplier_return_count_14d'] ?? 0),
            'supplier_return_total_14d'  => (int) ($payable['supplier_return_total_14d'] ?? 0),
            'avg_balance_owing'          => $owingCount > 0 ? (int) round($payableTotal / $owingCount) : 0,
            'aged_share_pct'             => $payableTotal > 0 ? (int) round(($agedTotal * 100) / $payableTotal) : 0,
        ]);
    }

    /**
     * @return array{available_qty: int, available_value: int, faulty_qty: int, faulty_value: int, on_hand_value: int, low_stock_count: int, low_stock_qty: int, lowest_available: int, imei_total: int, status_count: int, imei_available: int, imei_sold: int, imei_registered_today: int, avg_unit_value: int, faulty_share_pct: int}
     */
    public function inventoryflowSnapshot(?int $branchId = null): array
    {
        $base           = $this->inventorySnapshot($branchId);
        $stock          = $this->stockSnapshot($branchId);
        $imei           = $this->imeiSnapshot($branchId);
        $availableQty   = (int) ($base['available_qty'] ?? 0);
        $availableValue = (int) ($base['available_value'] ?? 0);
        $onHandValue    = (int) ($base['on_hand_value'] ?? 0);
        $faultyValue    = (int) ($base['faulty_value'] ?? 0);

        return array_merge($base, [
            'low_stock_count'       => (int) ($stock['low_stock_count'] ?? 0),
            'low_stock_qty'         => (int) ($stock['low_stock_qty'] ?? 0),
            'lowest_available'      => (int) ($stock['lowest_available'] ?? 0),
            'imei_total'            => (int) ($stock['imei_total'] ?? 0),
            'status_count'          => (int) ($stock['status_count'] ?? 0),
            'imei_available'        => (int) ($imei['available_qty'] ?? 0),
            'imei_sold'             => (int) ($imei['sold_qty'] ?? 0),
            'imei_registered_today' => (int) ($imei['registered_today'] ?? 0),
            'avg_unit_value'        => $availableQty > 0 ? (int) round($availableValue / $availableQty) : 0,
            'faulty_share_pct'      => $onHandValue > 0 ? (int) round(($faultyValue * 100) / $onHandValue) : 0,
        ]);
    }

    /**
     * @return array{staff_count: int, staff_invoices: int, staff_revenue: int, staff_profit: int, top_staff_revenue: int, branch_count: int, branch_invoices: int, branch_revenue: int, top_branch_revenue: int, sales_today_count: int, sales_today_total: int, top_staff_name: string, top_staff_invoices: int, top_staff_collection_rate: int, avg_revenue_per_staff: int, collection_rate_14d: int, device_line_count: int, devices_today: int, device_revenue_today: int}
     */
    public function staffflowSnapshot(?int $branchId = null): array
    {
        $base    = $this->staffSnapshot($branchId);
        $devices = $this->staffDeviceSnapshot($branchId);
        $staff   = (new AnalyticsService())->staffSales(14, $branchId);
        $top     = $staff[0] ?? null;
        $staffCount   = (int) ($base['staff_count'] ?? 0);
        $staffRevenue = (int) ($base['staff_revenue'] ?? 0);
        $collected    = array_sum(array_map(static fn(array $row): int => (int) ($row['collected'] ?? 0), $staff));

        return array_merge($base, [
            'top_staff_name'            => (string) ($top['name'] ?? $devices['top_staff_name'] ?? ''),
            'top_staff_invoices'        => (int) ($top['invoices'] ?? 0),
            'top_staff_collection_rate' => (int) ($top['collection_rate'] ?? 0),
            'avg_revenue_per_staff'     => $staffCount > 0 ? (int) round($staffRevenue / $staffCount) : 0,
            'collection_rate_14d'       => $staffRevenue > 0 ? (int) round(($collected * 100) / $staffRevenue) : 0,
            'device_line_count'         => (int) ($devices['device_line_count'] ?? 0),
            'devices_today'             => (int) ($devices['devices_today'] ?? 0),
            'device_revenue_today'      => (int) ($devices['revenue_today'] ?? 0),
        ]);
    }

    /**
     * @return array{branch_count: int, active_branch_count: int, invoice_count: int, revenue_14d: int, collected_14d: int, profit_14d: int, due_total: int, stock_qty: int, stock_value: int, top_branch_revenue: int, top_branch_profit: int, top_branch_name: string, top_branch_invoices: int, top_branch_collection_rate: int, avg_revenue_per_branch: int, avg_profit_per_branch: int, collection_rate_14d: int, due_share_pct: int}
     */
    public function branchflowSnapshot(?int $branchId = null): array
    {
        $base     = $this->branchSnapshot($branchId);
        $branches = (new AnalyticsService())->branchPerformance(14);
        if ($branchId) {
            $branches = array_values(array_filter(
                $branches,
                static fn(array $row): bool => (int) ($row['id'] ?? 0) === $branchId
            ));
        }
        $top         = $branches[0] ?? null;
        $activeCount = (int) ($base['active_branch_count'] ?? 0);
        $revenue     = (int) ($base['revenue_14d'] ?? 0);
        $collected   = (int) ($base['collected_14d'] ?? 0);
        $due         = (int) ($base['due_total'] ?? 0);
        $profit      = (int) ($base['profit_14d'] ?? 0);

        return array_merge($base, [
            'top_branch_name'            => (string) ($top['name'] ?? ''),
            'top_branch_invoices'        => (int) ($top['invoices'] ?? 0),
            'top_branch_collection_rate' => (int) ($top['collection_rate'] ?? 0),
            'avg_revenue_per_branch'     => $activeCount > 0 ? (int) round($revenue / $activeCount) : 0,
            'avg_profit_per_branch'      => $activeCount > 0 ? (int) round($profit / $activeCount) : 0,
            'collection_rate_14d'        => $revenue > 0 ? (int) round(($collected * 100) / $revenue) : 0,
            'due_share_pct'              => $revenue > 0 ? (int) round(($due * 100) / $revenue) : 0,
        ]);
    }

    /**
     * @return array{inflows_14d: int, outflows_14d: int, net_14d: int, expenses_14d: int, supplier_payments_14d: int, refunds_14d: int, at_sale_14d: int, collections_14d: int, inflows_today: int, outflows_today: int, net_today: int, expenses_today: int, supplier_payments_today: int, refunds_today: int, at_sale_today: int, collections_today: int, top_payment_method: string, top_payment_collected: int, payment_method_count: int, avg_daily_inflow_14d: int, avg_daily_net_14d: int, outflow_share_pct: int, collection_share_pct: int}
     */
    public function cashflowflowSnapshot(?int $branchId = null): array
    {
        $base      = $this->cashflowSnapshot($branchId);
        $mix       = $this->mixSnapshot($branchId);
        $cashToday = $this->recentCash($branchId, 1);
        $inflows14 = (int) ($base['inflows_14d'] ?? 0);
        $outflows14 = (int) ($base['outflows_14d'] ?? 0);
        $collections14 = (int) ($base['collections_14d'] ?? 0);
        $net14 = (int) ($base['net_14d'] ?? 0);

        return array_merge($base, [
            'expenses_today'            => (int) ($cashToday['expenses'] ?? 0),
            'supplier_payments_today'   => (int) ($cashToday['supplier_payments'] ?? 0),
            'refunds_today'             => (int) ($cashToday['refunds'] ?? 0),
            'at_sale_today'             => (int) ($cashToday['at_sale_total'] ?? 0),
            'collections_today'         => (int) ($cashToday['collections_total'] ?? 0),
            'top_payment_method'        => (string) ($mix['top_payment_method'] ?? ''),
            'top_payment_collected'     => (int) ($mix['top_payment_collected'] ?? 0),
            'payment_method_count'      => (int) ($mix['payment_method_count'] ?? 0),
            'avg_daily_inflow_14d'      => (int) round($inflows14 / 14),
            'avg_daily_net_14d'         => (int) round($net14 / 14),
            'outflow_share_pct'         => $inflows14 > 0 ? (int) round(($outflows14 * 100) / $inflows14) : 0,
            'collection_share_pct'      => $inflows14 > 0 ? (int) round(($collections14 * 100) / $inflows14) : 0,
        ]);
    }

    /**
     * @return array{payment_method_count: int, payment_collected_14d: int, top_payment_method: string, top_payment_collected: int, sale_type_count: int, retail_invoices: int, retail_revenue: int, wholesale_invoices: int, wholesale_revenue: int, invoice_count: int, sales_14d: int, sales_today: int, invoices_today: int, retail_revenue_today: int, wholesale_revenue_today: int, retail_invoices_today: int, wholesale_invoices_today: int, payment_collected_today: int, payment_method_count_today: int, retail_share_pct: int, wholesale_share_pct: int, avg_invoice_value_14d: int, top_payment_share_pct: int}
     */
    public function mixflowSnapshot(?int $branchId = null): array
    {
        $base            = $this->mixSnapshot($branchId);
        $analytics       = new AnalyticsService();
        $saleTypesToday  = $analytics->saleTypeMix(1, $branchId);
        $paymentMixToday = $analytics->paymentMix(1, $branchId);
        $trend           = $analytics->salesTrend(14, $branchId);
        $todayRow        = $trend[count($trend) - 1] ?? [];

        $typeMetric = static function (array $types, string $key, string $field): int {
            foreach ($types as $row) {
                if (($row['type'] ?? '') === $key) {
                    return (int) ($row[$field] ?? 0);
                }
            }

            return 0;
        };

        $sales14              = (int) ($base['sales_14d'] ?? 0);
        $retailRev            = (int) ($base['retail_revenue'] ?? 0);
        $wholesaleRev         = (int) ($base['wholesale_revenue'] ?? 0);
        $paymentCollected14   = (int) ($base['payment_collected_14d'] ?? 0);
        $invoiceCount         = (int) ($base['invoice_count'] ?? 0);
        $topPaymentCollected  = (int) ($base['top_payment_collected'] ?? 0);

        return array_merge($base, [
            'sales_today'               => (int) ($todayRow['net'] ?? 0),
            'invoices_today'            => (int) ($todayRow['invoices'] ?? 0),
            'retail_revenue_today'      => $typeMetric($saleTypesToday, 'retail', 'net'),
            'wholesale_revenue_today'   => $typeMetric($saleTypesToday, 'wholesale', 'net'),
            'retail_invoices_today'     => $typeMetric($saleTypesToday, 'retail', 'invoices'),
            'wholesale_invoices_today'  => $typeMetric($saleTypesToday, 'wholesale', 'invoices'),
            'payment_collected_today'   => array_sum(array_map(static fn(array $row): int => (int) ($row['collected'] ?? 0), $paymentMixToday)),
            'payment_method_count_today'=> count($paymentMixToday),
            'retail_share_pct'          => $sales14 > 0 ? (int) round(($retailRev * 100) / $sales14) : 0,
            'wholesale_share_pct'       => $sales14 > 0 ? (int) round(($wholesaleRev * 100) / $sales14) : 0,
            'avg_invoice_value_14d'     => $invoiceCount > 0 ? (int) round($sales14 / $invoiceCount) : 0,
            'top_payment_share_pct'     => $paymentCollected14 > 0 ? (int) round(($topPaymentCollected * 100) / $paymentCollected14) : 0,
        ]);
    }

    /**
     * @return array{day_count: int, active_day_count: int, invoice_count: int, sales_14d: int, collected_14d: int, sales_today: int, invoices_today: int, best_day_net: int, best_day_date: string, avg_daily_net: int, collected_today: int, sales_yesterday: int, invoices_yesterday: int, collection_rate_14d: int, today_vs_avg_pct: int, best_day_share_pct: int, avg_invoices_per_active_day: int, inactive_day_count: int, avg_daily_collected_14d: int, velocity_7d_net: int, velocity_prior_7d_net: int, velocity_change_pct: int}
     */
    public function trendflowSnapshot(?int $branchId = null): array
    {
        $base         = $this->trendSnapshot($branchId);
        $trend        = (new AnalyticsService())->salesTrend(14, $branchId);
        $todayRow     = $trend[count($trend) - 1] ?? [];
        $yesterdayRow = count($trend) >= 2 ? $trend[count($trend) - 2] : [];
        $last7        = array_slice($trend, -7);
        $prior7       = count($trend) >= 14 ? array_slice($trend, -14, 7) : [];

        $sales14      = (int) ($base['sales_14d'] ?? 0);
        $collected14  = (int) ($base['collected_14d'] ?? 0);
        $avgDaily     = (int) ($base['avg_daily_net'] ?? 0);
        $salesToday   = (int) ($base['sales_today'] ?? 0);
        $activeCount  = (int) ($base['active_day_count'] ?? 0);
        $invoiceCount = (int) ($base['invoice_count'] ?? 0);
        $bestDayNet   = (int) ($base['best_day_net'] ?? 0);
        $dayCount     = (int) ($base['day_count'] ?? 0);
        $netLast7     = array_sum(array_map(static fn(array $row): int => (int) ($row['net'] ?? 0), $last7));
        $netPrior7    = array_sum(array_map(static fn(array $row): int => (int) ($row['net'] ?? 0), $prior7));

        return array_merge($base, [
            'collected_today'             => (int) ($todayRow['collected'] ?? 0),
            'sales_yesterday'             => (int) ($yesterdayRow['net'] ?? 0),
            'invoices_yesterday'          => (int) ($yesterdayRow['invoices'] ?? 0),
            'collection_rate_14d'         => $sales14 > 0 ? (int) round(($collected14 * 100) / $sales14) : 0,
            'today_vs_avg_pct'            => $avgDaily > 0 ? (int) round(($salesToday * 100) / $avgDaily) : 0,
            'best_day_share_pct'          => $sales14 > 0 ? (int) round(($bestDayNet * 100) / $sales14) : 0,
            'avg_invoices_per_active_day' => $activeCount > 0 ? (int) round($invoiceCount / $activeCount) : 0,
            'inactive_day_count'          => max(0, $dayCount - $activeCount),
            'avg_daily_collected_14d'     => $activeCount > 0 ? (int) round($collected14 / $activeCount) : 0,
            'velocity_7d_net'             => $netLast7,
            'velocity_prior_7d_net'       => $netPrior7,
            'velocity_change_pct'         => $netPrior7 > 0 ? (int) round((($netLast7 - $netPrior7) * 100) / $netPrior7) : 0,
        ]);
    }

    /**
     * @return array{top_seller_count: int, top_seller_units: int, top_seller_revenue: int, top_seller_profit: int, top_product_name: string, top_product_profit: int, slow_mover_count: int, slow_mover_qty: int, top_product_units: int, top_product_revenue: int, top_product_share_pct: int, slow_mover_share_pct: int, avg_profit_per_unit: int, avg_revenue_per_unit: int, profit_margin_pct: int, low_stock_count: int, low_stock_qty: int}
     */
    public function productflowSnapshot(?int $branchId = null): array
    {
        $base        = $this->productSnapshot($branchId);
        $topProducts = (new AnalyticsService())->topProducts(14, $branchId);
        $top         = $topProducts[0] ?? null;
        $lowStock    = (new ProductService())->lowStockAlerts($branchId);
        $inventory   = $this->inventorySnapshot($branchId);
        $lowQtys     = array_map(static fn(array $row): int => (int) ($row['qty'] ?? 0), $lowStock);

        $topSellerProfit  = (int) ($base['top_seller_profit'] ?? 0);
        $topSellerRevenue = (int) ($base['top_seller_revenue'] ?? 0);
        $topSellerUnits   = (int) ($base['top_seller_units'] ?? 0);
        $topProductProfit = (int) ($base['top_product_profit'] ?? 0);
        $slowQty          = (int) ($base['slow_mover_qty'] ?? 0);
        $availableQty     = (int) ($inventory['available_qty'] ?? 0);

        return array_merge($base, [
            'top_product_units'     => (int) ($top['units'] ?? 0),
            'top_product_revenue'   => (int) ($top['revenue'] ?? 0),
            'top_product_share_pct' => $topSellerProfit > 0 ? (int) round(($topProductProfit * 100) / $topSellerProfit) : 0,
            'slow_mover_share_pct'  => $availableQty > 0 ? (int) round(($slowQty * 100) / $availableQty) : 0,
            'avg_profit_per_unit'   => $topSellerUnits > 0 ? (int) round($topSellerProfit / $topSellerUnits) : 0,
            'avg_revenue_per_unit'  => $topSellerUnits > 0 ? (int) round($topSellerRevenue / $topSellerUnits) : 0,
            'profit_margin_pct'     => $topSellerRevenue > 0 ? (int) round(($topSellerProfit * 100) / $topSellerRevenue) : 0,
            'low_stock_count'       => count($lowStock),
            'low_stock_qty'         => array_sum($lowQtys),
        ]);
    }

    /**
     * @return array{receivable_total: int, receivable_party_count: int, payable_total: int, payable_party_count: int, overdue_count: int, overdue_total: int, open_payable_total: int, cash_in_14d: int, cash_net_14d: int, cash_net_today: int, sales_14d: int, collected_14d: int, collections_today: int, cash_out_14d: int, cash_in_today: int, cash_out_today: int, expenses_14d: int, expenses_today: int, collection_rate_14d: int, overdue_share_pct: int, net_position: int, avg_receivable_per_customer: int, avg_payable_per_supplier: int}
     */
    public function ledgerflowSnapshot(?int $branchId = null): array
    {
        $base            = $this->ledgerSnapshot($branchId);
        $cash14          = $this->recentCash($branchId, 14);
        $cashToday       = $this->recentCash($branchId, 1);
        $receivableTotal = (int) ($base['receivable_total'] ?? 0);
        $payableTotal    = (int) ($base['payable_total'] ?? 0);
        $sales14         = (int) ($base['sales_14d'] ?? 0);
        $collected14     = (int) ($base['collected_14d'] ?? 0);
        $overdueTotal    = (int) ($base['overdue_total'] ?? 0);
        $recvCount       = (int) ($base['receivable_party_count'] ?? 0);
        $payCount        = (int) ($base['payable_party_count'] ?? 0);

        return array_merge($base, [
            'cash_out_14d'                => (int) ($cash14['outflows'] ?? 0),
            'cash_in_today'               => (int) ($cashToday['inflows'] ?? 0),
            'cash_out_today'              => (int) ($cashToday['outflows'] ?? 0),
            'expenses_14d'                => (int) ($cash14['expenses'] ?? 0),
            'expenses_today'              => (int) ($cashToday['expenses'] ?? 0),
            'collection_rate_14d'         => $sales14 > 0 ? (int) round(($collected14 * 100) / $sales14) : 0,
            'overdue_share_pct'           => $receivableTotal > 0 ? (int) round(($overdueTotal * 100) / $receivableTotal) : 0,
            'net_position'                => $receivableTotal - $payableTotal,
            'avg_receivable_per_customer' => $recvCount > 0 ? (int) round($receivableTotal / $recvCount) : 0,
            'avg_payable_per_supplier'    => $payCount > 0 ? (int) round($payableTotal / $payCount) : 0,
        ]);
    }

    /**
     * @return array{sales_today_count: int, sales_today_total: int, sales_14d: int, cash_net_today: int, cash_net_14d: int, receivable_total: int, receivable_party_count: int, payable_total: int, payable_party_count: int, overdue_count: int, overdue_total: int, collections_today: int, open_repair_count: int, pending_approval_count: int, in_transit_count: int, available_qty: int, available_value: int, low_stock_count: int, notify_unread: int, collected_14d: int, collection_rate_14d: int, net_position: int, overdue_share_pct: int, operations_load: int, avg_sale_today: int, today_vs_avg_14d_pct: int, alert_load: int}
     */
    public function executiveflowSnapshot(?int $branchId = null): array
    {
        $base            = $this->executiveSnapshot($branchId);
        $ledger          = $this->ledgerSnapshot($branchId);
        $salesTodayCount = (int) ($base['sales_today_count'] ?? 0);
        $salesTodayTotal = (int) ($base['sales_today_total'] ?? 0);
        $sales14         = (int) ($base['sales_14d'] ?? 0);
        $recvTotal       = (int) ($base['receivable_total'] ?? 0);
        $payTotal        = (int) ($base['payable_total'] ?? 0);
        $overdueTotal    = (int) ($base['overdue_total'] ?? 0);
        $collected14     = (int) ($ledger['collected_14d'] ?? 0);
        $avgDaily14      = $sales14 > 0 ? (int) round($sales14 / 14) : 0;

        return array_merge($base, [
            'collected_14d'          => $collected14,
            'collection_rate_14d'    => $sales14 > 0 ? (int) round(($collected14 * 100) / $sales14) : 0,
            'net_position'           => $recvTotal - $payTotal,
            'overdue_share_pct'      => $recvTotal > 0 ? (int) round(($overdueTotal * 100) / $recvTotal) : 0,
            'operations_load'        => (int) ($base['open_repair_count'] ?? 0) + (int) ($base['pending_approval_count'] ?? 0) + (int) ($base['in_transit_count'] ?? 0),
            'avg_sale_today'         => $salesTodayCount > 0 ? (int) round($salesTodayTotal / $salesTodayCount) : 0,
            'today_vs_avg_14d_pct'   => $avgDaily14 > 0 ? (int) round(($salesTodayTotal * 100) / $avgDaily14) : 0,
            'alert_load'             => (int) ($base['low_stock_count'] ?? 0) + (int) ($base['notify_unread'] ?? 0),
        ]);
    }

    /**
     * @return array{receivable_line_count: int, receivable_total: int, receivable_0_30: int, receivable_31_60: int, receivable_61_90: int, receivable_90_plus: int, payable_line_count: int, payable_total: int, payable_0_30: int, payable_31_60: int, payable_61_90: int, payable_90_plus: int, payment_method_count: int, payment_collected_14d: int, receivable_aged_share_pct: int, payable_aged_share_pct: int, receivable_stale_total: int, payable_stale_total: int, net_aging_position: int, receivable_current_share_pct: int, payable_current_share_pct: int, stale_share_pct: int}
     */
    public function agingflowSnapshot(?int $branchId = null): array
    {
        $base      = $this->agingSnapshot($branchId);
        $recvTotal = (int) ($base['receivable_total'] ?? 0);
        $payTotal  = (int) ($base['payable_total'] ?? 0);
        $recv90    = (int) ($base['receivable_90_plus'] ?? 0);
        $pay90     = (int) ($base['payable_90_plus'] ?? 0);
        $recv030   = (int) ($base['receivable_0_30'] ?? 0);
        $pay030    = (int) ($base['payable_0_30'] ?? 0);
        $recvStale = (int) ($base['receivable_31_60'] ?? 0) + (int) ($base['receivable_61_90'] ?? 0) + $recv90;
        $payStale  = (int) ($base['payable_31_60'] ?? 0) + (int) ($base['payable_61_90'] ?? 0) + $pay90;
        $combined  = $recvTotal + $payTotal;

        return array_merge($base, [
            'receivable_aged_share_pct'    => $recvTotal > 0 ? (int) round(($recv90 * 100) / $recvTotal) : 0,
            'payable_aged_share_pct'       => $payTotal > 0 ? (int) round(($pay90 * 100) / $payTotal) : 0,
            'receivable_stale_total'       => $recvStale,
            'payable_stale_total'          => $payStale,
            'net_aging_position'           => $recvTotal - $payTotal,
            'receivable_current_share_pct' => $recvTotal > 0 ? (int) round(($recv030 * 100) / $recvTotal) : 0,
            'payable_current_share_pct'    => $payTotal > 0 ? (int) round(($pay030 * 100) / $payTotal) : 0,
            'stale_share_pct'              => $combined > 0 ? (int) round((($recvStale + $payStale) * 100) / $combined) : 0,
        ]);
    }

    /**
     * @return array{wholesale_owing_count: int, wholesale_owing_total: int, retail_owing_count: int, retail_owing_total: int, swap_today_count: int, swap_collected_today: int, swap_14d_count: int, swap_collected_14d: int, retail_sales_14d: int, wholesale_sales_14d: int, retail_invoices_14d: int, wholesale_invoices_14d: int, total_owing_count: int, total_owing_total: int, retail_share_pct: int, wholesale_share_pct: int, wholesale_owing_share_pct: int, avg_swap_value_14d: int, swap_collection_share_pct: int}
     */
    public function tradeflowSnapshot(?int $branchId = null): array
    {
        $base            = $this->tradeSnapshot($branchId);
        $wholesaleOwing  = (int) ($base['wholesale_owing_total'] ?? 0);
        $retailOwing     = (int) ($base['retail_owing_total'] ?? 0);
        $retailSales     = (int) ($base['retail_sales_14d'] ?? 0);
        $wholesaleSales  = (int) ($base['wholesale_sales_14d'] ?? 0);
        $totalSales      = $retailSales + $wholesaleSales;
        $totalOwing      = $wholesaleOwing + $retailOwing;
        $swap14          = (int) ($base['swap_14d_count'] ?? 0);
        $swapCollected14 = (int) ($base['swap_collected_14d'] ?? 0);

        return array_merge($base, [
            'total_owing_count'          => (int) ($base['wholesale_owing_count'] ?? 0) + (int) ($base['retail_owing_count'] ?? 0),
            'total_owing_total'          => $totalOwing,
            'retail_share_pct'           => $totalSales > 0 ? (int) round(($retailSales * 100) / $totalSales) : 0,
            'wholesale_share_pct'        => $totalSales > 0 ? (int) round(($wholesaleSales * 100) / $totalSales) : 0,
            'wholesale_owing_share_pct'  => $totalOwing > 0 ? (int) round(($wholesaleOwing * 100) / $totalOwing) : 0,
            'avg_swap_value_14d'         => $swap14 > 0 ? (int) round($swapCollected14 / $swap14) : 0,
            'swap_collection_share_pct'  => $totalSales > 0 ? (int) round(($swapCollected14 * 100) / $totalSales) : 0,
        ]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function imeiLines(?int $branchId = null): array
    {
        global $wpdb;
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $branches = $this->db->table('branches');
        $variants = $this->db->table('product_variants');
        $sql      = "SELECT i.imei, i.serial_number, i.status, i.cost_price, p.name AS product_name, b.name AS branch_name,
                            v.color, v.storage, v.variant_name
                     FROM {$imeis} i
                     INNER JOIN {$products} p ON p.id = i.product_id
                     INNER JOIN {$branches} b ON b.id = i.branch_id
                     LEFT JOIN {$variants} v ON v.id = i.variant_id";
        if ($branchId) {
            $rows = $wpdb->get_results($wpdb->prepare($sql . ' WHERE i.branch_id = %d ORDER BY i.status, p.name', $branchId), ARRAY_A) ?: [];
        } else {
            $rows = $wpdb->get_results($sql . ' ORDER BY i.status, p.name', ARRAY_A) ?: [];
        }
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $row['variant_label'] = $labels->format($row);
        }
        unset($row);

        return $rows;
    }

    /**
     * @return array{from: string, to: string, events: list<array{event_type: string, qty: int}>, by_variant: list<array{event_type: string, product_name: string, variant_label: string, qty: int}>}
     */
    public function recentMovement(?int $branchId = null, int $days = 14): array
    {
        $days = max(1, $days);
        $to   = function_exists('current_time') ? current_time('Y-m-d') : gmdate('Y-m-d');
        $fromTs = (function_exists('current_time') ? (int) current_time('timestamp') : time()) - (($days - 1) * 86400);
        $from = function_exists('wp_date') ? wp_date('Y-m-d', $fromTs) : gmdate('Y-m-d', $fromTs);

        return $this->movement($from, $to, $branchId);
    }

    /**
     * @return array<string, mixed>
     */
    public function recentCash(?int $branchId = null, int $days = 14): array
    {
        $days = max(1, $days);
        $to   = function_exists('current_time') ? current_time('Y-m-d') : gmdate('Y-m-d');
        $fromTs = (function_exists('current_time') ? (int) current_time('timestamp') : time()) - (($days - 1) * 86400);
        $from = function_exists('wp_date') ? wp_date('Y-m-d', $fromTs) : gmdate('Y-m-d', $fromTs);

        return $this->cash($from, $to, $branchId);
    }

    /**
     * @return list<array{id: int, name: string, balance: int}>
     */
    public function receivablePartyLines(int $limit = 15): array
    {
        return $this->partyLines('customer', $limit);
    }

    /**
     * @return list<array{id: int, name: string, balance: int}>
     */
    public function payablePartyLines(int $limit = 15): array
    {
        return $this->partyLines('supplier', $limit);
    }

    /**
     * @return array{from: string, to: string, events: list<array{event_type: string, qty: int}>, by_variant: list<array{event_type: string, product_name: string, variant_label: string, qty: int}>}
     */
    public function movement(string $from, string $to, ?int $branchId = null): array
    {
        global $wpdb;
        $events   = $this->db->table('imei_events');
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $where    = 'e.created_at >= %s AND e.created_at < %s';
        $params   = [$from . ' 00:00:00', $to . ' 23:59:59'];
        if ($branchId) {
            $where   .= ' AND (e.from_branch_id = %d OR e.to_branch_id = %d)';
            $params[] = $branchId;
            $params[] = $branchId;
        }
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT e.event_type, COUNT(*) AS qty FROM {$events} e WHERE {$where} GROUP BY e.event_type ORDER BY qty DESC",
                ...$params
            ),
            ARRAY_A
        ) ?: [];
        $detail = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT e.event_type, p.name AS product_name, v.color, v.storage, v.variant_name, COUNT(*) AS qty
                 FROM {$events} e
                 INNER JOIN {$imeis} i ON i.id = e.imei_id
                 INNER JOIN {$products} p ON p.id = i.product_id
                 LEFT JOIN {$variants} v ON v.id = i.variant_id
                 WHERE {$where}
                 GROUP BY e.event_type, p.id, v.id
                 ORDER BY qty DESC, product_name ASC",
                ...$params
            ),
            ARRAY_A
        ) ?: [];
        $labels = new VariantLabel();

        return [
            'from'       => $from,
            'to'         => $to,
            'events'     => array_map(static fn($r) => ['event_type' => (string) $r['event_type'], 'qty' => (int) $r['qty']], $rows),
            'by_variant' => array_map(static function (array $r) use ($labels) {
                return [
                    'event_type'    => (string) $r['event_type'],
                    'product_name'  => (string) $r['product_name'],
                    'variant_label' => $labels->format($r),
                    'qty'           => (int) $r['qty'],
                ];
            }, $detail),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function cash(string $from, string $to, ?int $branchId = null): array
    {
        global $wpdb;
        [$start, $end] = $this->periodBounds($from, $to);

        $atSale = $this->sumByMethod(
            $this->db->table('sales'),
            'payment_method',
            'paid_amount',
            "status = 'completed' AND posted_at >= %s AND posted_at <= %s",
            $start,
            $end,
            $branchId
        );
        $collections = $this->sumByMethod(
            $this->db->table('payments'),
            'method',
            'amount',
            "status = 'posted' AND posted_at >= %s AND posted_at <= %s AND (notes IS NULL OR notes NOT LIKE 'Payment at sale%%')",
            $start,
            $end,
            $branchId
        );

        $expWhere  = "status = 'posted' AND posted_at >= %s AND posted_at <= %s";
        $expParams = [$start, $end];
        if ($branchId) {
            $expWhere   .= ' AND branch_id = %d';
            $expParams[] = $branchId;
        }
        $expenses = (int) $wpdb->get_var($wpdb->prepare('SELECT COALESCE(SUM(amount),0) FROM ' . $this->db->table('expenses') . " WHERE {$expWhere}", ...$expParams));

        $supWhere  = "status = 'posted' AND posted_at >= %s AND posted_at <= %s";
        $supParams = [$start, $end];
        if ($branchId) {
            $supWhere   .= ' AND branch_id = %d';
            $supParams[] = $branchId;
        }
        $supplierPay = (int) $wpdb->get_var($wpdb->prepare('SELECT COALESCE(SUM(amount),0) FROM ' . $this->db->table('supplier_payments') . " WHERE {$supWhere}", ...$supParams));

        $retWhere  = "status = 'completed' AND posted_at >= %s AND posted_at <= %s";
        $retParams = [$start, $end];
        if ($branchId) {
            $retWhere   .= ' AND branch_id = %d';
            $retParams[] = $branchId;
        }
        $refunds = (int) $wpdb->get_var($wpdb->prepare('SELECT COALESCE(SUM(refund_amount),0) FROM ' . $this->db->table('returns') . " WHERE {$retWhere}", ...$retParams));

        $atSaleTotal      = array_sum(array_column($atSale, 'amount'));
        $collectionsTotal = array_sum(array_column($collections, 'amount'));
        $inflows          = $atSaleTotal + $collectionsTotal;
        $outflows         = $expenses + $supplierPay + $refunds;

        return [
            'from'              => $from,
            'to'                => $to,
            'at_sale'           => $atSale,
            'at_sale_total'     => $atSaleTotal,
            'collections'       => $collections,
            'collections_total' => $collectionsTotal,
            'inflows'           => $inflows,
            'expenses'          => $expenses,
            'supplier_payments' => $supplierPay,
            'refunds'           => $refunds,
            'outflows'          => $outflows,
            'net'               => $inflows - $outflows,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function dashboard(?int $branchId = null): array
    {
        $today = current_time('Y-m-d');
        $sales = $this->sales($today, $today, $branchId);

        global $wpdb;
        $imeis   = $this->db->table('imeis');
        $repairs = $this->db->table('repairs');
        if ($branchId) {
            $transit     = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$imeis} WHERE status = 'transferred' AND branch_id = %d", $branchId));
            $openRepairs = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$repairs} WHERE status NOT IN ('returned','completed') AND branch_id = %d", $branchId));
        } else {
            $transit     = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$imeis} WHERE status = 'transferred'");
            $openRepairs = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$repairs} WHERE status NOT IN ('returned','completed')");
        }

        $pending = (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . $this->db->table('approvals') . " WHERE status = 'pending'");
        $debtDays = (int) ((new SettingsService())->expose()['debt_days'] ?? 7);
        $salesTable = $this->db->table('sales');
        $overdueSql = "SELECT COUNT(*) FROM {$salesTable} WHERE status = 'completed' AND due_amount > 0 AND DATEDIFF(NOW(), posted_at) >= %d";
        $overdueParams = [max(0, $debtDays)];
        if ($branchId) {
            $overdueSql     .= ' AND branch_id = %d';
            $overdueParams[] = $branchId;
        }
        $overdue = (int) $wpdb->get_var($wpdb->prepare($overdueSql, ...$overdueParams));
        $ops            = (new SettingsService())->expose();
        $repairDays     = (int) ($ops['repair_days'] ?? 3);
        $transferHours  = (int) ($ops['transfer_hours'] ?? 24);
        $returnDays     = (int) ($ops['return_days'] ?? 2);
        $aging          = (new AnalyticsService())->receivableAging($branchId);
        $payableAging   = (new AnalyticsService())->payableAging($branchId);
        $movement       = $this->recentMovement($branchId, 14);
        $cashSnapshot   = $this->recentCash($branchId, 14);
        $trendLines     = (new AnalyticsService())->salesTrend(14, $branchId);
        $inventorySnap  = $this->inventorySnapshot($branchId);
        $todayCash      = $this->recentCash($branchId, 1);
        $expenseSnap    = (new ExpenseService())->snapshot($branchId);
        $intakeSnap     = $this->intakeSnapshot($branchId);
        $operationsSnap = $this->operationsSnapshot($branchId);
        $receivablesSnap = $this->receivablesSnapshot($branchId);
        $payablesSnap    = $this->payablesSnapshot($branchId);
        $adjustmentsSnap = $this->adjustmentsSnapshot($branchId);
        $performanceSnap = $this->performanceSnapshot($branchId);
        $staffSnap       = $this->staffSnapshot($branchId);
        $movementSnap    = $this->movementSnapshot($branchId);
        $ledgerSnap      = $this->ledgerSnapshot($branchId);
        $repairSnap      = $this->repairSnapshot($branchId);
        $complianceSnap  = $this->complianceSnapshot($branchId);
        $tradeSnap       = $this->tradeSnapshot($branchId);
        $agingSnap       = $this->agingSnapshot($branchId);
        $executiveSnap   = $this->executiveSnapshot($branchId);
        $branchSnap      = $this->branchSnapshot($branchId);
        $mixSnap         = $this->mixSnapshot($branchId);
        $productSnap     = $this->productSnapshot($branchId);
        $trendSnap       = $this->trendSnapshot($branchId);
        $cashflowSnap    = $this->cashflowSnapshot($branchId);
        $staffDeviceSnap = $this->staffDeviceSnapshot($branchId);
        $stockSnap       = $this->stockSnapshot($branchId);
        $imeiSnap        = $this->imeiSnapshot($branchId);
        $transferSnap    = $this->transferSnapshot($branchId);
        $purchaseSnap    = $this->purchaseSnapshot($branchId);
        $returnsSnap     = $this->returnsSnapshot($branchId);
        $faultySnap      = $this->faultySnapshot($branchId);
        $customerSnap    = $this->customerSnapshot($branchId);
        $supplierSnap    = $this->supplierSnapshot($branchId);
        $countSnap       = $this->countSnapshot($branchId);
        $approvalSnap    = $this->approvalSnapshot($branchId);
        $auditSnap       = $this->auditSnapshot($branchId);
        $collectionSnap  = $this->collectionSnapshot($branchId);
        $alertSnap       = $this->alertSnapshot($branchId);
        $salesSnap       = $this->salesSnapshot($branchId);
        $paymentSnap     = $this->paymentSnapshot($branchId);
        $swapSnap        = $this->swapSnapshot($branchId);
        $returnSnap      = $this->returnSnapshot($branchId);
        $adjustmentSnap  = $this->adjustmentSnapshot($branchId);
        $procurementSnap = $this->procurementSnapshot($branchId);
        $receivingSnap   = $this->receivingSnapshot($branchId);
        $payableSnap     = $this->payableSnapshot($branchId);
        $receivableSnap  = $this->receivableSnapshot($branchId);
        $workflowSnap    = $this->workflowSnapshot($branchId);
        $transitSnap     = $this->transitSnapshot($branchId);
        $stockflowSnap   = $this->stockflowSnapshot($branchId);
        $serviceSnap     = $this->serviceSnapshot($branchId);
        $countflowSnap   = $this->countflowSnapshot($branchId);
        $approvalflowSnap = $this->approvalflowSnapshot($branchId);
        $auditflowSnap    = $this->auditflowSnapshot($branchId);
        $collectionflowSnap = $this->collectionflowSnapshot($branchId);
        $alertflowSnap      = $this->alertflowSnapshot($branchId);
        $expenseflowSnap    = $this->expenseflowSnapshot($branchId);
        $performanceflowSnap = $this->performanceflowSnapshot($branchId);
        $customerflowSnap    = $this->customerflowSnapshot($branchId);
        $intakeflowSnap      = $this->intakeflowSnapshot($branchId);
        $supplierflowSnap    = $this->supplierflowSnapshot($branchId);
        $inventoryflowSnap   = $this->inventoryflowSnapshot($branchId);
        $staffflowSnap       = $this->staffflowSnapshot($branchId);
        $branchflowSnap      = $this->branchflowSnapshot($branchId);
        $cashflowflowSnap    = $this->cashflowflowSnapshot($branchId);
        $mixflowSnap         = $this->mixflowSnapshot($branchId);
        $trendflowSnap       = $this->trendflowSnapshot($branchId);
        $productflowSnap     = $this->productflowSnapshot($branchId);
        $ledgerflowSnap      = $this->ledgerflowSnapshot($branchId);
        $executiveflowSnap   = $this->executiveflowSnapshot($branchId);
        $agingflowSnap       = $this->agingflowSnapshot($branchId);
        $tradeflowSnap       = $this->tradeflowSnapshot($branchId);

        return [
            'today'             => $sales,
            'receivables'       => $this->partyBalances('customer'),
            'payables'          => $this->partyBalances('supplier'),
            'pending_approvals' => $pending,
            'overdue_invoices'  => $overdue,
            'overdue_lines'     => (new AnalyticsService())->receivableLines($branchId, $debtDays),
            'payable_lines'     => (new AnalyticsService())->payableLines($branchId),
            'transit_lines'     => (new TransferService())->transitLines($branchId),
            'repair_lines'      => (new RepairService())->openLines($branchId),
            'stuck_repair_lines'=> (new RepairService())->openLines($branchId, $repairDays),
            'stuck_transfer_lines' => (new TransferService())->stuckLines($branchId, $transferHours),
            'approval_lines'    => (new ApprovalService())->pendingLines($branchId),
            'faulty_lines'      => (new ImeiService())->faultyLines($branchId),
            'stuck_faulty_lines'=> (new ImeiService())->faultyLines($branchId, $returnDays),
            'stock_count_lines' => (new StockCountService())->openLines($branchId),
            'return_lines'      => (new ReturnService())->recentLines($branchId),
            'expense_lines'     => (new ExpenseService())->pendingLines($branchId),
            'wholesale_receivable_lines' => (new AnalyticsService())->wholesaleReceivableLines($branchId),
            'swap_lines'      => (new SwapService())->recentLines($branchId),
            'sale_lines'      => (new SaleService())->recentLines($branchId),
            'payment_lines'   => (new PaymentService())->recentLines($branchId),
            'supplier_payment_lines' => (new SupplierService())->recentPaymentLines($branchId),
            'purchase_lines'  => (new PurchaseService())->recentLines($branchId),
            'open_purchase_lines' => (new PurchaseService())->openLines($branchId),
            'supplier_return_lines' => (new SupplierService())->recentReturnLines($branchId),
            'reversal_lines'  => (new PaymentService())->reversalLines($branchId),
            'voided_lines'    => (new SaleService())->voidedLines($branchId),
            'posted_expense_lines' => (new ExpenseService())->recentLines($branchId),
            'audit_lines'     => (new AuditLogger())->recentLines($branchId),
            'recent_transfer_lines' => (new TransferService())->recentLines($branchId),
            'posted_stock_count_lines' => (new StockCountService())->recentLines($branchId),
            'completed_repair_lines' => (new RepairService())->recentLines($branchId),
            'recent_approval_lines' => (new ApprovalService())->recentLines($branchId),
            'recent_customer_lines' => (new CustomerService())->recentLines($branchId),
            'recent_imei_lines' => (new ImeiService())->recentLines($branchId),
            'staff_device_lines' => (new AnalyticsService())->staffDeviceLines(14, $branchId),
            'low_stock_lines' => (new ProductService())->lowStockAlerts($branchId),
            'slow_lines'      => (new AnalyticsService())->slowMovers($branchId),
            'aging_lines'     => $aging['lines'],
            'aging_buckets'   => $aging['buckets'],
            'top_product_lines' => (new AnalyticsService())->topProducts(14, $branchId),
            'payable_aging_lines' => $payableAging['lines'],
            'payable_aging_buckets' => $payableAging['buckets'],
            'movement_lines'  => $movement['by_variant'],
            'movement_events' => $movement['events'],
            'payment_mix_lines' => (new AnalyticsService())->paymentMix(14, $branchId),
            'sale_type_lines' => (new AnalyticsService())->saleTypeMix(14, $branchId),
            'branch_lines'    => (new AnalyticsService())->branchPerformance(14),
            'staff_sales_lines' => (new AnalyticsService())->staffSales(14, $branchId),
            'trend_lines'     => $trendLines,
            'receivable_party_lines' => $this->receivablePartyLines(),
            'payable_party_lines' => $this->payablePartyLines(),
            'cash_snapshot'   => $cashSnapshot,
            'imei_status_lines' => $this->imeiStatusLines($branchId),
            'inventory_snapshot' => $inventorySnap,
            'inventory_lines' => $this->inventoryLines($branchId),
            'today_sales_lines' => (new SaleService())->recentLines($branchId, 1),
            'today_payment_lines' => (new PaymentService())->recentLines($branchId, 1),
            'today_return_lines' => (new ReturnService())->recentLines($branchId, 1),
            'today_cash_snapshot' => $todayCash,
            'expense_snapshot' => $expenseSnap,
            'today_purchase_lines' => (new PurchaseService())->recentLines($branchId, 1),
            'today_swap_lines' => (new SwapService())->recentLines($branchId, 1),
            'today_supplier_payment_lines' => (new SupplierService())->recentPaymentLines($branchId, 1),
            'today_imei_lines' => (new ImeiService())->recentLines($branchId, 1),
            'intake_snapshot' => $intakeSnap,
            'operations_snapshot' => $operationsSnap,
            'today_transfer_lines' => (new TransferService())->recentLines($branchId, 1),
            'today_repair_lines' => (new RepairService())->recentLines($branchId, 1),
            'today_audit_lines' => (new AuditLogger())->recentLines($branchId, 1),
            'receivables_snapshot' => $receivablesSnap,
            'today_approval_lines' => (new ApprovalService())->recentLines($branchId, 1),
            'today_customer_lines' => (new CustomerService())->recentLines($branchId, 1),
            'payables_snapshot' => $payablesSnap,
            'today_supplier_return_lines' => (new SupplierService())->recentReturnLines($branchId, 1),
            'today_stock_count_lines' => (new StockCountService())->recentLines($branchId, 1),
            'today_expense_lines' => (new ExpenseService())->recentLines($branchId, 1),
            'adjustments_snapshot' => $adjustmentsSnap,
            'today_reversal_lines' => (new PaymentService())->reversalLines($branchId, 1),
            'today_voided_lines' => (new SaleService())->voidedLines($branchId, 1),
            'performance_snapshot' => $performanceSnap,
            'today_notify_lines' => (new NotifyService())->recentLines($branchId, 1),
            'staff_snapshot' => $staffSnap,
            'movement_snapshot' => $movementSnap,
            'ledger_snapshot' => $ledgerSnap,
            'repair_snapshot' => $repairSnap,
            'compliance_snapshot' => $complianceSnap,
            'trade_snapshot' => $tradeSnap,
            'aging_snapshot' => $agingSnap,
            'executive_snapshot' => $executiveSnap,
            'branch_snapshot' => $branchSnap,
            'mix_snapshot' => $mixSnap,
            'product_snapshot' => $productSnap,
            'trend_snapshot' => $trendSnap,
            'cashflow_snapshot' => $cashflowSnap,
            'staff_device_snapshot' => $staffDeviceSnap,
            'stock_snapshot' => $stockSnap,
            'imei_snapshot' => $imeiSnap,
            'transfer_snapshot' => $transferSnap,
            'purchase_snapshot' => $purchaseSnap,
            'returns_snapshot' => $returnsSnap,
            'faulty_snapshot' => $faultySnap,
            'customer_snapshot' => $customerSnap,
            'supplier_snapshot' => $supplierSnap,
            'count_snapshot' => $countSnap,
            'approval_snapshot' => $approvalSnap,
            'audit_snapshot' => $auditSnap,
            'collection_snapshot' => $collectionSnap,
            'alert_snapshot'    => $alertSnap,
            'sales_snapshot'    => $salesSnap,
            'payment_snapshot'  => $paymentSnap,
            'swap_snapshot'     => $swapSnap,
            'return_snapshot'   => $returnSnap,
            'adjustment_snapshot' => $adjustmentSnap,
            'procurement_snapshot' => $procurementSnap,
            'receiving_snapshot' => $receivingSnap,
            'payable_snapshot' => $payableSnap,
            'receivable_snapshot' => $receivableSnap,
            'workflow_snapshot' => $workflowSnap,
            'transit_snapshot' => $transitSnap,
            'stockflow_snapshot' => $stockflowSnap,
            'service_snapshot' => $serviceSnap,
            'countflow_snapshot' => $countflowSnap,
            'approvalflow_snapshot' => $approvalflowSnap,
            'auditflow_snapshot' => $auditflowSnap,
            'collectionflow_snapshot' => $collectionflowSnap,
            'alertflow_snapshot' => $alertflowSnap,
            'expenseflow_snapshot' => $expenseflowSnap,
            'performanceflow_snapshot' => $performanceflowSnap,
            'customerflow_snapshot'    => $customerflowSnap,
            'intakeflow_snapshot'      => $intakeflowSnap,
            'supplierflow_snapshot'    => $supplierflowSnap,
            'inventoryflow_snapshot'   => $inventoryflowSnap,
            'staffflow_snapshot'       => $staffflowSnap,
            'branchflow_snapshot'      => $branchflowSnap,
            'cashflowflow_snapshot'    => $cashflowflowSnap,
            'mixflow_snapshot'         => $mixflowSnap,
            'trendflow_snapshot'       => $trendflowSnap,
            'productflow_snapshot'     => $productflowSnap,
            'ledgerflow_snapshot'      => $ledgerflowSnap,
            'executiveflow_snapshot'   => $executiveflowSnap,
            'agingflow_snapshot'       => $agingflowSnap,
            'tradeflow_snapshot'       => $tradeflowSnap,
            'retail_receivable_lines' => (new AnalyticsService())->retailReceivableLines($branchId),
            'notify_lines'    => (new NotifyService())->alertLines($branchId),
            'notify_unread'   => (new NotifyService())->unreadCount($branchId),
            'debt_days'         => $debtDays,
            'repair_days'       => $repairDays,
            'transfer_hours'    => $transferHours,
            'return_days'       => $returnDays,
            'open_repairs'      => $openRepairs,
            'in_transit'        => $transit,
            'low_stock'         => (new ProductService())->lowStockAlerts($branchId),
            'imei'              => (object) $this->imeiSummary($branchId),
            'inventory'         => $this->inventory($branchId),
            'quantity_stock'    => $this->quantityStockTotals($branchId),
            'inbound_reserved'  => $this->inboundReservedCount($branchId),
        ];
    }

    /**
     * @return array{total: int, parties: list<array<string, mixed>>}
     */
    public function payables(): array
    {
        return $this->partyBalances('supplier', true);
    }

    /**
     * @return array{total: int, parties: list<array<string, mixed>>}
     */
    public function receivables(): array
    {
        return $this->partyBalances('customer', true);
    }

    /**
     * @return array<string, mixed>
     */
    public function expenses(string $from, string $to, ?int $branchId = null): array
    {
        global $wpdb;
        $table  = $this->db->table('expenses');
        $where  = "status = 'posted' AND posted_at >= %s AND posted_at < %s";
        $params = [$from . ' 00:00:00', $to . ' 23:59:59'];
        if ($branchId) {
            $where   .= ' AND branch_id = %d';
            $params[] = $branchId;
        }
        $total = (int) $wpdb->get_var($wpdb->prepare("SELECT COALESCE(SUM(amount),0) FROM {$table} WHERE {$where}", ...$params));
        $rows  = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE {$where} ORDER BY posted_at DESC", ...$params), ARRAY_A) ?: [];

        return ['from' => $from, 'to' => $to, 'total' => $total, 'lines' => $rows];
    }

    /**
     * @return list<array{method: string, amount: int}>
     */
    private function sumByMethod(string $table, string $methodCol, string $amountCol, string $where, string $start, string $end, ?int $branchId): array
    {
        global $wpdb;
        $params = [$start, $end];
        if ($branchId) {
            $where   .= ' AND branch_id = %d';
            $params[] = $branchId;
        }
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT {$methodCol} AS method, COALESCE(SUM({$amountCol}),0) AS amount FROM {$table} WHERE {$where} GROUP BY {$methodCol}",
                ...$params
            ),
            ARRAY_A
        ) ?: [];

        return array_map(static fn($r) => ['method' => (string) ($r['method'] ?: 'unknown'), 'amount' => (int) $r['amount']], $rows);
    }

    /**
     * @return array{total: int, parties: list<array<string, mixed>>}|int
     */
    private function partyBalances(string $partyType, bool $detailed = false): array|int
    {
        global $wpdb;
        $led   = $this->db->table('ledgers');
        $names = $this->db->table($partyType === 'supplier' ? 'suppliers' : 'customers');
        $sql   = "SELECT l.party_id, l.balance_after, p.name
                FROM {$led} l
                INNER JOIN (
                    SELECT party_id, MAX(id) AS max_id
                    FROM {$led}
                    WHERE party_type = %s
                    GROUP BY party_id
                ) latest ON latest.max_id = l.id
                LEFT JOIN {$names} p ON p.id = l.party_id";
        $rows    = $wpdb->get_results($wpdb->prepare($sql, $partyType), ARRAY_A) ?: [];
        $total   = 0;
        $parties = [];
        foreach ($rows as $row) {
            $bal = (int) $row['balance_after'];
            if ($bal > 0) {
                $total    += $bal;
                $parties[] = $row;
            }
        }

        return $detailed ? ['total' => $total, 'parties' => $parties] : $total;
    }

    /**
     * @return list<array{id: int, name: string, balance: int}>
     */
    private function partyLines(string $partyType, int $limit = 15): array
    {
        $detailed = $this->partyBalances($partyType, true);
        if (!is_array($detailed)) {
            return [];
        }
        $rows = $detailed['parties'] ?? [];
        usort($rows, static fn($a, $b) => (int) $b['balance_after'] <=> (int) $a['balance_after']);
        $rows = array_slice($rows, 0, max(1, $limit));

        return array_map(static fn($row) => [
            'id'      => (int) ($row['party_id'] ?? 0),
            'name'    => (string) ($row['name'] ?? ('#' . ($row['party_id'] ?? ''))),
            'balance' => (int) ($row['balance_after'] ?? 0),
        ], $rows);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function branchComparison(string $from, string $to): array
    {
        global $wpdb;
        $sales    = $this->db->table('sales');
        $items    = $this->db->table('sale_items');
        $imeis    = $this->db->table('imeis');
        $branches = $this->db->table('branches');
        $start    = $from . ' 00:00:00';
        $end      = $to . ' 23:59:59';

        $ids = current_user_can('atoms_all_branches') ? [] : (new Context())->branchIds();
        $branchFilter = '';
        if ($ids !== []) {
            $in = implode(',', array_map('intval', $ids)) ?: '0';
            $branchFilter = " AND b.id IN ({$in})";
        }

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT b.id, b.name, b.code,
                        COUNT(s.id) AS invoices,
                        COALESCE(SUM(s.total),0) AS revenue,
                        COALESCE(SUM(s.paid_amount),0) AS collected,
                        COALESCE(SUM(s.due_amount),0) AS due
                 FROM {$branches} b
                 LEFT JOIN {$sales} s ON s.branch_id = b.id AND s.status = 'completed'
                    AND s.posted_at >= %s AND s.posted_at <= %s
                 WHERE b.is_active = 1 {$branchFilter}
                 GROUP BY b.id
                 ORDER BY revenue DESC",
                $start,
                $end
            ),
            ARRAY_A
        ) ?: [];

        $profit = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.branch_id, COALESCE(SUM((si.selling_price - si.cost_price) * GREATEST(COALESCE(si.quantity, 1), 1)),0) AS profit
                 FROM {$items} si
                 INNER JOIN {$sales} s ON s.id = si.sale_id
                 WHERE s.status = 'completed' AND s.posted_at >= %s AND s.posted_at <= %s
                 GROUP BY s.branch_id",
                $start,
                $end
            ),
            ARRAY_A
        ) ?: [];
        $profitMap = [];
        foreach ($profit as $row) {
            $profitMap[(int) $row['branch_id']] = (int) $row['profit'];
        }
        $stock = $wpdb->get_results(
            "SELECT branch_id, COUNT(*) AS qty, COALESCE(SUM(cost_price),0) AS value
             FROM {$imeis} WHERE status = 'available' GROUP BY branch_id",
            ARRAY_A
        ) ?: [];
        $stockMap = [];
        foreach ($stock as $row) {
            $stockMap[(int) $row['branch_id']] = $row;
        }
        foreach ($rows as &$row) {
            $id = (int) $row['id'];
            $row['profit'] = $profitMap[$id] ?? 0;
            $row['stock_qty'] = (int) ($stockMap[$id]['qty'] ?? 0);
            $row['stock_value'] = (int) ($stockMap[$id]['value'] ?? 0);
            $row['collection_rate'] = $this->performance->collectionRate((int) $row['collected'], (int) $row['revenue']);
        }
        unset($row);

        return $rows;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function staffSales(string $from, string $to, ?int $branchId = null): array
    {
        global $wpdb;
        $sales  = $this->db->table('sales');
        $items  = $this->db->table('sale_items');
        $where  = "s.status = 'completed' AND s.posted_at >= %s AND s.posted_at <= %s";
        $params = [$from . ' 00:00:00', $to . ' 23:59:59'];
        if ($branchId) {
            $where   .= ' AND s.branch_id = %d';
            $params[] = $branchId;
        }
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.salesperson_id AS id, COUNT(DISTINCT s.id) AS invoices,
                        COALESCE(SUM(s.total),0) AS revenue, COALESCE(SUM(s.paid_amount),0) AS collected
                 FROM {$sales} s WHERE {$where}
                 GROUP BY s.salesperson_id ORDER BY revenue DESC",
                ...$params
            ),
            ARRAY_A
        ) ?: [];
        $profit = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.salesperson_id AS id, COALESCE(SUM((si.selling_price - si.cost_price) * GREATEST(COALESCE(si.quantity, 1), 1)),0) AS profit
                 FROM {$items} si INNER JOIN {$sales} s ON s.id = si.sale_id
                 WHERE {$where} GROUP BY s.salesperson_id",
                ...$params
            ),
            ARRAY_A
        ) ?: [];
        $profitMap = [];
        foreach ($profit as $row) {
            $profitMap[(int) $row['id']] = (int) $row['profit'];
        }
        foreach ($rows as &$row) {
            $id = (int) $row['id'];
            $user = $id ? get_userdata($id) : null;
            $row['name'] = $user ? $user->display_name : ('User #' . $id);
            $row['profit'] = $profitMap[$id] ?? 0;
            $row['collection_rate'] = $this->performance->collectionRate((int) $row['collected'], (int) $row['revenue']);
        }
        unset($row);

        return $rows;
    }

    private function cogs(string $from, string $to, ?int $branchId): int
    {
        global $wpdb;
        $items  = $this->db->table('sale_items');
        $sales  = $this->db->table('sales');
        [$start, $end] = $this->periodBounds($from, $to);
        $where  = "s.status = 'completed' AND s.posted_at >= %s AND s.posted_at <= %s";
        $params = [$start, $end];
        if ($branchId) {
            $where   .= ' AND s.branch_id = %d';
            $params[] = $branchId;
        }

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COALESCE(SUM({$this->lineCostSql()}),0) FROM {$items} si INNER JOIN {$sales} s ON s.id = si.sale_id WHERE {$where}",
                ...$params
            )
        );
    }

    /** @return array{0: string, 1: string} */
    private function periodBounds(string $from, string $to): array
    {
        return [$from . ' 00:00:00', $to . ' 23:59:59'];
    }

    /** Unit cost × qty — accessories store unit cost with quantity > 1. */
    private function lineCostSql(): string
    {
        return 'si.cost_price * GREATEST(COALESCE(si.quantity, 1), 1)';
    }

    /** Line margin accounting quantity. */
    private function lineMarginSql(): string
    {
        return '(si.selling_price - si.cost_price) * GREATEST(COALESCE(si.quantity, 1), 1)';
    }

    private function naira(int $kobo): string
    {
        $sign = $kobo < 0 ? '-' : '';
        $abs  = abs($kobo);

        return $sign . number_format(intdiv($abs, 100), 0, '', '') . '.' . str_pad((string) ($abs % 100), 2, '0', STR_PAD_LEFT);
    }
}
