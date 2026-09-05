<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DebtAging;
use Atoms\Domain\Performance;
use Atoms\Domain\VariantLabel;
use Atoms\Domain\WholesalePolicy;
use Atoms\Support\Db;

final class AnalyticsService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly DebtAging $aging = new DebtAging(),
        private readonly Performance $performance = new Performance()
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function overview(int $days = 14, ?int $branchId = null): array
    {
        $ops        = (new SettingsService())->expose();
        $repairDays = (int) ($ops['repair_days'] ?? 3);
        $returnDays = (int) ($ops['return_days'] ?? 2);
        $debtDays   = (int) ($ops['debt_days'] ?? 7);

        $aging = $this->receivableAging($branchId);
        $topProducts = $this->topProducts($days, $branchId);
        $payableAging = $this->payableAging($branchId);
        $movement = (new ReportService())->recentMovement($branchId, $days);
        $paymentMix = $this->paymentMix($days, $branchId);
        $saleTypes = $this->saleTypeMix($days, $branchId);
        $branches = $this->branchPerformance($days);
        $staffSales = $this->staffSales($days, $branchId);
        $trend = $this->salesTrend($days, $branchId);
        $reports = new ReportService();
        $cashSnapshot = $reports->recentCash($branchId, $days);
        $inventorySnapshot = $reports->inventorySnapshot($branchId);
        $expenseSnapshot = (new ExpenseService())->snapshot($branchId);
        $todayCash = $reports->recentCash($branchId, 1);
        $intakeSnapshot = $reports->intakeSnapshot($branchId);
        $operationsSnapshot = $reports->operationsSnapshot($branchId);
        $receivablesSnapshot = $reports->receivablesSnapshot($branchId);
        $payablesSnapshot = $reports->payablesSnapshot($branchId);
        $adjustmentsSnapshot = $reports->adjustmentsSnapshot($branchId);
        $performanceSnapshot = $reports->performanceSnapshot($branchId);
        $staffSnapshot = $reports->staffSnapshot($branchId);
        $movementSnapshot = $reports->movementSnapshot($branchId);
        $ledgerSnapshot = $reports->ledgerSnapshot($branchId);
        $repairSnapshot = $reports->repairSnapshot($branchId);
        $complianceSnapshot = $reports->complianceSnapshot($branchId);
        $tradeSnapshot = $reports->tradeSnapshot($branchId);
        $agingSnapshot = $reports->agingSnapshot($branchId);
        $executiveSnapshot = $reports->executiveSnapshot($branchId);
        $branchSnapshot = $reports->branchSnapshot($branchId);
        $mixSnapshot = $reports->mixSnapshot($branchId);
        $productSnapshot = $reports->productSnapshot($branchId);
        $trendSnapshot = $reports->trendSnapshot($branchId);
        $cashflowSnapshot = $reports->cashflowSnapshot($branchId);
        $staffDeviceSnapshot = $reports->staffDeviceSnapshot($branchId);
        $stockSnapshot = $reports->stockSnapshot($branchId);
        $imeiSnapshot = $reports->imeiSnapshot($branchId);
        $transferSnapshot = $reports->transferSnapshot($branchId);
        $purchaseSnapshot = $reports->purchaseSnapshot($branchId);
        $returnsSnapshot = $reports->returnsSnapshot($branchId);
        $faultySnapshot = $reports->faultySnapshot($branchId);
        $customerSnapshot = $reports->customerSnapshot($branchId);
        $supplierSnapshot = $reports->supplierSnapshot($branchId);
        $countSnapshot = $reports->countSnapshot($branchId);
        $approvalSnapshot = $reports->approvalSnapshot($branchId);
        $auditSnapshot = $reports->auditSnapshot($branchId);
        $collectionSnapshot = $reports->collectionSnapshot($branchId);
        $alertSnapshot = $reports->alertSnapshot($branchId);
        $salesSnapshot = $reports->salesSnapshot($branchId);
        $paymentSnapshot = $reports->paymentSnapshot($branchId);
        $swapSnapshot = $reports->swapSnapshot($branchId);
        $returnSnapshot = $reports->returnSnapshot($branchId);
        $adjustmentSnapshot = $reports->adjustmentSnapshot($branchId);
        $procurementSnapshot = $reports->procurementSnapshot($branchId);
        $receivingSnapshot   = $reports->receivingSnapshot($branchId);
        $payableSnapshot     = $reports->payableSnapshot($branchId);
        $receivableSnapshot  = $reports->receivableSnapshot($branchId);
        $workflowSnapshot    = $reports->workflowSnapshot($branchId);
        $transitSnapshot     = $reports->transitSnapshot($branchId);
        $stockflowSnapshot   = $reports->stockflowSnapshot($branchId);
        $serviceSnapshot     = $reports->serviceSnapshot($branchId);
        $countflowSnapshot   = $reports->countflowSnapshot($branchId);
        $approvalflowSnapshot = $reports->approvalflowSnapshot($branchId);
        $auditflowSnapshot    = $reports->auditflowSnapshot($branchId);
        $collectionflowSnapshot = $reports->collectionflowSnapshot($branchId);
        $alertflowSnapshot      = $reports->alertflowSnapshot($branchId);
        $expenseflowSnapshot    = $reports->expenseflowSnapshot($branchId);
        $performanceflowSnapshot = $reports->performanceflowSnapshot($branchId);
        $customerflowSnapshot    = $reports->customerflowSnapshot($branchId);
        $intakeflowSnapshot      = $reports->intakeflowSnapshot($branchId);
        $supplierflowSnapshot    = $reports->supplierflowSnapshot($branchId);
        $inventoryflowSnapshot   = $reports->inventoryflowSnapshot($branchId);
        $staffflowSnapshot       = $reports->staffflowSnapshot($branchId);
        $branchflowSnapshot      = $reports->branchflowSnapshot($branchId);
        $cashflowflowSnapshot    = $reports->cashflowflowSnapshot($branchId);
        $mixflowSnapshot         = $reports->mixflowSnapshot($branchId);
        $trendflowSnapshot       = $reports->trendflowSnapshot($branchId);
        $productflowSnapshot     = $reports->productflowSnapshot($branchId);
        $ledgerflowSnapshot      = $reports->ledgerflowSnapshot($branchId);
        $executiveflowSnapshot   = $reports->executiveflowSnapshot($branchId);
        $agingflowSnapshot       = $reports->agingflowSnapshot($branchId);
        $tradeflowSnapshot       = $reports->tradeflowSnapshot($branchId);

        return [
            'trend'         => $trend,
            'trend_lines'   => $trend,
            'branches'      => $branches,
            'branch_lines'  => $branches,
            'staff'         => $staffSales,
            'staff_sales_lines' => $staffSales,
            'staff_devices' => $this->staffDeviceLines($days, $branchId),
            'products'      => $topProducts,
            'top_product_lines' => $topProducts,
            'aging'         => $aging,
            'aging_lines'   => $aging['lines'],
            'aging_buckets' => $aging['buckets'],
            'payable_lines' => $this->payableLines($branchId),
            'payable_aging_lines' => $payableAging['lines'],
            'payable_aging_buckets' => $payableAging['buckets'],
            'movement_lines' => $movement['by_variant'],
            'movement_events' => $movement['events'],
            'overdue_lines' => $this->receivableLines($branchId, $debtDays),
            'transit_lines' => (new TransferService())->transitLines($branchId),
            'repair_lines'  => (new RepairService())->openLines($branchId),
            'stuck_repair_lines' => (new RepairService())->openLines($branchId, $repairDays),
            'faulty_lines'  => (new ImeiService())->faultyLines($branchId),
            'stuck_faulty_lines' => (new ImeiService())->faultyLines($branchId, $returnDays),
            'approval_lines'=> (new ApprovalService())->pendingLines($branchId),
            'stock_count_lines' => (new StockCountService())->openLines($branchId),
            'stuck_transfer_lines' => (new TransferService())->stuckLines($branchId, (int) ($ops['transfer_hours'] ?? 24)),
            'return_lines'  => (new ReturnService())->recentLines($branchId),
            'swap_lines'    => (new SwapService())->recentLines($branchId),
            'sale_lines'    => (new SaleService())->recentLines($branchId),
            'payment_lines' => (new PaymentService())->recentLines($branchId),
            'supplier_payment_lines' => (new SupplierService())->recentPaymentLines($branchId),
            'purchase_lines' => (new PurchaseService())->recentLines($branchId),
            'open_purchase_lines' => (new PurchaseService())->openLines($branchId),
            'supplier_return_lines' => (new SupplierService())->recentReturnLines($branchId),
            'reversal_lines' => (new PaymentService())->reversalLines($branchId),
            'voided_lines'   => (new SaleService())->voidedLines($branchId),
            'posted_expense_lines' => (new ExpenseService())->recentLines($branchId),
            'audit_lines'   => (new AuditLogger())->recentLines($branchId),
            'recent_transfer_lines' => (new TransferService())->recentLines($branchId),
            'posted_stock_count_lines' => (new StockCountService())->recentLines($branchId),
            'completed_repair_lines' => (new RepairService())->recentLines($branchId),
            'recent_approval_lines' => (new ApprovalService())->recentLines($branchId),
            'recent_customer_lines' => (new CustomerService())->recentLines($branchId),
            'recent_imei_lines' => (new ImeiService())->recentLines($branchId),
            'staff_device_lines' => $this->staffDeviceLines($days, $branchId),
            'low_stock_lines' => (new ProductService())->lowStockAlerts($branchId),
            'expense_lines' => (new ExpenseService())->pendingLines($branchId),
            'wholesale_receivable_lines' => $this->wholesaleReceivableLines($branchId),
            'retail_receivable_lines'    => $this->retailReceivableLines($branchId),
            'notify_lines'  => (new NotifyService())->alertLines($branchId),
            'slow'          => $this->slowMovers($branchId),
            'slow_lines'    => $this->slowMovers($branchId),
            'repair_days'   => $repairDays,
            'return_days'   => $returnDays,
            'debt_days'     => $debtDays,
            'mix'           => $paymentMix,
            'payment_mix_lines' => $paymentMix,
            'sale_types'    => $saleTypes,
            'sale_type_lines' => $saleTypes,
            'receivable_party_lines' => $reports->receivablePartyLines(),
            'payable_party_lines' => $reports->payablePartyLines(),
            'cash_snapshot' => $cashSnapshot,
            'imei_status_lines' => $reports->imeiStatusLines($branchId),
            'inventory_snapshot' => $inventorySnapshot,
            'inventory_lines' => $reports->inventoryLines($branchId),
            'today_sales_lines' => (new SaleService())->recentLines($branchId, 1),
            'today_payment_lines' => (new PaymentService())->recentLines($branchId, 1),
            'today_return_lines' => (new ReturnService())->recentLines($branchId, 1),
            'today_cash_snapshot' => $todayCash,
            'expense_snapshot' => $expenseSnapshot,
            'today_purchase_lines' => (new PurchaseService())->recentLines($branchId, 1),
            'today_swap_lines' => (new SwapService())->recentLines($branchId, 1),
            'today_supplier_payment_lines' => (new SupplierService())->recentPaymentLines($branchId, 1),
            'today_imei_lines' => (new ImeiService())->recentLines($branchId, 1),
            'intake_snapshot' => $intakeSnapshot,
            'operations_snapshot' => $operationsSnapshot,
            'today_transfer_lines' => (new TransferService())->recentLines($branchId, 1),
            'today_repair_lines' => (new RepairService())->recentLines($branchId, 1),
            'today_audit_lines' => (new AuditLogger())->recentLines($branchId, 1),
            'receivables_snapshot' => $receivablesSnapshot,
            'today_approval_lines' => (new ApprovalService())->recentLines($branchId, 1),
            'today_customer_lines' => (new CustomerService())->recentLines($branchId, 1),
            'payables_snapshot' => $payablesSnapshot,
            'today_supplier_return_lines' => (new SupplierService())->recentReturnLines($branchId, 1),
            'today_stock_count_lines' => (new StockCountService())->recentLines($branchId, 1),
            'today_expense_lines' => (new ExpenseService())->recentLines($branchId, 1),
            'adjustments_snapshot' => $adjustmentsSnapshot,
            'today_reversal_lines' => (new PaymentService())->reversalLines($branchId, 1),
            'today_voided_lines' => (new SaleService())->voidedLines($branchId, 1),
            'performance_snapshot' => $performanceSnapshot,
            'today_notify_lines' => (new NotifyService())->recentLines($branchId, 1),
            'staff_snapshot' => $staffSnapshot,
            'movement_snapshot' => $movementSnapshot,
            'ledger_snapshot' => $ledgerSnapshot,
            'repair_snapshot' => $repairSnapshot,
            'compliance_snapshot' => $complianceSnapshot,
            'trade_snapshot' => $tradeSnapshot,
            'aging_snapshot' => $agingSnapshot,
            'executive_snapshot' => $executiveSnapshot,
            'branch_snapshot' => $branchSnapshot,
            'mix_snapshot' => $mixSnapshot,
            'product_snapshot' => $productSnapshot,
            'trend_snapshot' => $trendSnapshot,
            'cashflow_snapshot' => $cashflowSnapshot,
            'staff_device_snapshot' => $staffDeviceSnapshot,
            'stock_snapshot' => $stockSnapshot,
            'imei_snapshot' => $imeiSnapshot,
            'transfer_snapshot' => $transferSnapshot,
            'purchase_snapshot' => $purchaseSnapshot,
            'returns_snapshot' => $returnsSnapshot,
            'faulty_snapshot' => $faultySnapshot,
            'customer_snapshot' => $customerSnapshot,
            'supplier_snapshot' => $supplierSnapshot,
            'count_snapshot' => $countSnapshot,
            'approval_snapshot' => $approvalSnapshot,
            'audit_snapshot' => $auditSnapshot,
            'collection_snapshot' => $collectionSnapshot,
            'alert_snapshot' => $alertSnapshot,
            'sales_snapshot' => $salesSnapshot,
            'payment_snapshot' => $paymentSnapshot,
            'swap_snapshot' => $swapSnapshot,
            'return_snapshot' => $returnSnapshot,
            'adjustment_snapshot' => $adjustmentSnapshot,
            'procurement_snapshot' => $procurementSnapshot,
            'receiving_snapshot' => $receivingSnapshot,
            'payable_snapshot' => $payableSnapshot,
            'receivable_snapshot' => $receivableSnapshot,
            'workflow_snapshot' => $workflowSnapshot,
            'transit_snapshot' => $transitSnapshot,
            'stockflow_snapshot' => $stockflowSnapshot,
            'service_snapshot' => $serviceSnapshot,
            'countflow_snapshot' => $countflowSnapshot,
            'approvalflow_snapshot' => $approvalflowSnapshot,
            'auditflow_snapshot' => $auditflowSnapshot,
            'collectionflow_snapshot' => $collectionflowSnapshot,
            'alertflow_snapshot' => $alertflowSnapshot,
            'expenseflow_snapshot' => $expenseflowSnapshot,
            'performanceflow_snapshot' => $performanceflowSnapshot,
            'customerflow_snapshot'    => $customerflowSnapshot,
            'intakeflow_snapshot'      => $intakeflowSnapshot,
            'supplierflow_snapshot'    => $supplierflowSnapshot,
            'inventoryflow_snapshot'   => $inventoryflowSnapshot,
            'staffflow_snapshot'       => $staffflowSnapshot,
            'branchflow_snapshot'      => $branchflowSnapshot,
            'cashflowflow_snapshot'    => $cashflowflowSnapshot,
            'mixflow_snapshot'         => $mixflowSnapshot,
            'trendflow_snapshot'       => $trendflowSnapshot,
            'productflow_snapshot'     => $productflowSnapshot,
            'ledgerflow_snapshot'      => $ledgerflowSnapshot,
            'executiveflow_snapshot'   => $executiveflowSnapshot,
            'agingflow_snapshot'       => $agingflowSnapshot,
            'tradeflow_snapshot'       => $tradeflowSnapshot,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function salesTrend(int $days, ?int $branchId = null): array
    {
        global $wpdb;
        $sales  = $this->db->table('sales');
        $from   = $this->windowFrom($days);
        $where  = "status = 'completed' AND posted_at >= %s";
        $params = [$from . ' 00:00:00'];
        if ($branchId) {
            $where   .= ' AND branch_id = %d';
            $params[] = $branchId;
        }
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT DATE(posted_at) AS d, COUNT(*) AS invoices, COALESCE(SUM(total),0) AS net, COALESCE(SUM(paid_amount),0) AS collected
                 FROM {$sales} WHERE {$where} GROUP BY DATE(posted_at) ORDER BY d ASC",
                ...$params
            ),
            ARRAY_A
        ) ?: [];
        $map = [];
        foreach ($rows as $row) {
            $map[$row['d']] = $row;
        }
        $out = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $d = $this->localDay($i);
            $out[] = [
                'date'      => $d,
                'invoices'  => (int) ($map[$d]['invoices'] ?? 0),
                'net'       => (int) ($map[$d]['net'] ?? 0),
                'collected' => (int) ($map[$d]['collected'] ?? 0),
            ];
        }

        return $out;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function branchPerformance(int $days): array
    {
        global $wpdb;
        $sales    = $this->db->table('sales');
        $items    = $this->db->table('sale_items');
        $imeis    = $this->db->table('imeis');
        $branches = $this->db->table('branches');
        $from     = $this->windowFrom($days) . ' 00:00:00';

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT b.id, b.name, b.code,
                        COUNT(s.id) AS invoices,
                        COALESCE(SUM(s.total),0) AS revenue,
                        COALESCE(SUM(s.paid_amount),0) AS collected,
                        COALESCE(SUM(s.due_amount),0) AS due
                 FROM {$branches} b
                 LEFT JOIN {$sales} s ON s.branch_id = b.id AND s.status = 'completed' AND s.posted_at >= %s
                 WHERE b.is_active = 1
                 GROUP BY b.id
                 ORDER BY revenue DESC",
                $from
            ),
            ARRAY_A
        ) ?: [];

        $profit = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.branch_id, COALESCE(SUM((si.selling_price - si.cost_price) * GREATEST(COALESCE(si.quantity, 1), 1)),0) AS profit
                 FROM {$items} si
                 INNER JOIN {$sales} s ON s.id = si.sale_id
                 WHERE s.status = 'completed' AND s.posted_at >= %s
                 GROUP BY s.branch_id",
                $from
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
    public function staffSales(int $days, ?int $branchId = null): array
    {
        global $wpdb;
        $sales = $this->db->table('sales');
        $items = $this->db->table('sale_items');
        $from  = $this->windowFrom($days);
        $where = "s.status = 'completed' AND s.posted_at >= %s";
        $params = [$from . ' 00:00:00'];
        if ($branchId) {
            $where   .= ' AND s.branch_id = %d';
            $params[] = $branchId;
        }

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.salesperson_id AS id,
                        COUNT(DISTINCT s.id) AS invoices,
                        COALESCE(SUM(s.total),0) AS revenue,
                        COALESCE(SUM(s.paid_amount),0) AS collected
                 FROM {$sales} s
                 WHERE {$where}
                 GROUP BY s.salesperson_id
                 ORDER BY revenue DESC",
                ...$params
            ),
            ARRAY_A
        ) ?: [];

        $profit = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.salesperson_id AS id, COALESCE(SUM((si.selling_price - si.cost_price) * GREATEST(COALESCE(si.quantity, 1), 1)),0) AS profit
                 FROM {$items} si
                 INNER JOIN {$sales} s ON s.id = si.sale_id
                 WHERE {$where}
                 GROUP BY s.salesperson_id",
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

    /**
     * @return list<array<string, mixed>>
     */
    public function staffDeviceLines(int $days, ?int $branchId = null): array
    {
        global $wpdb;
        $sales    = $this->db->table('sales');
        $items    = $this->db->table('sale_items');
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $from     = $this->windowFrom($days);
        $where    = "s.status = 'completed' AND s.posted_at >= %s";
        $params   = [$from . ' 00:00:00'];
        if ($branchId) {
            $where   .= ' AND s.branch_id = %d';
            $params[] = $branchId;
        }

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT s.invoice_number, s.posted_at, s.salesperson_id,
                        i.imei, p.name AS product_name, v.color, v.storage, v.variant_name, si.selling_price
                 FROM {$items} si
                 INNER JOIN {$sales} s ON s.id = si.sale_id
                 INNER JOIN {$imeis} i ON i.id = si.imei_id
                 INNER JOIN {$products} p ON p.id = si.product_id
                 LEFT JOIN {$variants} v ON v.id = si.variant_id
                 WHERE {$where}
                 ORDER BY s.posted_at DESC, s.id DESC, si.id ASC
                 LIMIT 100",
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
     * @return list<array<string, mixed>>
     */
    public function topProducts(int $days, ?int $branchId = null): array
    {
        global $wpdb;
        $items    = $this->db->table('sale_items');
        $sales    = $this->db->table('sales');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $from     = $this->windowFrom($days);
        $where    = "s.status = 'completed' AND s.posted_at >= %s";
        $params   = [$from . ' 00:00:00'];
        if ($branchId) {
            $where   .= ' AND s.branch_id = %d';
            $params[] = $branchId;
        }

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT p.id, p.name, p.brand, v.id AS variant_id, v.color, v.storage, v.variant_name,
                        COALESCE(SUM(GREATEST(COALESCE(si.quantity, 1), 1)),0) AS units,
                        COALESCE(SUM(si.selling_price * GREATEST(COALESCE(si.quantity, 1), 1)),0) AS revenue,
                        COALESCE(SUM((si.selling_price - si.cost_price) * GREATEST(COALESCE(si.quantity, 1), 1)),0) AS profit
                 FROM {$items} si
                 INNER JOIN {$sales} s ON s.id = si.sale_id
                 INNER JOIN {$products} p ON p.id = si.product_id
                 LEFT JOIN {$variants} v ON v.id = si.variant_id
                 WHERE {$where}
                 GROUP BY p.id, v.id, p.name, p.brand, v.color, v.storage, v.variant_name
                 ORDER BY profit DESC
                 LIMIT 10",
                ...$params
            ),
            ARRAY_A
        ) ?: [];
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $row['variant_label'] = $labels->format($row);
        }
        unset($row);

        return $rows;
    }

    /**
     * @return array<string, mixed>
     */
    public function receivableAging(?int $branchId = null): array
    {
        $rows   = $this->receivableLines($branchId);
        $mapped = array_map(static fn($r) => ['days' => (int) $r['days'], 'amount' => (int) $r['amount']], $rows);

        return [
            'buckets' => $this->aging->totals($mapped),
            'lines'   => $rows,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function receivableLines(?int $branchId = null, ?int $minDays = null, ?string $saleType = null): array
    {
        global $wpdb;
        $sales    = $this->db->table('sales');
        $cust     = $this->db->table('customers');
        $items    = $this->db->table('sale_items');
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $where    = "s.status = 'completed' AND s.due_amount > 0";
        $params   = [];
        if ($branchId) {
            $where   .= ' AND s.branch_id = %d';
            $params[] = $branchId;
        }
        if ($minDays !== null) {
            $where   .= ' AND DATEDIFF(NOW(), s.posted_at) >= %d';
            $params[] = max(0, $minDays);
        }
        if ($saleType !== null) {
            $where   .= ' AND s.sale_type = %s';
            $params[] = $saleType;
        }
        $sql = "SELECT c.id, c.name, s.id AS sale_id, s.invoice_number, s.due_amount AS amount,
                       DATEDIFF(NOW(), s.posted_at) AS days
                FROM {$sales} s
                INNER JOIN {$cust} c ON c.id = s.customer_id
                WHERE {$where}
                ORDER BY days DESC, s.due_amount DESC
                LIMIT 50";
        $rows = $params !== []
            ? ($wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [])
            : ($wpdb->get_results($sql, ARRAY_A) ?: []);
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $devices = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT i.imei, p.name AS product_name, v.color, v.storage, v.variant_name
                     FROM {$items} si
                     INNER JOIN {$imeis} i ON i.id = si.imei_id
                     INNER JOIN {$products} p ON p.id = si.product_id
                     LEFT JOIN {$variants} v ON v.id = si.variant_id
                     WHERE si.sale_id = %d
                     ORDER BY si.id ASC",
                    (int) $row['sale_id']
                ),
                ARRAY_A
            ) ?: [];
            foreach ($devices as &$device) {
                $device['variant_label'] = $labels->format($device);
            }
            unset($device);
            $row['devices'] = $devices;
            $row['device_summary'] = implode('; ', array_map(static function (array $device): string {
                $label = (string) ($device['variant_label'] ?? '');
                $name  = (string) ($device['product_name'] ?? '');

                return trim($device['imei'] . ($name !== '' ? ' · ' . $name : '') . ($label !== '' ? ' · ' . $label : ''));
            }, $devices));
        }
        unset($row);

        return $rows;
    }

    /**
     * Open wholesale invoices still owing money.
     *
     * @return list<array<string, mixed>>
     */
    public function wholesaleReceivableLines(?int $branchId = null): array
    {
        return $this->receivableLines($branchId, null, WholesalePolicy::WHOLESALE);
    }

    /**
     * Open retail invoices still owing money.
     *
     * @return list<array<string, mixed>>
     */
    public function retailReceivableLines(?int $branchId = null): array
    {
        return $this->receivableLines($branchId, null, WholesalePolicy::RETAIL);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function payableLines(?int $branchId = null, ?int $supplierId = null): array
    {
        global $wpdb;
        $led       = $this->db->table('ledgers');
        $suppliers = $this->db->table('suppliers');
        $purchases = $this->db->table('purchases');
        $items     = $this->db->table('purchase_items');
        $products  = $this->db->table('products');
        $variants  = $this->db->table('product_variants');
        $balance   = "(SELECT balance_after FROM {$led} lb WHERE lb.party_type = 'supplier' AND lb.party_id = l.party_id ORDER BY lb.id DESC LIMIT 1)";
        $where     = "l.party_type = 'supplier' AND l.entry_type = 'debit' AND l.reference_type = 'purchase' AND ({$balance}) > 0";
        $params    = [];
        if ($branchId) {
            $where   .= ' AND l.branch_id = %d';
            $params[] = $branchId;
        }
        if ($supplierId) {
            $where   .= ' AND l.party_id = %d';
            $params[] = $supplierId;
        }
        $sql = "SELECT s.id, s.name, l.reference_id AS purchase_id, l.amount, l.posted_at,
                       p.invoice_number, DATEDIFF(NOW(), l.posted_at) AS days
                FROM {$led} l
                INNER JOIN {$suppliers} s ON s.id = l.party_id
                INNER JOIN {$purchases} p ON p.id = l.reference_id
                WHERE {$where}
                ORDER BY days DESC, l.amount DESC
                LIMIT 50";
        $rows = $params !== []
            ? ($wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [])
            : ($wpdb->get_results($sql, ARRAY_A) ?: []);
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $lines = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT pi.quantity, p.name AS product_name, v.color, v.storage, v.variant_name
                     FROM {$items} pi
                     INNER JOIN {$products} p ON p.id = pi.product_id
                     LEFT JOIN {$variants} v ON v.id = pi.variant_id
                     WHERE pi.purchase_id = %d
                     ORDER BY pi.id ASC",
                    (int) $row['purchase_id']
                ),
                ARRAY_A
            ) ?: [];
            $bits = [];
            foreach ($lines as $line) {
                $label = $labels->format($line);
                $name  = (string) ($line['product_name'] ?? '');
                $qty   = (int) ($line['quantity'] ?? 1);
                $bit   = $name !== '' ? $name : 'Item';
                if ($label !== '') {
                    $bit .= ' · ' . $label;
                }
                if ($qty > 1) {
                    $bit .= ' ×' . $qty;
                }
                $bits[] = $bit;
            }
            $row['variant_summary'] = implode('; ', $bits);
        }
        unset($row);

        return $rows;
    }

    /**
     * @return array<string, mixed>
     */
    public function payableAging(?int $branchId = null): array
    {
        $rows   = $this->payableLines($branchId);
        $mapped = array_map(static fn($r) => ['days' => (int) $r['days'], 'amount' => (int) $r['amount']], $rows);

        return [
            'buckets' => $this->aging->totals($mapped),
            'lines'   => $rows,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function slowMovers(?int $branchId = null): array
    {
        global $wpdb;
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $where    = "i.status = 'available' AND i.created_at < DATE_SUB(NOW(), INTERVAL 21 DAY)";
        $params   = [];
        if ($branchId) {
            $where   .= ' AND i.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT p.id, p.name, v.id AS variant_id, v.color, v.storage, v.variant_name,
                       COUNT(*) AS qty, MIN(i.created_at) AS oldest
                FROM {$imeis} i
                INNER JOIN {$products} p ON p.id = i.product_id
                LEFT JOIN {$variants} v ON v.id = i.variant_id
                WHERE {$where}
                GROUP BY p.id, v.id, p.name, v.color, v.storage, v.variant_name
                ORDER BY oldest ASC
                LIMIT 15";
        $rows = $params !== []
            ? ($wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [])
            : ($wpdb->get_results($sql, ARRAY_A) ?: []);
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $row['variant_label'] = $labels->format($row);
        }
        unset($row);

        return $rows;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function paymentMix(int $days, ?int $branchId = null): array
    {
        global $wpdb;
        $sales  = $this->db->table('sales');
        $from   = $this->windowFrom($days);
        $where  = "status = 'completed' AND posted_at >= %s";
        $params = [$from . ' 00:00:00'];
        if ($branchId) {
            $where   .= ' AND branch_id = %d';
            $params[] = $branchId;
        }

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT payment_method AS method, COUNT(*) AS invoices, COALESCE(SUM(paid_amount),0) AS collected
                 FROM {$sales} WHERE {$where} GROUP BY payment_method ORDER BY collected DESC",
                ...$params
            ),
            ARRAY_A
        ) ?: [];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function saleTypeMix(int $days, ?int $branchId = null): array
    {
        global $wpdb;
        $sales  = $this->db->table('sales');
        $from   = $this->windowFrom($days);
        $where  = "status = 'completed' AND posted_at >= %s";
        $params = [$from . ' 00:00:00'];
        if ($branchId) {
            $where   .= ' AND branch_id = %d';
            $params[] = $branchId;
        }

        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT sale_type, COUNT(*) AS invoices, COALESCE(SUM(total),0) AS net
                 FROM {$sales} WHERE {$where} GROUP BY sale_type ORDER BY net DESC",
                ...$params
            ),
            ARRAY_A
        ) ?: [];

        $policy = new WholesalePolicy();
        $out    = [];
        foreach ($rows as $row) {
            $key = $policy->normalize((string) ($row['sale_type'] ?? ''));
            $out[] = [
                'type'      => $key,
                'label'     => $policy->label($key),
                'invoices'  => (int) ($row['invoices'] ?? 0),
                'net'       => (int) ($row['net'] ?? 0),
            ];
        }

        return $out;
    }

    private function windowFrom(int $days): string
    {
        return $this->localDay(max(1, $days) - 1);
    }

    private function localDay(int $offsetDays = 0): string
    {
        $ts = (function_exists('current_time') ? (int) current_time('timestamp') : time()) - ($offsetDays * 86400);

        return date('Y-m-d', $ts);
    }
}
