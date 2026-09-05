<?php
/**
 * WP-CLI smoke: purchase → IMEI → sale → payment → return → supplier → repair → expense → notify → analytics.
 * Run: wp eval-file wp-content/plugins/atoms/docker/smoke.php --allow-root
 */

if (!defined('ABSPATH')) {
    fwrite(STDERR, "Must run inside WordPress.\n");
    exit(1);
}

wp_set_current_user(1);
global $wpdb;

$branch   = (new Atoms\Services\BranchService())->all()[0];
$staleCounts = $wpdb->get_results($wpdb->prepare(
    'SELECT id, status FROM ' . $wpdb->prefix . 'atoms_stock_counts WHERE branch_id = %d AND status IN (%s, %s)',
    (int) $branch['id'],
    'open',
    'pending_approval'
), ARRAY_A) ?: [];
$countCleanup = new Atoms\Services\StockCountService();
foreach ($staleCounts as $stale) {
    if (($stale['status'] ?? '') === 'pending_approval') {
        $countCleanup->reject((int) $stale['id']);
        continue;
    }
    $countCleanup->cancel((int) $stale['id']);
}
$product  = (new Atoms\Services\ProductService())->search('Samsung')[0] ?? (new Atoms\Services\ProductService())->search('')[0];
$supplier = (new Atoms\Services\SupplierService())->all()[0];
if (!array_key_exists('balance', $supplier)) {
    throw new RuntimeException('Supplier list must include what we owe.');
}
$supplier = (new Atoms\Services\SupplierService())->save((int) $supplier['id'], [
    'name'           => (string) $supplier['name'],
    'phone'          => (string) ($supplier['phone'] ?? ''),
    'contact_person' => 'Smoke Buyer',
    'address'        => 'Ring Road, Ibadan',
]);
if (($supplier['address'] ?? '') !== 'Ring Road, Ibadan') {
    throw new RuntimeException('Supplier address must persist.');
}
$customer = (new Atoms\Services\CustomerService())->save(null, [
    'name'      => 'Smoke Customer',
    'phone'     => '080' . random_int(10000000, 99999999),
    'address'   => 'Challenge, Ibadan',
    'branch_id' => (int) $branch['id'],
]);
if (($customer['address'] ?? '') !== 'Challenge, Ibadan') {
    throw new RuntimeException('Customer address must persist.');
}

$imei = (string) random_int(350000000000000, 359999999999999);

$purchase = (new Atoms\Services\PurchaseService())->create([
    'supplier_id'     => (int) $supplier['id'],
    'branch_id'       => (int) $branch['id'],
    'invoice_number'  => 'SMOKE-' . time(),
    'items'           => [[
        'product_id' => (int) $product['id'],
        'cost_price' => 250000,
        'quantity'   => 1,
    ]],
]);
(new Atoms\Services\PurchaseService())->receive((int) $purchase['id']);
(new Atoms\Services\PurchaseService())->registerImeis((int) $purchase['id'], [[
    'imei'          => $imei,
    'product_id'    => (int) $product['id'],
    'serial_number' => 'SMK-' . substr($imei, -6),
]]);

$sale = (new Atoms\Services\SaleService())->create([
    'branch_id'      => (int) $branch['id'],
    'customer_id'    => (int) $customer['id'],
    'sale_type'      => 'retail',
    'payment_method' => 'cash',
    'paid_amount'    => 100000,
    'items'          => [[
        'imei'          => $imei,
        'selling_price' => 280000,
    ]],
]);

(new Atoms\Services\PaymentService())->post([
    'customer_id' => (int) $customer['id'],
    'sale_id'     => (int) $sale['id'],
    'amount'      => 180000,
    'method'      => 'transfer',
    'branch_id'   => (int) $branch['id'],
]);

$fresh = (new Atoms\Services\SaleService())->get((int) $sale['id']);
if ((int) $fresh['due_amount'] !== 0) {
    throw new RuntimeException('Expected invoice to be settled via a separate payment event.');
}
if (empty($fresh['salesperson']['name'])) {
    throw new RuntimeException('Sale must hydrate the salesperson.');
}
if (($fresh['items'][0]['serial_number'] ?? '') !== 'SMK-' . substr($imei, -6)) {
    throw new RuntimeException('Invoice items must include the device serial.');
}
$located = (new Atoms\Services\ReturnService())->locate($imei);
if (($located['invoice_number'] ?? '') !== (string) $sale['invoice_number']) {
    throw new RuntimeException('Return locate must find the invoice from the IMEI.');
}
$receipt = (new Atoms\Domain\ReceiptLayout())->document(
    $fresh,
    (new Atoms\Domain\ShopIdentity())->of(['company' => 'Abu Twins Softskills Investment', 'wordmark' => 'abutwins', 'tagline' => 'INVESTMENT']),
    $branch
);
if ($receipt['invoice'] !== (string) $sale['invoice_number'] || $receipt['lines'][0]['serial'] === '') {
    throw new RuntimeException('Receipt must name the invoice and serial.');
}
$imeiHist = (new Atoms\Services\ImeiService())->history((int) $located['imei']['id']);
if (($imeiHist['imei']['last_invoice'] ?? '') !== (string) $sale['invoice_number']) {
    throw new RuntimeException('IMEI history must show the last invoice.');
}

$staffDir = (new Atoms\Services\UserService())->directory();
if ($staffDir['sellers'] === []) {
    throw new RuntimeException('Staff directory must list sellers.');
}

$stmt = (new Atoms\Services\CustomerService())->statement((int) $customer['id']);
if (($stmt['ledger'] ?? []) === [] || !isset($stmt['invoices'])) {
    throw new RuntimeException('Customer statement must include ledger and invoices.');
}
$stmtCsv = (new Atoms\Services\CustomerService())->exportStatement((int) $customer['id']);
if (!str_contains((string) $stmtCsv['csv'], 'Debit')) {
    throw new RuntimeException('Statement CSV header missing.');
}

$audit = (new Atoms\Services\AuditLogger())->search([
    'q'        => (string) $sale['invoice_number'],
    'action'   => 'sale.created',
    'per_page' => 10,
]);
if ((int) ($audit['total'] ?? 0) < 1) {
    throw new RuntimeException('Audit trail did not record the smoke sale.');
}
$auditRow = $audit['items'][0];
if (($auditRow['action_label'] ?? '') !== 'Sale posted') {
    throw new RuntimeException('Audit must label sale.created as Sale posted. Got=' . ($auditRow['action_label'] ?? ''));
}
if (($auditRow['user_name'] ?? '') === '') {
    throw new RuntimeException('Audit must hydrate the user name.');
}
if (!str_contains((string) ($auditRow['summary'] ?? ''), (string) $sale['invoice_number'])) {
    throw new RuntimeException('Audit summary should name the invoice.');
}
$auditCsv = (new Atoms\Services\AuditLogger())->export(['q' => (string) $sale['invoice_number']]);
if (!str_contains((string) $auditCsv['csv'], 'Sale posted')) {
    throw new RuntimeException('Audit CSV missing the sale row.');
}

(new Atoms\Services\ReturnService())->create([
    'sale_id'      => (int) $sale['id'],
    'return_type'  => 'faulty',
    'resolution'   => 'refund',
    'reason'       => 'Smoke test faulty return',
    'items'        => [['imei' => $imei]],
]);

$hist = (new Atoms\Services\ImeiService())->getByImei($imei);
if ($hist['status'] !== 'faulty') {
    throw new RuntimeException('Faulty return did not isolate the IMEI. Status=' . $hist['status']);
}
$faultyQueue = (new Atoms\Services\ImeiService())->faultyLines((int) $branch['id']);
if ($faultyQueue === [] || !array_key_exists('device_summary', $faultyQueue[0])) {
    throw new RuntimeException('Faulty device queue must expose device_summary after a faulty return.');
}
try {
    (new Atoms\Services\ReturnService())->locate($imei);
    throw new RuntimeException('Locate must refuse a device that is no longer sold.');
} catch (Atoms\Domain\DomainException $e) {
    if (!str_contains($e->getMessage(), 'sold')) {
        throw $e;
    }
}
try {
    (new Atoms\Services\SaleService())->void((int) $sale['id'], 'Should not void a returned invoice');
    throw new RuntimeException('Voiding a returned invoice must be refused.');
} catch (Atoms\Domain\DomainException $e) {
    if (!str_contains($e->getMessage(), 'already has a return')) {
        throw $e;
    }
}

$history = (new Atoms\Services\ImeiService())->history((int) $hist['id']);
$events  = array_column($history['events'], 'event_type');
foreach (['purchase_received', 'complete_sale', 'return_faulty'] as $must) {
    if (!in_array($must, $events, true)) {
        throw new RuntimeException('Missing IMEI event: ' . $must);
    }
}

$supplierBalance = (new Atoms\Services\LedgerService())->balance('supplier', (int) $supplier['id']);
if ($supplierBalance->minor() < 25000000) {
    throw new RuntimeException('Purchase did not post a supplier payable. Balance=' . $supplierBalance->minor());
}
$payableLines = (new Atoms\Services\AnalyticsService())->payableLines((int) $branch['id'], (int) $supplier['id']);
if ($payableLines === [] || !array_key_exists('variant_summary', $payableLines[0])) {
    throw new RuntimeException('Payable lines must include variant_summary when supplier owes.');
}
$supBeforePay = (new Atoms\Services\SupplierService())->get((int) $supplier['id']);
if (!array_key_exists('open_purchases', $supBeforePay) || $supBeforePay['open_purchases'] === []) {
    throw new RuntimeException('Supplier detail must list open_purchases while balance is owed.');
}
$payableCsv = (new Atoms\Services\ReportService())->export('payable_purchases', current_time('Y-m-d'), current_time('Y-m-d'), (int) $branch['id']);
if (!str_contains((string) $payableCsv['csv'], 'Variants') || !str_contains((string) $payableCsv['csv'], 'PO invoice')) {
    throw new RuntimeException('Payable purchases CSV must include Variants and PO invoice columns.');
}
(new Atoms\Services\SupplierService())->pay([
    'supplier_id' => (int) $supplier['id'],
    'amount'      => 250000,
    'method'      => 'transfer',
    'branch_id'   => (int) $branch['id'],
]);
$afterPay = (new Atoms\Services\LedgerService())->balance('supplier', (int) $supplier['id']);
if ($afterPay->minor() !== $supplierBalance->subtract(Atoms\Domain\Money::fromMajor(250000))->minor()) {
    throw new RuntimeException('Supplier payment did not reduce the payable.');
}
$supDetail = (new Atoms\Services\SupplierService())->get((int) $supplier['id']);
if ($supDetail['payments'] === [] || (int) ($supDetail['payments'][0]['amount'] ?? 0) <= 0) {
    throw new RuntimeException('Supplier detail must list posted payments.');
}

$repair = (new Atoms\Services\RepairService())->receive([
    'imei'              => $imei,
    'branch_id'         => (int) $branch['id'],
    'fault_description' => 'Smoke test screen',
    'customer_id'       => (int) $customer['id'],
    'engineer_id'       => 1,
]);
if ((int) ($repair['engineer_id'] ?? 0) !== 1 || ($repair['engineer_name'] ?? '') === '') {
    throw new RuntimeException('Repair must hydrate the assigned engineer.');
}
$openRepairLines = (new Atoms\Services\RepairService())->openLines((int) $branch['id']);
if ($openRepairLines === [] || !array_key_exists('device_summary', $openRepairLines[0])) {
    throw new RuntimeException('Open repair lines must expose device_summary.');
}
(new Atoms\Services\RepairService())->advance((int) $repair['id'], 'diagnosing');
(new Atoms\Services\RepairService())->advance((int) $repair['id'], 'repairing');
(new Atoms\Services\RepairService())->resolve((int) $repair['id'], 'stock');
$afterRepair = (new Atoms\Services\ImeiService())->getByImei($imei);
if ($afterRepair['status'] !== 'available') {
    throw new RuntimeException('Repaired stock should be available. Status=' . $afterRepair['status']);
}

$expense = (new Atoms\Services\ExpenseService())->submit([
    'branch_id'   => (int) $branch['id'],
    'category'    => 'fuel',
    'amount'      => 15000,
    'description' => 'Smoke generator fuel',
]);
if (($expense['status'] ?? '') !== 'posted') {
    throw new RuntimeException('Small expense should post without approval.');
}

$settings = (new Atoms\Services\SettingsService())->save([
    'company'           => 'Abu Twins Softskills Investment',
    'wordmark'          => 'abutwins',
    'wordmark_accent'   => 'Softskills',
    'tagline'           => 'INVESTMENT',
    'whatsapp_phone'    => '08031234567',
    'whatsapp_enabled'  => true,
    'low_stock_notify'  => true,
    'expense_threshold' => 50000,
    'warranty_days'     => 365,
]);
if ($settings['whatsapp_phone'] !== '08031234567') {
    throw new RuntimeException('Settings did not persist WhatsApp phone.');
}
$brand = (new Atoms\Domain\ShopIdentity())->of($settings);
if ($brand['wordmark'] !== 'abutwins' || $brand['accent'] !== 'Softskills') {
    throw new RuntimeException('Shop identity must come from settings, not a hardcoded wordmark.');
}

$settings = (new Atoms\Services\SettingsService())->save([
    'whatsapp_phone'   => '08031234567',
    'whatsapp_enabled' => true,
    'whatsapp_token'   => 'smoke-secret-token',
]);
if (!empty($settings['whatsapp_token'])) {
    throw new RuntimeException('Settings API must not return the WhatsApp token.');
}
if (empty($settings['whatsapp_token_set'])) {
    throw new RuntimeException('Settings must say a token is saved without revealing it.');
}
$rawOps = get_option(Atoms\Services\SettingsService::OPTION);
if (!is_array($rawOps) || !str_starts_with((string) ($rawOps['whatsapp_token'] ?? ''), 'enc:v1:')) {
    throw new RuntimeException('WhatsApp token must be encrypted at rest.');
}
if (str_contains((string) wp_json_encode($rawOps), 'smoke-secret-token')) {
    throw new RuntimeException('Plaintext WhatsApp token leaked into wp_options.');
}
if ((new Atoms\Services\SettingsService())->get()['whatsapp_token'] !== 'smoke-secret-token') {
    throw new RuntimeException('Server must still be able to read the WhatsApp token.');
}
(new Atoms\Services\SettingsService())->save([
    'whatsapp_phone'   => '08031234567',
    'whatsapp_enabled' => true,
]);
if ((new Atoms\Services\SettingsService())->get()['whatsapp_token'] !== 'smoke-secret-token') {
    throw new RuntimeException('Saving settings with a blank token field must keep the stored token.');
}

$notify = new Atoms\Services\NotifyService();
$nid = $notify->push('smoke', 'Smoke alert', 'Phase 3 notification', [
    'phone'          => '08031234567',
    'branch_id'      => (int) $branch['id'],
    'reference_type' => 'sale',
    'reference_id'   => (int) $sale['id'],
]);
$inbox = $notify->inbox(1);
$titles = array_column($inbox['items'], 'title');
if (!in_array('Smoke alert', $titles, true) || $inbox['unread'] < 1) {
    throw new RuntimeException('Notification inbox did not receive the smoke alert.');
}
$outbox = $notify->outbox();
if ($outbox === []) {
    throw new RuntimeException('WhatsApp outbox should contain a wa.me row.');
}
$sent = $notify->markSent((int) $outbox[0]['id']);
if (($sent['status'] ?? '') !== 'sent') {
    throw new RuntimeException('Outbox mark-sent must close the row. Status=' . ($sent['status'] ?? ''));
}

$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
foreach (['trend', 'branches', 'staff', 'products', 'aging', 'slow', 'mix', 'sale_types'] as $key) {
    if (!array_key_exists($key, $analytics)) {
        throw new RuntimeException('Analytics overview missing ' . $key);
    }
}
if (!isset($analytics['aging']['buckets']['0-30'])) {
    throw new RuntimeException('Receivable aging buckets missing.');
}
$staffIds = array_map(static fn($row) => (int) $row['id'], $analytics['staff']);
if (!in_array(1, $staffIds, true)) {
    throw new RuntimeException('Analytics staff must include the salesperson on the smoke sale.');
}
if ($analytics['branches'] === [] || !array_key_exists('collection_rate', $analytics['branches'][0])) {
    throw new RuntimeException('Branch performance must include collection rate.');
}

$counts = new Atoms\Services\StockCountService();
$matchCount = $counts->open(['branch_id' => (int) $branch['id']]);
foreach ($matchCount['lines'] as $line) {
    $counts->scan((int) $matchCount['id'], ['imei' => $line['imei']]);
}
$matched = $counts->submit((int) $matchCount['id'], '');
if (($matched['status'] ?? '') !== 'posted') {
    throw new RuntimeException('A matching stock count should post without approval. Status=' . ($matched['status'] ?? ''));
}

$missingImei = (string) random_int(350000000000000, 359999999999999);
$purchase2 = (new Atoms\Services\PurchaseService())->create([
    'supplier_id'    => (int) $supplier['id'],
    'branch_id'      => (int) $branch['id'],
    'invoice_number' => 'SMOKE-COUNT-' . time(),
    'items'          => [[
        'product_id' => (int) $product['id'],
        'cost_price' => 250000,
        'quantity'   => 1,
    ]],
]);
(new Atoms\Services\PurchaseService())->receive((int) $purchase2['id']);
(new Atoms\Services\PurchaseService())->registerImeis((int) $purchase2['id'], [[
    'imei'       => $missingImei,
    'product_id' => (int) $product['id'],
]]);

$gap = $counts->open(['branch_id' => (int) $branch['id']]);
foreach ($gap['lines'] as $line) {
    if ((string) $line['imei'] === $missingImei) {
        continue;
    }
    $counts->scan((int) $gap['id'], ['imei' => $line['imei']]);
}
$waiting = $counts->submit((int) $gap['id'], 'Smoke test vault gap');
if (($waiting['status'] ?? '') !== 'pending_approval') {
    throw new RuntimeException('A missing IMEI must wait for approval. Status=' . ($waiting['status'] ?? ''));
}
$pend = (new Atoms\Services\ApprovalService())->pending();
$hit = null;
foreach ($pend as $row) {
    if ((int) ($row['id'] ?? 0) === (int) $waiting['approval_id']) {
        $hit = $row;
        break;
    }
}
if (!$hit) {
    throw new RuntimeException('Pending queue must include the stock-count approval.');
}
if (($hit['type_label'] ?? '') !== 'Stock count variance') {
    throw new RuntimeException('Approval type_label missing. Got ' . ($hit['type_label'] ?? ''));
}
if (!str_contains((string) ($hit['summary'] ?? ''), 'missing')) {
    throw new RuntimeException('Approval summary must describe the variance. Got ' . ($hit['summary'] ?? ''));
}
if (($hit['requester_name'] ?? '') === '') {
    throw new RuntimeException('Approval must hydrate who asked.');
}
if (($hit['branch_name'] ?? '') === '') {
    throw new RuntimeException('Approval must hydrate the branch.');
}
$apprLines = (new Atoms\Services\ApprovalService())->pendingLines((int) $branch['id']);
if ($apprLines === [] || ($apprLines[0]['type_label'] ?? '') === '') {
    throw new RuntimeException('Pending approval lines must hydrate type_label for the stock-count request.');
}
$countOpen = (new Atoms\Services\StockCountService())->openLines((int) $branch['id']);
if ($countOpen === [] || !array_key_exists('missing_summary', $countOpen[0])) {
    throw new RuntimeException('Open stock count lines must expose missing_summary while a count is pending.');
}
$apprDetail = (new Atoms\Services\ApprovalService())->get((int) $waiting['approval_id']);
if (($apprDetail['type'] ?? '') !== 'stock_adjustment' || ($apprDetail['payload']['missing_lines'] ?? []) === []) {
    throw new RuntimeException('Approval detail must expose stock_adjustment payload lines.');
}
(new Atoms\Services\ApprovalService())->decide((int) $waiting['approval_id'], 'approve', 'Smoke approve variance');
$gone = (new Atoms\Services\ImeiService())->getByImei($missingImei);
if ($gone['status'] !== 'disposed') {
    throw new RuntimeException('Approved missing count should dispose the IMEI. Status=' . $gone['status']);
}

$stillThere = (new Atoms\Services\ImeiService())->getByImei($imei);
if ($stillThere['status'] !== 'available') {
    throw new RuntimeException('IMEI that was found on the floor should stay available. Status=' . $stillThere['status']);
}

$returnImei = (string) random_int(350000000000000, 359999999999999);
$purchase3 = (new Atoms\Services\PurchaseService())->create([
    'supplier_id'    => (int) $supplier['id'],
    'branch_id'      => (int) $branch['id'],
    'invoice_number' => 'SMOKE-RET-' . time(),
    'items'          => [[
        'product_id' => (int) $product['id'],
        'cost_price' => 250000,
        'quantity'   => 1,
    ]],
]);
(new Atoms\Services\PurchaseService())->receive((int) $purchase3['id']);
(new Atoms\Services\PurchaseService())->registerImeis((int) $purchase3['id'], [[
    'imei'       => $returnImei,
    'product_id' => (int) $product['id'],
]]);
$owedBefore = (new Atoms\Services\LedgerService())->balance('supplier', (int) $supplier['id']);
$sentBack = (new Atoms\Services\SupplierService())->returnDevice([
    'supplier_id' => (int) $supplier['id'],
    'imei'        => $returnImei,
    'branch_id'   => (int) $branch['id'],
]);
$goneToSupplier = (new Atoms\Services\ImeiService())->getByImei($returnImei);
if ($goneToSupplier['status'] !== 'disposed') {
    throw new RuntimeException('Supplier return should dispose the IMEI. Status=' . $goneToSupplier['status']);
}
$owedAfter = (new Atoms\Services\LedgerService())->balance('supplier', (int) $supplier['id']);
if ($owedAfter->minor() !== $owedBefore->subtract(Atoms\Domain\Money::fromMajor(250000))->minor()) {
    throw new RuntimeException('Supplier return did not credit the payable.');
}
if ((int) ($sentBack['credited'] ?? 0) !== 25000000) {
    throw new RuntimeException('Supplier return credit amount is wrong.');
}

$today = current_time('Y-m-d');
$reports = new Atoms\Services\ReportService();
$pack = $reports->pack($today, $today, (int) $branch['id']);
foreach (['sales', 'inventory', 'imei', 'movement', 'cash', 'expenses', 'payables', 'receivables', 'branches', 'staff'] as $key) {
    if (!array_key_exists($key, $pack)) {
        throw new RuntimeException('Report pack missing ' . $key);
    }
}
if ((int) $pack['sales']['invoices'] < 1) {
    throw new RuntimeException('Sales report should include the smoke invoice.');
}
$csv = $reports->export('sales', $today, $today, (int) $branch['id']);
if (!str_contains((string) $csv['csv'], (string) $sale['invoice_number'])) {
    throw new RuntimeException('Sales CSV did not include the smoke invoice.');
}
if (!str_contains((string) $csv['filename'], 'atoms-sales-')) {
    throw new RuntimeException('CSV filename missing.');
}
$csvBranches = $reports->export('branches', $today, $today, (int) $branch['id']);
if (!str_contains((string) $csvBranches['csv'], 'Collection')) {
    throw new RuntimeException('Branch CSV must include collection rate.');
}
$csvStaff = $reports->export('staff', $today, $today, (int) $branch['id']);
if (!str_contains((string) $csvStaff['csv'], 'Staff')) {
    throw new RuntimeException('Staff CSV header missing.');
}
$period = $reports->period('week');
if ($period['from'] > $period['to']) {
    throw new RuntimeException('Week preset produced an inverted range.');
}

$creditSale = (new Atoms\Services\SaleService())->create([
    'branch_id'      => (int) $branch['id'],
    'customer_id'    => (int) $customer['id'],
    'sale_type'      => 'retail',
    'payment_method' => 'cash',
    'paid_amount'    => 0,
    'items'          => [[
        'imei'          => $imei,
        'selling_price' => 280000,
    ]],
]);
if ((int) $creditSale['due_amount'] !== 28000000) {
    throw new RuntimeException('Unpaid sale should keep the full invoice due.');
}
$partPay = (new Atoms\Services\PaymentService())->post([
    'customer_id' => (int) $customer['id'],
    'sale_id'     => (int) $creditSale['id'],
    'amount'      => 10000,
    'method'      => 'transfer',
    'branch_id'   => (int) $branch['id'],
]);
$afterPart = (new Atoms\Services\SaleService())->get((int) $creditSale['id']);
if ((int) $afterPart['due_amount'] !== 27000000) {
    throw new RuntimeException('Partial payment did not reduce the displayed due.');
}
(new Atoms\Services\PaymentService())->reverse((int) $partPay['id'], 'Smoke reverse');
$afterRev = (new Atoms\Services\SaleService())->get((int) $creditSale['id']);
if ((int) $afterRev['due_amount'] !== 28000000) {
    throw new RuntimeException('Payment reversal must restore the invoice due. Due=' . $afterRev['due_amount']);
}

(new Atoms\Services\SettingsService())->save([
    'debt_days'      => 0,
    'repair_days'    => 0,
    'transfer_hours' => 0,
    'return_days'    => 0,
    'digest_enabled' => true,
    'automation_enabled' => true,
]);
$db = new Atoms\Support\Db();
$salesTable = $db->table('sales');
$wpdb->query($wpdb->prepare(
    "UPDATE {$salesTable} SET paid_amount = total, due_amount = 0
     WHERE status = 'completed' AND due_amount > 0 AND id != %d",
    (int) $creditSale['id']
));
$wpdb->query($wpdb->prepare(
    'DELETE FROM ' . $db->table('notifications') . ' WHERE type = %s',
    'outstanding_debt'
));
$todayKey = (new Atoms\Domain\AutomationRules())->digestKey($db->today());
$wpdb->query($wpdb->prepare(
    'DELETE FROM ' . $db->table('notifications') . ' WHERE type = %s AND reference_type = %s AND reference_id = %d',
    'daily_digest',
    'digest',
    $todayKey
));
$auto = (new Atoms\Services\AutomationService())->run();
if ((int) ($auto['counts']['daily_digest'] ?? 0) !== 1) {
    throw new RuntimeException('First automation run should post a daily digest.');
}
if ((int) ($auto['counts']['overdue_debts'] ?? 0) < 1) {
    throw new RuntimeException('Unpaid invoice should raise an overdue-debt alert.');
}
$again = (new Atoms\Services\AutomationService())->run();
if ((int) ($again['counts']['daily_digest'] ?? 0) !== 0) {
    throw new RuntimeException('Digest must not spam twice in the same day.');
}
if ((int) ($again['counts']['overdue_debts'] ?? 0) !== 0) {
    throw new RuntimeException('Overdue-debt alerts must not repeat within 24 hours.');
}
if (!wp_next_scheduled(Atoms\Services\AutomationService::CRON_HOOK)) {
    throw new RuntimeException('Hourly automation cron was not scheduled.');
}

$emptySearch = (new Atoms\Services\SearchService())->query('');
if (($emptySearch['sales'] ?? ['x']) !== [] || ($emptySearch['imeis'] ?? ['x']) !== []) {
    throw new RuntimeException('Empty search must not dump the whole database.');
}
$found = (new Atoms\Services\SearchService())->query((string) $sale['invoice_number']);
$invoices = array_column($found['sales'] ?? [], 'invoice_number');
if (!in_array($sale['invoice_number'], $invoices, true)) {
    throw new RuntimeException('Global search did not find the smoke invoice.');
}
if ((new Atoms\Domain\StatusLabel())->of('pending_approval') !== 'Waiting for approval') {
    throw new RuntimeException('Status labels must use business language.');
}
$dash = (new Atoms\Services\ReportService())->dashboard(999999);
if (!is_object($dash['imei'])) {
    throw new RuntimeException('Empty IMEI summary must encode as an object for the home screen.');
}

$voidImei = (string) random_int(350000000000000, 359999999999999);
$voidPo = (new Atoms\Services\PurchaseService())->create([
    'supplier_id'    => (int) $supplier['id'],
    'branch_id'      => (int) $branch['id'],
    'invoice_number' => 'SMOKE-VOID-' . time(),
    'items'          => [[
        'product_id' => (int) $product['id'],
        'cost_price' => 250000,
        'quantity'   => 1,
    ]],
]);
(new Atoms\Services\PurchaseService())->receive((int) $voidPo['id']);
(new Atoms\Services\PurchaseService())->registerImeis((int) $voidPo['id'], [[
    'imei'       => $voidImei,
    'product_id' => (int) $product['id'],
]]);
$voidSale = (new Atoms\Services\SaleService())->create([
    'branch_id'      => (int) $branch['id'],
    'customer_id'    => (int) $customer['id'],
    'sale_type'      => 'retail',
    'payment_method' => 'cash',
    'paid_amount'    => 280000,
    'items'          => [[
        'imei'          => $voidImei,
        'selling_price' => 280000,
    ]],
]);
$voided = (new Atoms\Services\SaleService())->void((int) $voidSale['id'], 'Smoke void wrong basket');
if (($voided['status'] ?? '') !== 'voided') {
    throw new RuntimeException('Void must mark the sale voided, not edit the original totals.');
}
$afterVoid = (new Atoms\Services\ImeiService())->getByImei($voidImei);
if (($afterVoid['status'] ?? '') !== 'available') {
    throw new RuntimeException('Void must put the IMEI back in stock. Status=' . ($afterVoid['status'] ?? ''));
}

$wSale = (new Atoms\Services\SaleService())->create([
    'branch_id'      => (int) $branch['id'],
    'customer_id'    => (int) $customer['id'],
    'sale_type'      => 'retail',
    'payment_method' => 'cash',
    'paid_amount'    => 280000,
    'items'          => [[
        'imei'          => $voidImei,
        'selling_price' => 280000,
    ]],
]);
$wRet = (new Atoms\Services\ReturnService())->create([
    'sale_id'      => (int) $wSale['id'],
    'return_type'  => 'warranty',
    'resolution'   => 'repair',
    'reason'       => 'Smoke warranty screen',
    'items'        => [['imei' => $voidImei]],
]);
if (empty($wRet['repairs'][0]['ticket_number'])) {
    throw new RuntimeException('Warranty return must open a repair ticket.');
}
$wImei = (new Atoms\Services\ImeiService())->getByImei($voidImei);
if (($wImei['status'] ?? '') !== 'under_repair') {
    throw new RuntimeException('Warranty return must place the IMEI under repair. Status=' . ($wImei['status'] ?? ''));
}

$swapOut = (string) random_int(350000000000000, 359999999999999);
$swapIn  = (string) random_int(350000000000000, 359999999999999);
$swapProduct = (new Atoms\Services\ProductService())->get((int) $product['id']);
if (($swapProduct['variants'] ?? []) === []) {
    $swapProduct = (new Atoms\Services\ProductService())->addVariant((int) $product['id'], [
        'color'             => 'Black',
        'storage'           => '128GB',
        'min_selling_price' => 280000,
    ]);
}
$swapVariantId = (int) ($swapProduct['variants'][0]['id'] ?? 0);
$purchaseSwap = (new Atoms\Services\PurchaseService())->create([
    'supplier_id'    => (int) $supplier['id'],
    'branch_id'      => (int) $branch['id'],
    'invoice_number' => 'SMOKE-SWP-' . time(),
    'items'          => [[
        'product_id' => (int) $product['id'],
        'variant_id' => $swapVariantId ?: null,
        'cost_price' => 250000,
        'quantity'   => 1,
    ]],
]);
(new Atoms\Services\PurchaseService())->receive((int) $purchaseSwap['id']);
(new Atoms\Services\PurchaseService())->registerImeis((int) $purchaseSwap['id'], [[
    'imei'       => $swapOut,
    'product_id' => (int) $product['id'],
    'variant_id' => $swapVariantId ?: null,
]]);
$outMin = (int) ((int) $product['min_selling_price'] / 100);
$swap = (new Atoms\Services\SwapService())->create([
    'customer_phone'       => (string) $customer['phone'],
    'customer_name'        => (string) $customer['name'],
    'branch_id'            => (int) $branch['id'],
    'incoming_imei'        => $swapIn,
    'incoming_product_id'  => (int) $product['id'],
    'incoming_variant_id'  => $swapVariantId ?: null,
    'incoming_value'       => 120000,
    'outgoing_imei'        => $swapOut,
    'outgoing_price'       => $outMin,
    'paid_amount'          => $outMin - 120000,
    'payment_method'       => 'cash',
]);
if (!str_starts_with((string) ($swap['invoice_number'] ?? ''), 'SWP-')) {
    throw new RuntimeException('Swap must issue a ticket number.');
}
if (($swap['customer_name'] ?? '') === '' || !str_contains((string) ($swap['summary'] ?? ''), 'Customer pays')) {
    throw new RuntimeException('Swap must hydrate the customer and explain the difference. Got=' . ($swap['summary'] ?? ''));
}
$outGone = (new Atoms\Services\ImeiService())->getByImei($swapOut);
$inStock = (new Atoms\Services\ImeiService())->getByImei($swapIn);
if (($outGone['status'] ?? '') !== 'sold') {
    throw new RuntimeException('Outgoing swap IMEI must be sold. Status=' . ($outGone['status'] ?? ''));
}
if (($inStock['status'] ?? '') !== 'available') {
    throw new RuntimeException('Incoming trade-in must be in stock. Status=' . ($inStock['status'] ?? ''));
}

$impSku   = 'IMP-SMOKE-' . time();
$impImei  = (string) random_int(350000000000000, 359999999999999);
$impPhone = '080' . random_int(10000000, 99999999);
$impInv   = 'IMP-' . (string) $branch['code'] . '-' . time();
$code     = (string) $branch['code'];
$importer = new Atoms\Services\ImportService();
$prodRun = $importer->run('products', "sku,name,brand,min_selling_price,default_cost_price\n{$impSku},Imported Phone,Samsung,280000,250000\n");
if ((int) ($prodRun['created'] ?? 0) !== 1) {
    throw new RuntimeException('Product import did not create a row.');
}
$prodAgain = $importer->run('products', "sku,name,brand,min_selling_price,default_cost_price\n{$impSku},Imported Phone,Samsung,290000,250000\n");
if ((int) ($prodAgain['updated'] ?? 0) !== 1) {
    throw new RuntimeException('Re-importing the same SKU should update, not duplicate.');
}
$custRun = $importer->run('customers', "name,phone,branch_code,opening_balance\nImport Debtor,{$impPhone},{$code},50000\n");
if ((int) ($custRun['created'] ?? 0) !== 1) {
    throw new RuntimeException('Customer import failed: ' . json_encode($custRun['errors'] ?? []));
}
$importer->run('customers', "name,phone,branch_code,opening_balance\nImport Debtor,{$impPhone},{$code},50000\n");
$importedCust = (new Atoms\Services\CustomerService())->findByPhone($impPhone);
if ((int) ($importedCust['balance'] ?? 0) !== 5000000) {
    throw new RuntimeException('Opening customer balance must post once. Balance=' . ($importedCust['balance'] ?? 'none'));
}
$imeiRun = $importer->run('imeis', "imei,sku,branch_code,cost_price,status\n{$impImei},{$impSku},{$code},250000,available\n");
if ((int) ($imeiRun['created'] ?? 0) !== 1) {
    throw new RuntimeException('IMEI import failed: ' . json_encode($imeiRun['errors'] ?? []));
}
$imeiAgain = $importer->run('imeis', "imei,sku,branch_code,cost_price,status\n{$impImei},{$impSku},{$code},250000,available\n");
if ((int) ($imeiAgain['skipped'] ?? 0) !== 1) {
    throw new RuntimeException('Duplicate IMEI import must skip.');
}
$saleRun = $importer->run('sales', "invoice_number,imei,sku,branch_code,customer_phone,selling_price,paid_amount,sale_date,payment_method\n{$impInv},{$impImei},{$impSku},{$code},{$impPhone},280000,280000,2025-06-01,cash\n");
if ((int) ($saleRun['created'] ?? 0) !== 1) {
    throw new RuntimeException('Sales import failed: ' . json_encode($saleRun['errors'] ?? []));
}
$saleAgain = $importer->run('sales', "invoice_number,imei,sku,branch_code,customer_phone,selling_price,paid_amount,sale_date,payment_method\n{$impInv},{$impImei},{$impSku},{$code},{$impPhone},280000,280000,2025-06-01,cash\n");
if ((int) ($saleAgain['skipped'] ?? 0) !== 1) {
    throw new RuntimeException('Duplicate invoice import must skip.');
}
$importedSale = (new Atoms\Services\SaleService())->findByInvoice($impInv);
if (!str_starts_with((string) $importedSale['posted_at'], '2025-06-01')) {
    throw new RuntimeException('Imported sales must keep the historical date. posted_at=' . $importedSale['posted_at']);
}
$sold = (new Atoms\Services\ImeiService())->getByImei($impImei);
if ((string) $sold['status'] !== 'sold') {
    throw new RuntimeException('Imported sale must mark the IMEI sold.');
}
try {
    (new Atoms\Services\ReturnService())->create([
        'sale_id'      => (int) $importedSale['id'],
        'return_type'  => 'warranty',
        'resolution'   => 'repair',
        'reason'       => 'Cover should have ended',
        'items'        => [['imei' => $impImei]],
    ]);
    throw new RuntimeException('A sale from 2025-06-01 must not still take a 365-day warranty.');
} catch (Atoms\Domain\DomainException $e) {
    if (!str_contains($e->getMessage(), 'Warranty expired')) {
        throw $e;
    }
}

$offline = (new Atoms\Domain\OfflinePolicy())->manifest();
if (!in_array('returns', $offline['queue_posts'], true) || !in_array('sales', $offline['queue_posts'], true) || !in_array('customers', $offline['queue_posts'], true)) {
    throw new RuntimeException('Offline policy must queue sales, returns, and customers.');
}
if (!in_array('imei', $offline['cache_prefixes'], true) || !in_array('returns/locate', $offline['cache_prefixes'], true)) {
    throw new RuntimeException('Offline policy must cache IMEI and return locate lookups.');
}
$policy = new Atoms\Domain\OfflinePolicy();
if ($policy->canQueuePost('settings') || !$policy->canCacheGet('dashboard?branch_id=1') || !$policy->canQueuePost('customers/9/payments')) {
    throw new RuntimeException('Offline policy must refuse settings POSTs, cache the dashboard, and queue customer payments.');
}
$store = new Atoms\Services\IdempotencyStore();
if ($store->normalize('short') !== '' || $store->normalize('clientid12345678') === '') {
    throw new RuntimeException('Idempotency keys must be validated.');
}
$onceA = $store->once('smokeidemkey01', 'sales', static fn () => ['ok' => 1, 'n' => 1]);
$onceB = $store->once('smokeidemkey01', 'sales', static fn () => ['ok' => 1, 'n' => 2]);
if (($onceA['n'] ?? null) !== 1 || ($onceB['n'] ?? null) !== 1) {
    throw new RuntimeException('Idempotency store must return the first result on replay.');
}

$samsung = (new Atoms\Services\ProductService())->search('Samsung')[0] ?? null;
if (!$samsung) {
    throw new RuntimeException('Seeded Samsung product must exist.');
}
$samsung = (new Atoms\Services\ProductService())->get((int) $samsung['id']);
if (($samsung['variants'] ?? []) === []) {
    $samsung = (new Atoms\Services\ProductService())->addVariant((int) $samsung['id'], [
        'color'             => 'Black',
        'storage'           => '128GB',
        'min_selling_price' => 280000,
    ]);
}
if (empty($samsung['variants'][0]['color'])) {
    throw new RuntimeException('Samsung must carry a colour/storage variant.');
}
$variantMin = (int) ($samsung['variants'][0]['min_selling_price'] ?? 0);
if ($variantMin <= 0) {
    throw new RuntimeException('Variant must carry a minimum price.');
}
$labels = new Atoms\Domain\VariantLabel();
$floor = $labels->minimum($samsung, $samsung['variants'][0]);
if (!$floor->equals(new Atoms\Domain\Money($variantMin))) {
    throw new RuntimeException('POS must use the variant minimum, not only the product floor.');
}
$receipt = (new Atoms\Domain\ReceiptLayout())->document(
    [
        'invoice_number' => (string) $sale['invoice_number'],
        'posted_at'      => (string) $sale['posted_at'],
        'total'          => (int) $sale['total'],
        'paid_amount'    => (int) $sale['paid_amount'],
        'due_amount'     => 0,
        'items'          => [[
            'imei'           => $imei,
            'product_name'   => (string) $product['name'],
            'variant_label'  => $labels->format($samsung['variants'][0]),
            'selling_price'  => (int) $sale['total'],
        ]],
    ],
    (new Atoms\Domain\ShopIdentity())->of((new Atoms\Services\SettingsService())->expose()),
    $branch
);
if (($receipt['lines'][0]['variant'] ?? '') === '') {
    throw new RuntimeException('Receipt must print colour/storage when the device has a variant.');
}

$archivePolicy = new Atoms\Domain\ArchivePolicy();
if (!$archivePolicy->canArchive('products') || $archivePolicy->canArchive('sales')) {
    throw new RuntimeException('Archive policy must cover catalog rows, not posted sales.');
}

$varSku = 'SM-VAR-' . substr(md5((string) microtime(true)), 0, 8);
$varRun = $importer->run('products', "sku,name,color,storage,variant_min,min_selling_price\n{$varSku},Import Variant,Blue,256GB,275000,260000\n");
if (($varRun['created'] ?? 0) < 1) {
    throw new RuntimeException('Product import with colour/storage failed: ' . json_encode($varRun['errors'] ?? []));
}
$varProd = (new Atoms\Services\ProductService())->findBySku($varSku);
if (!$varProd || empty($varProd['variants'][0]['color'])) {
    throw new RuntimeException('Import must attach a colour/storage variant.');
}

$importedProd = (new Atoms\Services\ProductService())->findBySku($impSku);
if (!$importedProd) {
    throw new RuntimeException('Imported product must exist before archive test.');
}
$archivedProd = (new Atoms\Services\ProductService())->archive((int) $importedProd['id']);
if (!empty($archivedProd['is_active'])) {
    throw new RuntimeException('Archived product must set is_active=0.');
}
$stillProd = (new Atoms\Services\ProductService())->get((int) $importedProd['id']);
if ($stillProd['sku'] !== $impSku) {
    throw new RuntimeException('Archived product must remain in the database.');
}
if ((new Atoms\Services\ProductService())->search($impSku) !== []) {
    throw new RuntimeException('Archived product must leave active catalog search.');
}

$archPhone = '080555' . substr(md5((string) microtime(true)), 0, 5);
$archCust = (new Atoms\Services\CustomerService())->save(null, ['name' => 'Archive Test', 'phone' => $archPhone]);
$archivedCust = (new Atoms\Services\CustomerService())->archive((int) $archCust['id']);
if (!empty($archivedCust['is_active'])) {
    throw new RuntimeException('Archived customer must set is_active=0.');
}

$archSup = (new Atoms\Services\SupplierService())->save(null, ['name' => 'Archive Supplier ' . substr(md5((string) microtime(true)), 0, 6)]);
$archivedSup = (new Atoms\Services\SupplierService())->archive((int) $archSup['id']);
if (!empty($archivedSup['is_active'])) {
    throw new RuntimeException('Archived supplier must set is_active=0.');
}

$wholesale = new Atoms\Domain\WholesalePolicy();
if (!$wholesale->requiresCustomer('wholesale')) {
    throw new RuntimeException('Wholesale policy must require a named customer.');
}
$whImei = (string) random_int(350000000000000, 359999999999999);
$whImeiRun = $importer->run('imeis', "imei,sku,branch_code,cost_price,status\n{$whImei},{$varSku},{$code},250000,available\n");
if (($whImeiRun['created'] ?? 0) < 1) {
    throw new RuntimeException('Wholesale IMEI import failed: ' . json_encode($whImeiRun['errors'] ?? []));
}
try {
    (new Atoms\Services\SaleService())->create([
        'branch_id'      => (int) $branch['id'],
        'sale_type'      => 'wholesale',
        'payment_method' => 'cash',
        'paid_amount'    => 275000,
        'items'          => [['imei' => $whImei, 'selling_price' => 275000]],
    ]);
    throw new RuntimeException('Wholesale without a customer must fail.');
} catch (Atoms\Domain\DomainException $e) {
    if (!str_contains($e->getMessage(), 'customer')) {
        throw $e;
    }
}
$whSale = (new Atoms\Services\SaleService())->create([
    'branch_id'      => (int) $branch['id'],
    'customer_id'    => (int) $customer['id'],
    'sale_type'      => 'wholesale',
    'payment_method' => 'transfer',
    'paid_amount'    => 275000,
    'items'          => [['imei' => $whImei, 'selling_price' => 275000]],
]);
if (($whSale['sale_type'] ?? '') !== 'wholesale') {
    throw new RuntimeException('Wholesale sale must persist sale_type=wholesale.');
}
$whReceipt = (new Atoms\Domain\ReceiptLayout())->document(
    array_merge($whSale, ['items' => $whSale['items'] ?? []]),
    (new Atoms\Domain\ShopIdentity())->of((new Atoms\Services\SettingsService())->expose()),
    $branch
);
if (($whReceipt['sale_type'] ?? '') !== 'Wholesale') {
    throw new RuntimeException('Receipt must label wholesale invoices.');
}
$todaySales = (new Atoms\Services\ReportService())->sales(current_time('Y-m-d'), current_time('Y-m-d'), (int) $branch['id']);
if (($todaySales['by_type']['wholesale']['invoices'] ?? 0) < 1) {
    throw new RuntimeException('Reports must split wholesale invoices from retail.');
}

$lowStock = new Atoms\Domain\LowStockPolicy();
if (!$lowStock->isLow(1, 2) || $lowStock->isLow(3, 2)) {
    throw new RuntimeException('Low-stock policy must alert at or below threshold only.');
}
$restoredProd = (new Atoms\Services\ProductService())->restore((int) $importedProd['id']);
if (empty($restoredProd['is_active'])) {
    throw new RuntimeException('Restored product must return to the active catalog.');
}
$restoredCust = (new Atoms\Services\CustomerService())->restore((int) $archCust['id']);
if (empty($restoredCust['is_active'])) {
    throw new RuntimeException('Restored customer must return to pick lists.');
}
$dash = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('low_stock', $dash)) {
    throw new RuntimeException('Dashboard must expose low_stock alerts.');
}
if (!array_key_exists('overdue_invoices', $dash)) {
    throw new RuntimeException('Dashboard must expose overdue_invoices.');
}
global $wpdb;
$samsungId = (int) $samsung['id'];
$avail = (int) $wpdb->get_var($wpdb->prepare(
    'SELECT COUNT(*) FROM ' . $wpdb->prefix . 'atoms_imeis WHERE product_id = %d AND status = %s AND branch_id = %d',
    $samsungId,
    'available',
    (int) $branch['id']
));
(new Atoms\Services\ProductService())->save($samsungId, [
    'sku'                 => (string) $samsung['sku'],
    'name'                => (string) $samsung['name'],
    'low_stock_threshold' => max(1, $avail + 2),
]);
$alerts = (new Atoms\Services\ProductService())->lowStockAlerts((int) $branch['id']);
$hit = false;
foreach ($alerts as $row) {
    if ((int) ($row['product_id'] ?? 0) === $samsungId) {
        $hit = true;
        break;
    }
}
if (!$hit) {
    throw new RuntimeException('Variant-aware low-stock scan must flag Samsung at this branch.');
}

$varImei = (string) random_int(350000000000000, 359999999999999);
$varImeiRun = $importer->run(
    'imeis',
    "imei,sku,branch_code,cost_price,status,color,storage,serial_number\n{$varImei},{$varSku},{$code},250000,available,Blue,256GB,SN-VAR-IMP\n"
);
if (($varImeiRun['created'] ?? 0) < 1) {
    throw new RuntimeException('IMEI import with colour/storage failed: ' . json_encode($varImeiRun['errors'] ?? []));
}
$varRow = (new Atoms\Services\ImeiService())->getByImei($varImei);
if (empty($varRow['variant_id'])) {
    throw new RuntimeException('Imported IMEI must attach the colour/storage variant.');
}
if (($varRow['serial_number'] ?? '') !== 'SN-VAR-IMP') {
    throw new RuntimeException('IMEI import must carry serial_number.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
$hasWholesale = false;
foreach ($analytics['sale_types'] ?? [] as $row) {
    if (($row['type'] ?? '') === 'wholesale' && (int) ($row['invoices'] ?? 0) > 0) {
        $hasWholesale = true;
    }
}
if (!$hasWholesale) {
    throw new RuntimeException('Analytics must expose wholesale in sale_types.');
}

$top = (new Atoms\Services\AnalyticsService())->topProducts(14, (int) $branch['id']);
if ($top !== [] && !array_key_exists('variant_label', $top[0])) {
    throw new RuntimeException('Top products must include variant_label.');
}
(new Atoms\Services\ProductService())->archive((int) $importedProd['id']);
$searchArchived = (new Atoms\Services\SearchService())->query((string) $importedProd['sku']);
foreach ($searchArchived['products'] ?? [] as $hit) {
    if ((int) ($hit['id'] ?? 0) === (int) $importedProd['id']) {
        throw new RuntimeException('Global search must not surface archived products.');
    }
}
$saleImei = (string) random_int(350000000000000, 359999999999999);
$saleInv = 'IMP-SALE-' . substr(md5((string) microtime(true)), 0, 8);
$saleHist = $importer->run(
    'sales',
    "invoice_number,imei,sku,branch_code,customer_phone,selling_price,paid_amount,sale_date,payment_method,color,storage\n{$saleInv},{$saleImei},{$varSku},{$code},{$customer['phone']},275000,275000,2025-07-01,cash,Blue,256GB\n"
);
if (($saleHist['created'] ?? 0) < 1) {
    throw new RuntimeException('Sales import with colour/storage failed: ' . json_encode($saleHist['errors'] ?? []));
}
$saleImeiRow = (new Atoms\Services\ImeiService())->getByImei($saleImei);
if (($saleImeiRow['status'] ?? '') !== 'sold' || empty($saleImeiRow['variant_id'])) {
    throw new RuntimeException('Sales import must create variant stock then sell it.');
}

$branches = (new Atoms\Services\BranchService())->all();
$toBranch = $branches[1] ?? (new Atoms\Services\BranchService())->save(null, [
    'name' => 'Smoke Transfer Hub',
    'code' => 'SMK2',
    'address' => 'Bodija, Ibadan',
]);
$xferImei = (string) random_int(350000000000000, 359999999999999);
$xferRun = $importer->run(
    'imeis',
    "imei,sku,branch_code,cost_price,status,color,storage,serial_number\n{$xferImei},{$varSku},{$code},250000,available,Blue,256GB,SN-XFER\n"
);
if (($xferRun['created'] ?? 0) < 1) {
    throw new RuntimeException('Transfer IMEI import failed: ' . json_encode($xferRun['errors'] ?? []));
}
$transfer = (new Atoms\Services\TransferService())->request([
    'from_branch_id' => (int) $branch['id'],
    'to_branch_id'   => (int) $toBranch['id'],
    'imeis'          => [$xferImei],
    'notes'          => 'Smoke variant transfer',
]);
$item = $transfer['items'][0] ?? [];
if (($item['variant_label'] ?? '') === '' || ($item['serial_number'] ?? '') !== 'SN-XFER') {
    throw new RuntimeException('Transfer items must expose variant_label and serial.');
}
$listed = (new Atoms\Services\TransferService())->list();
$hitXfer = null;
foreach ($listed as $row) {
    if ((int) ($row['id'] ?? 0) === (int) $transfer['id']) {
        $hitXfer = $row;
        break;
    }
}
if (!$hitXfer || (int) ($hitXfer['device_count'] ?? 0) !== 1) {
    throw new RuntimeException('Transfer list must include device_count.');
}
(new Atoms\Services\TransferService())->approve((int) $transfer['id']);
(new Atoms\Services\TransferService())->dispatch((int) $transfer['id']);
$transit = (new Atoms\Services\TransferService())->transitLines((int) $branch['id']);
if ($transit === [] || !array_key_exists('device_summary', $transit[0])) {
    throw new RuntimeException('Transit lines must expose device_summary for dispatched transfers.');
}

$invCsv = $reports->export('inventory', $today, $today, (int) $branch['id']);
if (!str_contains((string) $invCsv['csv'], 'Variant')) {
    throw new RuntimeException('Inventory CSV must include a Variant column.');
}
$imeiCsv = $reports->export('imei', $today, $today, (int) $branch['id']);
if (!str_contains((string) $imeiCsv['csv'], 'Variant') || !str_contains((string) $imeiCsv['csv'], 'Serial')) {
    throw new RuntimeException('IMEI CSV must include Variant and Serial columns.');
}

$edited = (new Atoms\Services\ProductService())->save((int) $samsung['id'], [
    'sku'                 => (string) $samsung['sku'],
    'name'                => (string) $samsung['name'],
    'brand'               => (string) ($samsung['brand'] ?? ''),
    'min_selling_price'   => ((int) ($samsung['min_selling_price'] ?? 0)) / 100,
    'low_stock_threshold' => 5,
    'default_cost_price'  => ((int) ($samsung['default_cost_price'] ?? 0)) / 100,
    'warranty_days'       => 180,
]);
if ((int) ($edited['low_stock_threshold'] ?? 0) !== 5 || (int) ($edited['warranty_days'] ?? 0) !== 180) {
    throw new RuntimeException('Product edit must persist threshold and warranty.');
}

$countLines = (new Atoms\Services\StockCountService())->open(['branch_id' => (int) $branch['id']]);
$sampleLine = $countLines['lines'][0] ?? null;
if (!$sampleLine || !array_key_exists('variant_label', $sampleLine)) {
    throw new RuntimeException('Stock count lines must include variant_label.');
}
(new Atoms\Services\StockCountService())->cancel((int) $countLines['id']);

$repairRows = (new Atoms\Services\RepairService())->list((int) $branch['id']);
if ($repairRows !== [] && !array_key_exists('variant_label', $repairRows[0])) {
    throw new RuntimeException('Repair list must include variant_label.');
}
$editedCust = (new Atoms\Services\CustomerService())->save((int) $customer['id'], [
    'name'      => (string) $customer['name'],
    'phone'     => (string) $customer['phone'],
    'address'   => 'Bodija Market, Ibadan',
    'branch_id' => (int) $branch['id'],
]);
if (($editedCust['address'] ?? '') !== 'Bodija Market, Ibadan') {
    throw new RuntimeException('Customer edit must persist address.');
}
$editedSup = (new Atoms\Services\SupplierService())->save((int) $supplier['id'], [
    'name'           => (string) $supplier['name'],
    'contact_person' => 'Updated Smoke Buyer',
    'phone'          => (string) ($supplier['phone'] ?? ''),
    'address'        => (string) ($supplier['address'] ?? ''),
]);
if (($editedSup['contact_person'] ?? '') !== 'Updated Smoke Buyer') {
    throw new RuntimeException('Supplier edit must persist contact person.');
}

$swapRows = (new Atoms\Services\SwapService())->list((int) $branch['id']);
if ($swapRows !== [] && !array_key_exists('outgoing_variant_label', $swapRows[0])) {
    throw new RuntimeException('Swap list must include outgoing_variant_label.');
}
if ($swapRows !== [] && !array_key_exists('device_summary', $swapRows[0])) {
    throw new RuntimeException('Swap list must include device_summary.');
}
$recentSwaps = (new Atoms\Services\SwapService())->recentLines((int) $branch['id']);
if ($recentSwaps === [] || !array_key_exists('device_summary', $recentSwaps[0])) {
    throw new RuntimeException('Recent swap lines must expose device_summary after swaps are posted.');
}
$returnImei2 = (string) random_int(350000000000000, 359999999999999);
$purchaseRet = (new Atoms\Services\PurchaseService())->create([
    'supplier_id'    => (int) $supplier['id'],
    'branch_id'      => (int) $branch['id'],
    'invoice_number' => 'SMOKE-RET-VAR-' . time(),
    'items'          => [[
        'product_id' => (int) $samsung['id'],
        'variant_id' => (int) $samsung['variants'][0]['id'],
        'cost_price' => 250000,
        'quantity'   => 1,
    ]],
]);
(new Atoms\Services\PurchaseService())->receive((int) $purchaseRet['id']);
(new Atoms\Services\PurchaseService())->registerImeis((int) $purchaseRet['id'], [[
    'imei'       => $returnImei2,
    'product_id' => (int) $samsung['id'],
    'variant_id' => (int) $samsung['variants'][0]['id'],
]]);
$retSale = (new Atoms\Services\SaleService())->create([
    'branch_id'      => (int) $branch['id'],
    'customer_id'    => (int) $customer['id'],
    'sale_type'      => 'retail',
    'payment_method' => 'cash',
    'paid_amount'    => 280000,
    'items'          => [[
        'imei'          => $returnImei2,
        'selling_price' => 280000,
    ]],
]);
$locatedRet = (new Atoms\Services\ReturnService())->locate($returnImei2);
if (($locatedRet['variant_label'] ?? '') === '') {
    throw new RuntimeException('Return locate must expose variant_label.');
}
$variantRet = (new Atoms\Services\ReturnService())->create([
    'sale_id'      => (int) $retSale['id'],
    'return_type'  => 'warranty',
    'resolution'   => 'repair',
    'reason'       => 'Smoke variant return detail',
    'items'        => [['imei' => $returnImei2]],
]);
$poDetail = (new Atoms\Services\PurchaseService())->get((int) $purchaseRet['id']);
if (($poDetail['items'][0]['variant_label'] ?? '') === '') {
    throw new RuntimeException('Purchase detail must expose variant_label on lines.');
}

$deviceLines = (new Atoms\Services\ReportService())->saleDeviceLines($today, $today, (int) $branch['id']);
if ($deviceLines !== [] && !array_key_exists('variant_label', $deviceLines[0])) {
    throw new RuntimeException('Sales device lines must include variant_label.');
}
$salesCsv = $reports->export('sales', $today, $today, (int) $branch['id']);
if (!str_contains((string) $salesCsv['csv'], 'Variant') || !str_contains((string) $salesCsv['csv'], 'IMEI')) {
    throw new RuntimeException('Sales CSV must include IMEI and Variant columns.');
}
$updatedVariant = (new Atoms\Services\ProductService())->addVariant((int) $samsung['id'], [
    'id'                => (int) $samsung['variants'][0]['id'],
    'color'             => (string) ($samsung['variants'][0]['color'] ?? 'Black'),
    'storage'           => (string) ($samsung['variants'][0]['storage'] ?? '128GB'),
    'min_selling_price' => 285000,
]);
if ((int) ($updatedVariant['variants'][0]['min_selling_price'] ?? 0) !== 28500000) {
    throw new RuntimeException('Variant edit must persist min price.');
}
$brief = new Atoms\Domain\ApprovalBrief();
$stockBrief = $brief->summary('stock_adjustment', [
    'reason'  => 'Smoke gap',
    'summary' => ['missing' => 1, 'unknown' => 0, 'wrong_branch' => 0, 'unexpected_status' => 0],
    'missing_lines' => [[
        'product_name'  => 'Samsung',
        'variant_label' => 'Black 128GB',
        'imei'          => '350000000000001',
    ]],
]);
if (!str_contains($stockBrief, 'Black 128GB')) {
    throw new RuntimeException('Stock approval brief must name missing variants.');
}

$returnRows = (new Atoms\Services\ReturnService())->list((int) $branch['id']);
if ($returnRows !== [] && !array_key_exists('variant_label', $returnRows[0])) {
    throw new RuntimeException('Return list must include variant_label.');
}
$swapDetail = (new Atoms\Services\SwapService())->get((int) $swap['id']);
if (($swapDetail['incoming']['variant_label'] ?? '') === '' || ($swapDetail['outgoing']['variant_label'] ?? '') === '') {
    throw new RuntimeException('Swap detail must expose variant labels on both devices.');
}
$colorSearch = (new Atoms\Services\SearchService())->query('128GB');
$foundColor = false;
foreach ($colorSearch['products'] ?? [] as $hit) {
    if (!empty($hit['variant_summary']) && str_contains((string) $hit['variant_summary'], '128GB')) {
        $foundColor = true;
        break;
    }
}
if (!$foundColor) {
    throw new RuntimeException('Product search must match colour/storage and expose variant_summary.');
}

$repairDetail = (new Atoms\Services\RepairService())->get((int) $variantRet['repairs'][0]['id']);
if (($repairDetail['variant_label'] ?? '') === '' || empty($repairDetail['imei']['imei'])) {
    throw new RuntimeException('Repair detail must expose variant_label and hydrated IMEI.');
}
$returnDetail = (new Atoms\Services\ReturnService())->get((int) $variantRet['id']);
if (($returnDetail['invoice_number'] ?? '') === '' || ($returnDetail['items'][0]['variant_label'] ?? '') === '') {
    throw new RuntimeException('Return detail must expose invoice and variant on items.');
}
$movement = (new Atoms\Services\ReportService())->movement(date('Y-m-d'), date('Y-m-d'), (int) $branch['id']);
if ($movement['events'] !== [] && ($movement['by_variant'] ?? []) === []) {
    throw new RuntimeException('Movement report must include by_variant breakdown when events exist.');
}
if (($movement['by_variant'][0]['product_name'] ?? '') === '') {
    throw new RuntimeException('Movement by_variant rows must name the product.');
}

$deviceLines = (new Atoms\Services\ReportService())->saleDeviceLines(date('Y-m-d'), date('Y-m-d'), (int) $branch['id']);
if ($deviceLines !== [] && !array_key_exists('salesperson_name', $deviceLines[0])) {
    throw new RuntimeException('Sales device lines must include salesperson_name.');
}
$staffDevices = (new Atoms\Services\AnalyticsService())->staffDeviceLines(14, (int) $branch['id']);
if ($staffDevices !== [] && !array_key_exists('variant_label', $staffDevices[0])) {
    throw new RuntimeException('Analytics staff devices must include variant_label.');
}
$staffDevicesCsv = $reports->export('staff_devices', $today, $today, (int) $branch['id']);
if (!str_contains((string) $staffDevicesCsv['csv'], 'Variant') || !str_contains((string) $staffDevicesCsv['csv'], 'Staff')) {
    throw new RuntimeException('Staff devices CSV must include Staff and Variant columns.');
}
$saleAudit = (new Atoms\Services\AuditLogger())->search(['q' => (string) $sale['invoice_number'], 'action' => 'sale.created']);
if (($saleAudit['items'][0]['summary'] ?? '') === '' || !str_contains((string) ($saleAudit['items'][0]['summary'] ?? ''), (string) $sale['invoice_number'])) {
    throw new RuntimeException('Sale audit summary must name the invoice.');
}

$countRows = (new Atoms\Services\StockCountService())->list((int) $branch['id']);
if ($countRows === []) {
    throw new RuntimeException('Stock count list must include history rows.');
}
$countDetail = (new Atoms\Services\StockCountService())->get((int) $countRows[0]['id']);
if (($countDetail['lines'] ?? []) === [] || !array_key_exists('variant_label', $countDetail['lines'][0])) {
    throw new RuntimeException('Stock count detail must expose lines with variant_label.');
}
$aging = (new Atoms\Services\AnalyticsService())->receivableAging();
if (($aging['lines'] ?? []) !== [] && !array_key_exists('device_summary', $aging['lines'][0])) {
    throw new RuntimeException('Receivable aging must expose device_summary on open invoices.');
}
$supplierDetail = (new Atoms\Services\SupplierService())->get((int) $supplier['id']);
if (!array_key_exists('returns', $supplierDetail)) {
    throw new RuntimeException('Supplier detail must include returns history.');
}
if ($supplierDetail['returns'] !== [] && !array_key_exists('variant_label', $supplierDetail['returns'][0])) {
    throw new RuntimeException('Supplier returns must include variant_label.');
}
$expenseRows = (new Atoms\Services\ExpenseService())->list((int) $branch['id']);
if ($expenseRows !== [] && !array_key_exists('branch_name', $expenseRows[0])) {
    throw new RuntimeException('Expense list must include branch_name.');
}

$auditSale = (new Atoms\Services\AuditLogger())->search(['q' => (string) $sale['invoice_number'], 'action' => 'sale.created']);
if (($auditSale['items'][0]['link']['screen'] ?? '') !== 'invoice') {
    throw new RuntimeException('Sale audit row must expose an invoice deep link.');
}
$dash = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('overdue_lines', $dash)) {
    throw new RuntimeException('Dashboard must expose overdue_lines.');
}
$inbox = (new Atoms\Services\NotifyService())->inbox(1);
if (($inbox['items'] ?? []) !== [] && !array_key_exists('link', $inbox['items'][0])) {
    throw new RuntimeException('Notifications must expose deep links when reference is set.');
}
$recvInvCsv = $reports->export('receivable_invoices', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recvInvCsv['csv'], 'Devices') || !str_contains((string) $recvInvCsv['csv'], 'Invoice')) {
    throw new RuntimeException('Receivable invoices CSV must include Devices and Invoice columns.');
}
$custLedger = (new Atoms\Services\CustomerService())->get((int) $customer['id']);
$saleCtx = null;
foreach ($custLedger['ledger'] ?? [] as $entry) {
    if (($entry['reference_type'] ?? '') === 'sale') {
        $saleCtx = $entry['context'] ?? null;
        break;
    }
}
if (!$saleCtx || ($saleCtx['invoice_number'] ?? '') === '') {
    throw new RuntimeException('Customer ledger must expose sale invoice context.');
}
$dashPayable = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('payable_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose payable_lines.');
}
if (!array_key_exists('transit_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose transit_lines.');
}
if (!array_key_exists('repair_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose repair_lines.');
}
if (!array_key_exists('stuck_transfer_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose stuck_transfer_lines.');
}
if (!array_key_exists('approval_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose approval_lines.');
}
if (!array_key_exists('faulty_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose faulty_lines.');
}
if (!array_key_exists('stock_count_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose stock_count_lines.');
}
$stuckXfer = (new Atoms\Services\TransferService())->stuckLines((int) $branch['id'], 0);
if ($stuckXfer === [] || !array_key_exists('device_summary', $stuckXfer[0])) {
    throw new RuntimeException('Stuck transfer lines must expose device_summary when transfers are open.');
}
$openRepairsCsv = $reports->export('open_repairs', $today, $today, (int) $branch['id']);
if (!str_contains((string) $openRepairsCsv['csv'], 'Device') || !str_contains((string) $openRepairsCsv['csv'], 'Ticket')) {
    throw new RuntimeException('Open repairs CSV must include Device and Ticket columns.');
}
$faultyCsv = $reports->export('faulty_devices', $today, $today, (int) $branch['id']);
if (!str_contains((string) $faultyCsv['csv'], 'Device') || !str_contains((string) $faultyCsv['csv'], 'IMEI')) {
    throw new RuntimeException('Faulty devices CSV must include Device and IMEI columns.');
}
$countCsv = $reports->export('open_stock_counts', $today, $today, (int) $branch['id']);
if (!str_contains((string) $countCsv['csv'], 'Missing') || !str_contains((string) $countCsv['csv'], 'Count')) {
    throw new RuntimeException('Open stock counts CSV must include Count and Missing columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('payable_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payable_lines.');
}
if (!array_key_exists('repair_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose repair_lines.');
}
if (!array_key_exists('faulty_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose faulty_lines.');
}
if (!array_key_exists('stock_count_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose stock_count_lines.');
}
if (!array_key_exists('stuck_transfer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose stuck_transfer_lines.');
}
$expenseRows = (new Atoms\Services\ExpenseService())->list((int) $branch['id']);
if ($expenseRows !== []) {
    $expDetail = (new Atoms\Services\ExpenseService())->get((int) $expenseRows[0]['id']);
    if (!array_key_exists('branch_name', $expDetail)) {
        throw new RuntimeException('Expense detail must include branch_name.');
    }
}
$custPayments = (new Atoms\Services\PaymentService())->forCustomer((int) $customer['id']);
if ($custPayments === [] || ($custPayments[0]['invoice_number'] ?? '') === '') {
    throw new RuntimeException('Customer payments must link to invoice numbers when allocated.');
}

$recentReturns = (new Atoms\Services\ReturnService())->recentLines((int) $branch['id']);
if ($recentReturns === [] || !array_key_exists('device_summary', $recentReturns[0])) {
    throw new RuntimeException('Recent return lines must expose device_summary after returns are posted.');
}
$whDueImei = (string) random_int(350000000000000, 359999999999999);
$whDueRun = $importer->run('imeis', "imei,sku,branch_code,cost_price,status\n{$whDueImei},{$varSku},{$code},250000,available\n");
if (($whDueRun['created'] ?? 0) < 1) {
    throw new RuntimeException('Wholesale due IMEI import failed.');
}
(new Atoms\Services\SaleService())->create([
    'branch_id'      => (int) $branch['id'],
    'customer_id'    => (int) $customer['id'],
    'sale_type'      => 'wholesale',
    'payment_method' => 'transfer',
    'paid_amount'    => 50000,
    'items'          => [['imei' => $whDueImei, 'selling_price' => 275000]],
]);
$whRecv = (new Atoms\Services\AnalyticsService())->wholesaleReceivableLines((int) $branch['id']);
if ($whRecv === [] || !array_key_exists('device_summary', $whRecv[0])) {
    throw new RuntimeException('Wholesale receivable lines must expose device_summary when wholesale invoices are due.');
}
$acctId = wp_insert_user([
    'user_login' => 'smoke_acct_' . time(),
    'user_pass'  => wp_generate_password(12, true),
    'role'       => 'atoms_accountant',
]);
if (is_wp_error($acctId)) {
    throw new RuntimeException('Could not create accountant user for pending expense smoke.');
}
wp_set_current_user((int) $acctId);
$pendingExp = (new Atoms\Services\ExpenseService())->submit([
    'branch_id'   => (int) $branch['id'],
    'category'    => 'rent',
    'amount'      => 75000,
    'description' => 'Smoke pending expense',
    'vendor'      => 'Landlord',
]);
wp_set_current_user(1);
if (($pendingExp['status'] ?? '') !== 'pending_approval') {
    throw new RuntimeException('Large expense without approve cap must wait for approval.');
}
$expPending = (new Atoms\Services\ExpenseService())->pendingLines((int) $branch['id']);
if ($expPending === [] || !array_key_exists('days', $expPending[0])) {
    throw new RuntimeException('Pending expense lines must expose days while waiting for approval.');
}
$dashPayable = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('return_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose return_lines.');
}
if (!array_key_exists('expense_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose expense_lines.');
}
if (!array_key_exists('wholesale_receivable_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose wholesale_receivable_lines.');
}
if (!array_key_exists('stuck_faulty_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose stuck_faulty_lines.');
}
$returnsCsv = $reports->export('recent_returns', $today, $today, (int) $branch['id']);
if (!str_contains((string) $returnsCsv['csv'], 'Device') || !str_contains((string) $returnsCsv['csv'], 'Invoice')) {
    throw new RuntimeException('Recent returns CSV must include Device and Invoice columns.');
}
$pendingExpCsv = $reports->export('pending_expenses', $today, $today, (int) $branch['id']);
if (!str_contains((string) $pendingExpCsv['csv'], 'Category') || !str_contains((string) $pendingExpCsv['csv'], 'Expense')) {
    throw new RuntimeException('Pending expenses CSV must include Expense and Category columns.');
}
$whRecvCsv = $reports->export('wholesale_receivables', $today, $today, (int) $branch['id']);
if (!str_contains((string) $whRecvCsv['csv'], 'Customer') || !str_contains((string) $whRecvCsv['csv'], 'Due')) {
    throw new RuntimeException('Wholesale receivables CSV must include Customer and Due columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('return_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose return_lines.');
}
if (!array_key_exists('expense_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose expense_lines.');
}
if (!array_key_exists('wholesale_receivable_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose wholesale_receivable_lines.');
}
if (!array_key_exists('swap_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose swap_lines.');
}
if (!array_key_exists('stuck_repair_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose stuck_repair_lines.');
}
$dashFinal = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('swap_lines', $dashFinal)) {
    throw new RuntimeException('Dashboard must expose swap_lines.');
}
if (!array_key_exists('slow_lines', $dashFinal)) {
    throw new RuntimeException('Dashboard must expose slow_lines.');
}
$swapCsv = $reports->export('recent_swaps', $today, $today, (int) $branch['id']);
if (!str_contains((string) $swapCsv['csv'], 'Devices') || !str_contains((string) $swapCsv['csv'], 'Swap')) {
    throw new RuntimeException('Recent swaps CSV must include Swap and Devices columns.');
}
$slowCsv = $reports->export('slow_movers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $slowCsv['csv'], 'Product') || !str_contains((string) $slowCsv['csv'], 'Oldest')) {
    throw new RuntimeException('Slow movers CSV must include Product and Oldest columns.');
}
$retDueImei = (string) random_int(350000000000000, 359999999999999);
$retDueRun = $importer->run('imeis', "imei,sku,branch_code,cost_price,status\n{$retDueImei},{$varSku},{$code},250000,available\n");
if (($retDueRun['created'] ?? 0) < 1) {
    throw new RuntimeException('Retail due IMEI import failed.');
}
(new Atoms\Services\SaleService())->create([
    'branch_id'      => (int) $branch['id'],
    'customer_id'    => (int) $customer['id'],
    'sale_type'      => 'retail',
    'payment_method' => 'cash',
    'paid_amount'    => 80000,
    'items'          => [['imei' => $retDueImei, 'selling_price' => 280000]],
]);
$retRecv = (new Atoms\Services\AnalyticsService())->retailReceivableLines((int) $branch['id']);
if ($retRecv === [] || !array_key_exists('device_summary', $retRecv[0])) {
    throw new RuntimeException('Retail receivable lines must expose device_summary when retail invoices are due.');
}
$recentSales = (new Atoms\Services\SaleService())->recentLines((int) $branch['id']);
if ($recentSales === [] || !array_key_exists('device_summary', $recentSales[0])) {
    throw new RuntimeException('Recent sale lines must expose device_summary after sales are posted.');
}
$alerts = (new Atoms\Services\NotifyService())->alertLines((int) $branch['id']);
if ($alerts === [] || !array_key_exists('title', $alerts[0])) {
    throw new RuntimeException('Alert lines must expose recent notifications for the branch.');
}
$dashFinal = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('sale_lines', $dashFinal)) {
    throw new RuntimeException('Dashboard must expose sale_lines.');
}
if (!array_key_exists('retail_receivable_lines', $dashFinal)) {
    throw new RuntimeException('Dashboard must expose retail_receivable_lines.');
}
if (!array_key_exists('notify_lines', $dashFinal)) {
    throw new RuntimeException('Dashboard must expose notify_lines.');
}
if (!array_key_exists('notify_unread', $dashFinal)) {
    throw new RuntimeException('Dashboard must expose notify_unread.');
}
$retCsv = $reports->export('retail_receivables', $today, $today, (int) $branch['id']);
if (!str_contains((string) $retCsv['csv'], 'Customer') || !str_contains((string) $retCsv['csv'], 'Due')) {
    throw new RuntimeException('Retail receivables CSV must include Customer and Due columns.');
}
$salesRecentCsv = $reports->export('recent_sales', $today, $today, (int) $branch['id']);
if (!str_contains((string) $salesRecentCsv['csv'], 'Invoice') || !str_contains((string) $salesRecentCsv['csv'], 'Devices')) {
    throw new RuntimeException('Recent sales CSV must include Invoice and Devices columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('transit_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose transit_lines.');
}
if (!array_key_exists('retail_receivable_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose retail_receivable_lines.');
}
if (!array_key_exists('sale_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose sale_lines.');
}
if (!array_key_exists('stuck_faulty_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose stuck_faulty_lines.');
}
$payLines = (new Atoms\Services\PaymentService())->recentLines((int) $branch['id']);
if ($payLines === [] || ($payLines[0]['invoice_number'] ?? '') === '') {
    throw new RuntimeException('Recent payment lines must link to invoice numbers when allocated.');
}
$supPayLines = (new Atoms\Services\SupplierService())->recentPaymentLines((int) $branch['id']);
if ($supPayLines === [] || ($supPayLines[0]['supplier_name'] ?? '') === '') {
    throw new RuntimeException('Recent supplier payment lines must include supplier_name after payouts.');
}
$dashPay = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('payment_lines', $dashPay)) {
    throw new RuntimeException('Dashboard must expose payment_lines.');
}
if (!array_key_exists('supplier_payment_lines', $dashPay)) {
    throw new RuntimeException('Dashboard must expose supplier_payment_lines.');
}
$payCsv = $reports->export('recent_payments', $today, $today, (int) $branch['id']);
if (!str_contains((string) $payCsv['csv'], 'Customer') || !str_contains((string) $payCsv['csv'], 'Amount')) {
    throw new RuntimeException('Recent payments CSV must include Customer and Amount columns.');
}
$supPayCsv = $reports->export('supplier_payments', $today, $today, (int) $branch['id']);
if (!str_contains((string) $supPayCsv['csv'], 'Supplier') || !str_contains((string) $supPayCsv['csv'], 'Amount')) {
    throw new RuntimeException('Supplier payments CSV must include Supplier and Amount columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payment_lines.');
}
if (!array_key_exists('supplier_payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose supplier_payment_lines.');
}
if (!array_key_exists('overdue_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose overdue_lines.');
}
if (!array_key_exists('notify_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose notify_lines.');
}
$purchaseLines = (new Atoms\Services\PurchaseService())->recentLines((int) $branch['id']);
if ($purchaseLines === [] || ($purchaseLines[0]['supplier_name'] ?? '') === '') {
    throw new RuntimeException('Recent purchase lines must include supplier_name after intake.');
}
$returnLines = (new Atoms\Services\SupplierService())->recentReturnLines((int) $branch['id']);
if ($returnLines === [] || ($returnLines[0]['imei'] ?? '') === '') {
    throw new RuntimeException('Recent supplier return lines must include IMEI after returns.');
}
$dashPurch = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('purchase_lines', $dashPurch)) {
    throw new RuntimeException('Dashboard must expose purchase_lines.');
}
if (!array_key_exists('open_purchase_lines', $dashPurch)) {
    throw new RuntimeException('Dashboard must expose open_purchase_lines.');
}
if (!array_key_exists('supplier_return_lines', $dashPurch)) {
    throw new RuntimeException('Dashboard must expose supplier_return_lines.');
}
$purchCsv = $reports->export('recent_purchases', $today, $today, (int) $branch['id']);
if (!str_contains((string) $purchCsv['csv'], 'Supplier') || !str_contains((string) $purchCsv['csv'], 'Total')) {
    throw new RuntimeException('Recent purchases CSV must include Supplier and Total columns.');
}
$supRetCsv = $reports->export('supplier_returns', $today, $today, (int) $branch['id']);
if (!str_contains((string) $supRetCsv['csv'], 'Supplier') || !str_contains((string) $supRetCsv['csv'], 'Credit')) {
    throw new RuntimeException('Supplier returns CSV must include Supplier and Credit columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('purchase_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose purchase_lines.');
}
if (!array_key_exists('open_purchase_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose open_purchase_lines.');
}
if (!array_key_exists('supplier_return_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose supplier_return_lines.');
}
$reversalLines = (new Atoms\Services\PaymentService())->reversalLines((int) $branch['id']);
if ($reversalLines === [] || ($reversalLines[0]['notes'] ?? '') === '') {
    throw new RuntimeException('Payment reversal lines must include the reversal reason.');
}
$voidedLines = (new Atoms\Services\SaleService())->voidedLines((int) $branch['id']);
if ($voidedLines === [] || ($voidedLines[0]['void_reason'] ?? '') === '') {
    throw new RuntimeException('Voided sale lines must include void_reason after voids.');
}
$postedExpenses = (new Atoms\Services\ExpenseService())->recentLines((int) $branch['id']);
if ($postedExpenses === [] || ($postedExpenses[0]['category'] ?? '') === '') {
    throw new RuntimeException('Recent expense lines must include category after posting.');
}
$dashCorr = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('reversal_lines', $dashCorr)) {
    throw new RuntimeException('Dashboard must expose reversal_lines.');
}
if (!array_key_exists('voided_lines', $dashCorr)) {
    throw new RuntimeException('Dashboard must expose voided_lines.');
}
if (!array_key_exists('posted_expense_lines', $dashCorr)) {
    throw new RuntimeException('Dashboard must expose posted_expense_lines.');
}
$revCsv = $reports->export('payment_reversals', $today, $today, (int) $branch['id']);
if (!str_contains((string) $revCsv['csv'], 'Customer') || !str_contains((string) $revCsv['csv'], 'Reason')) {
    throw new RuntimeException('Payment reversals CSV must include Customer and Reason columns.');
}
$voidCsv = $reports->export('voided_sales', $today, $today, (int) $branch['id']);
if (!str_contains((string) $voidCsv['csv'], 'Invoice') || !str_contains((string) $voidCsv['csv'], 'Reason')) {
    throw new RuntimeException('Voided sales CSV must include Invoice and Reason columns.');
}
$expCsv = $reports->export('recent_expenses', $today, $today, (int) $branch['id']);
if (!str_contains((string) $expCsv['csv'], 'Category') || !str_contains((string) $expCsv['csv'], 'Amount')) {
    throw new RuntimeException('Recent expenses CSV must include Category and Amount columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('reversal_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose reversal_lines.');
}
if (!array_key_exists('voided_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose voided_lines.');
}
if (!array_key_exists('posted_expense_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose posted_expense_lines.');
}
$auditLines = (new Atoms\Services\AuditLogger())->recentLines((int) $branch['id']);
if ($auditLines === [] || ($auditLines[0]['action_label'] ?? '') === '') {
    throw new RuntimeException('Recent audit lines must include action_label after activity.');
}
$xferLines = (new Atoms\Services\TransferService())->recentLines((int) $branch['id']);
if ($xferLines === [] || ($xferLines[0]['device_summary'] ?? '') === '') {
    throw new RuntimeException('Recent transfer lines must include device_summary after transfers.');
}
$postedCounts = (new Atoms\Services\StockCountService())->recentLines((int) $branch['id']);
if ($postedCounts === [] || !array_key_exists('posted_at', $postedCounts[0])) {
    throw new RuntimeException('Recent stock count lines must include posted_at after counts.');
}
$dashOps = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('audit_lines', $dashOps)) {
    throw new RuntimeException('Dashboard must expose audit_lines.');
}
if (!array_key_exists('recent_transfer_lines', $dashOps)) {
    throw new RuntimeException('Dashboard must expose recent_transfer_lines.');
}
if (!array_key_exists('posted_stock_count_lines', $dashOps)) {
    throw new RuntimeException('Dashboard must expose posted_stock_count_lines.');
}
$auditCsv = $reports->export('recent_audit', $today, $today, (int) $branch['id']);
if (!str_contains((string) $auditCsv['csv'], 'Action') || !str_contains((string) $auditCsv['csv'], 'Summary')) {
    throw new RuntimeException('Recent audit CSV must include Action and Summary columns.');
}
$xferCsv = $reports->export('recent_transfers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $xferCsv['csv'], 'From') || !str_contains((string) $xferCsv['csv'], 'Devices')) {
    throw new RuntimeException('Recent transfers CSV must include From and Devices columns.');
}
$countRecentCsv = $reports->export('recent_stock_counts', $today, $today, (int) $branch['id']);
if (!str_contains((string) $countRecentCsv['csv'], 'Branch') || !str_contains((string) $countRecentCsv['csv'], 'Missing')) {
    throw new RuntimeException('Recent stock counts CSV must include Branch and Missing columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('audit_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose audit_lines.');
}
if (!array_key_exists('recent_transfer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose recent_transfer_lines.');
}
if (!array_key_exists('posted_stock_count_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose posted_stock_count_lines.');
}
$repairRecent = (new Atoms\Services\RepairService())->recentLines((int) $branch['id']);
if ($repairRecent === [] || ($repairRecent[0]['device_summary'] ?? '') === '') {
    throw new RuntimeException('Recent repair lines must include device_summary after completion.');
}
$approvalRecent = (new Atoms\Services\ApprovalService())->recentLines((int) $branch['id']);
if ($approvalRecent === [] || ($approvalRecent[0]['type_label'] ?? '') === '') {
    throw new RuntimeException('Recent approval lines must include type_label after decisions.');
}
$customerRecent = (new Atoms\Services\CustomerService())->recentLines((int) $branch['id']);
if ($customerRecent === [] || ($customerRecent[0]['phone'] ?? '') === '') {
    throw new RuntimeException('Recent customer lines must include phone after sign-up.');
}
$dashAfter = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('completed_repair_lines', $dashAfter)) {
    throw new RuntimeException('Dashboard must expose completed_repair_lines.');
}
if (!array_key_exists('recent_approval_lines', $dashAfter)) {
    throw new RuntimeException('Dashboard must expose recent_approval_lines.');
}
if (!array_key_exists('recent_customer_lines', $dashAfter)) {
    throw new RuntimeException('Dashboard must expose recent_customer_lines.');
}
$repairCsv = $reports->export('recent_repairs', $today, $today, (int) $branch['id']);
if (!str_contains((string) $repairCsv['csv'], 'Ticket') || !str_contains((string) $repairCsv['csv'], 'Device')) {
    throw new RuntimeException('Recent repairs CSV must include Ticket and Device columns.');
}
$apprCsv = $reports->export('recent_approvals', $today, $today, (int) $branch['id']);
if (!str_contains((string) $apprCsv['csv'], 'Decision') || !str_contains((string) $apprCsv['csv'], 'Reviewer')) {
    throw new RuntimeException('Recent approvals CSV must include Decision and Reviewer columns.');
}
$custCsv = $reports->export('recent_customers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $custCsv['csv'], 'Customer') || !str_contains((string) $custCsv['csv'], 'Balance')) {
    throw new RuntimeException('Recent customers CSV must include Customer and Balance columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('completed_repair_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose completed_repair_lines.');
}
if (!array_key_exists('recent_approval_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose recent_approval_lines.');
}
if (!array_key_exists('recent_customer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose recent_customer_lines.');
}
$imeiRecent = (new Atoms\Services\ImeiService())->recentLines((int) $branch['id']);
if ($imeiRecent === [] || ($imeiRecent[0]['device_summary'] ?? '') === '') {
    throw new RuntimeException('Recent IMEI lines must include device_summary after intake.');
}
$staffDevices = (new Atoms\Services\AnalyticsService())->staffDeviceLines(14, (int) $branch['id']);
if ($staffDevices === [] || ($staffDevices[0]['salesperson_name'] ?? '') === '') {
    throw new RuntimeException('Staff device lines must include salesperson_name after sales.');
}
$dashIntake = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('recent_imei_lines', $dashIntake)) {
    throw new RuntimeException('Dashboard must expose recent_imei_lines.');
}
if (!array_key_exists('staff_device_lines', $dashIntake)) {
    throw new RuntimeException('Dashboard must expose staff_device_lines.');
}
if (!array_key_exists('low_stock_lines', $dashIntake)) {
    throw new RuntimeException('Dashboard must expose low_stock_lines.');
}
$imeiCsv = $reports->export('recent_imeis', $today, $today, (int) $branch['id']);
if (!str_contains((string) $imeiCsv['csv'], 'IMEI') || !str_contains((string) $imeiCsv['csv'], 'Device')) {
    throw new RuntimeException('Recent IMEIs CSV must include IMEI and Device columns.');
}
$lowCsv = $reports->export('low_stock', $today, $today, (int) $branch['id']);
if (!str_contains((string) $lowCsv['csv'], 'Product') || !str_contains((string) $lowCsv['csv'], 'Threshold')) {
    throw new RuntimeException('Low stock CSV must include Product and Threshold columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('recent_imei_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose recent_imei_lines.');
}
if (!array_key_exists('staff_device_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose staff_device_lines.');
}
if (!array_key_exists('low_stock_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose low_stock_lines.');
}
$topProducts = (new Atoms\Services\AnalyticsService())->topProducts(14, (int) $branch['id']);
if ($topProducts === [] || !array_key_exists('variant_label', $topProducts[0])) {
    throw new RuntimeException('Top product lines must include variant_label after sales.');
}
$branchAging = (new Atoms\Services\AnalyticsService())->receivableAging((int) $branch['id']);
if (!array_key_exists('buckets', $branchAging) || !array_key_exists('lines', $branchAging)) {
    throw new RuntimeException('Branch-scoped receivable aging must expose buckets and lines.');
}
$dashAging = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('aging_lines', $dashAging)) {
    throw new RuntimeException('Dashboard must expose aging_lines.');
}
if (!array_key_exists('aging_buckets', $dashAging)) {
    throw new RuntimeException('Dashboard must expose aging_buckets.');
}
if (!array_key_exists('top_product_lines', $dashAging)) {
    throw new RuntimeException('Dashboard must expose top_product_lines.');
}
$agingCsv = $reports->export('receivable_aging', $today, $today, (int) $branch['id']);
if (!str_contains((string) $agingCsv['csv'], 'Bucket') || !str_contains((string) $agingCsv['csv'], 'Customer')) {
    throw new RuntimeException('Receivable aging CSV must include Customer and Bucket columns.');
}
$topCsv = $reports->export('top_products', $today, $today, (int) $branch['id']);
if (!str_contains((string) $topCsv['csv'], 'Product') || !str_contains((string) $topCsv['csv'], 'Profit')) {
    throw new RuntimeException('Top products CSV must include Product and Profit columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('aging_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose aging_lines.');
}
if (!array_key_exists('aging_buckets', $analytics)) {
    throw new RuntimeException('Analytics must expose aging_buckets.');
}
if (!array_key_exists('top_product_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose top_product_lines.');
}
$recentMove = (new Atoms\Services\ReportService())->recentMovement((int) $branch['id'], 14);
if ($recentMove['events'] === [] || ($recentMove['by_variant'] ?? []) === []) {
    throw new RuntimeException('Recent movement must expose events and by_variant after IMEI activity.');
}
if (($recentMove['by_variant'][0]['product_name'] ?? '') === '') {
    throw new RuntimeException('Movement lines must name the product.');
}
$payableAging = (new Atoms\Services\AnalyticsService())->payableAging((int) $branch['id']);
if (!array_key_exists('buckets', $payableAging) || !array_key_exists('lines', $payableAging)) {
    throw new RuntimeException('Payable aging must expose buckets and lines.');
}
if ($payableAging['lines'] !== [] && !array_key_exists('variant_summary', $payableAging['lines'][0])) {
    throw new RuntimeException('Payable aging lines must include variant_summary when payables are open.');
}
$dashMove = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('payable_aging_lines', $dashMove)) {
    throw new RuntimeException('Dashboard must expose payable_aging_lines.');
}
if (!array_key_exists('payable_aging_buckets', $dashMove)) {
    throw new RuntimeException('Dashboard must expose payable_aging_buckets.');
}
if (!array_key_exists('movement_lines', $dashMove)) {
    throw new RuntimeException('Dashboard must expose movement_lines.');
}
if (!array_key_exists('movement_events', $dashMove)) {
    throw new RuntimeException('Dashboard must expose movement_events.');
}
$payAgingCsv = $reports->export('payable_aging', $today, $today, (int) $branch['id']);
if (!str_contains((string) $payAgingCsv['csv'], 'Bucket') || !str_contains((string) $payAgingCsv['csv'], 'Supplier')) {
    throw new RuntimeException('Payable aging CSV must include Supplier and Bucket columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('payable_aging_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payable_aging_lines.');
}
if (!array_key_exists('payable_aging_buckets', $analytics)) {
    throw new RuntimeException('Analytics must expose payable_aging_buckets.');
}
if (!array_key_exists('movement_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose movement_lines.');
}
if (!array_key_exists('movement_events', $analytics)) {
    throw new RuntimeException('Analytics must expose movement_events.');
}
$paymentMix = (new Atoms\Services\AnalyticsService())->paymentMix(14, (int) $branch['id']);
if ($paymentMix === [] || ($paymentMix[0]['method'] ?? '') === '') {
    throw new RuntimeException('Payment mix lines must include method after sales.');
}
$saleTypes = (new Atoms\Services\AnalyticsService())->saleTypeMix(14, (int) $branch['id']);
if ($saleTypes === [] || ($saleTypes[0]['type'] ?? '') === '') {
    throw new RuntimeException('Sale type lines must include type after sales.');
}
$branchLines = (new Atoms\Services\AnalyticsService())->branchPerformance(14);
if ($branchLines === [] || ($branchLines[0]['name'] ?? '') === '') {
    throw new RuntimeException('Branch lines must include branch name.');
}
$staffSales = (new Atoms\Services\AnalyticsService())->staffSales(14, (int) $branch['id']);
if ($staffSales === [] || ($staffSales[0]['name'] ?? '') === '') {
    throw new RuntimeException('Staff sales lines must include salesperson name after sales.');
}
$dashMix = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('payment_mix_lines', $dashMix)) {
    throw new RuntimeException('Dashboard must expose payment_mix_lines.');
}
if (!array_key_exists('sale_type_lines', $dashMix)) {
    throw new RuntimeException('Dashboard must expose sale_type_lines.');
}
if (!array_key_exists('branch_lines', $dashMix)) {
    throw new RuntimeException('Dashboard must expose branch_lines.');
}
if (!array_key_exists('staff_sales_lines', $dashMix)) {
    throw new RuntimeException('Dashboard must expose staff_sales_lines.');
}
$mixCsv = $reports->export('payment_mix', $today, $today, (int) $branch['id']);
if (!str_contains((string) $mixCsv['csv'], 'Method') || !str_contains((string) $mixCsv['csv'], 'Collected')) {
    throw new RuntimeException('Payment mix CSV must include Method and Collected columns.');
}
$typeCsv = $reports->export('sale_types', $today, $today, (int) $branch['id']);
if (!str_contains((string) $typeCsv['csv'], 'Type') || !str_contains((string) $typeCsv['csv'], 'Net')) {
    throw new RuntimeException('Sale types CSV must include Type and Net columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('payment_mix_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payment_mix_lines.');
}
if (!array_key_exists('sale_type_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose sale_type_lines.');
}
if (!array_key_exists('branch_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose branch_lines.');
}
if (!array_key_exists('staff_sales_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose staff_sales_lines.');
}
$trendLines = (new Atoms\Services\AnalyticsService())->salesTrend(14, (int) $branch['id']);
if ($trendLines === [] || !array_key_exists('date', $trendLines[0])) {
    throw new RuntimeException('Trend lines must include date for each day in the window.');
}
$cashSnapshot = (new Atoms\Services\ReportService())->recentCash((int) $branch['id'], 14);
if (!array_key_exists('inflows', $cashSnapshot) || !array_key_exists('net', $cashSnapshot)) {
    throw new RuntimeException('Cash snapshot must expose inflows and net.');
}
$recvParties = (new Atoms\Services\ReportService())->receivablePartyLines();
if ($recvParties !== [] && ($recvParties[0]['name'] ?? '') === '') {
    throw new RuntimeException('Receivable party lines must include customer name when balances exist.');
}
$payParties = (new Atoms\Services\ReportService())->payablePartyLines();
if ($payParties !== [] && ($payParties[0]['name'] ?? '') === '') {
    throw new RuntimeException('Payable party lines must include supplier name when balances exist.');
}
$dashLedger = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('trend_lines', $dashLedger)) {
    throw new RuntimeException('Dashboard must expose trend_lines.');
}
if (!array_key_exists('cash_snapshot', $dashLedger)) {
    throw new RuntimeException('Dashboard must expose cash_snapshot.');
}
if (!array_key_exists('receivable_party_lines', $dashLedger)) {
    throw new RuntimeException('Dashboard must expose receivable_party_lines.');
}
if (!array_key_exists('payable_party_lines', $dashLedger)) {
    throw new RuntimeException('Dashboard must expose payable_party_lines.');
}
$trendCsv = $reports->export('sales_trend', $today, $today, (int) $branch['id']);
if (!str_contains((string) $trendCsv['csv'], 'Date') || !str_contains((string) $trendCsv['csv'], 'Net')) {
    throw new RuntimeException('Sales trend CSV must include Date and Net columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('trend_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose trend_lines.');
}
if (!array_key_exists('cash_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose cash_snapshot.');
}
if (!array_key_exists('receivable_party_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose receivable_party_lines.');
}
if (!array_key_exists('payable_party_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payable_party_lines.');
}
$imeiStatus = (new Atoms\Services\ReportService())->imeiStatusLines((int) $branch['id']);
if ($imeiStatus === [] || ($imeiStatus[0]['status'] ?? '') === '') {
    throw new RuntimeException('IMEI status lines must include status after device activity.');
}
$invSnap = (new Atoms\Services\ReportService())->inventorySnapshot((int) $branch['id']);
if (!array_key_exists('available_qty', $invSnap) || !array_key_exists('on_hand_value', $invSnap)) {
    throw new RuntimeException('Inventory snapshot must expose available_qty and on_hand_value.');
}
$invLines = (new Atoms\Services\ReportService())->inventoryLines((int) $branch['id']);
if ($invLines === [] || ($invLines[0]['name'] ?? '') === '') {
    throw new RuntimeException('Inventory lines must include product name when stock exists.');
}
$dashInv = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('imei_status_lines', $dashInv)) {
    throw new RuntimeException('Dashboard must expose imei_status_lines.');
}
if (!array_key_exists('inventory_snapshot', $dashInv)) {
    throw new RuntimeException('Dashboard must expose inventory_snapshot.');
}
if (!array_key_exists('inventory_lines', $dashInv)) {
    throw new RuntimeException('Dashboard must expose inventory_lines.');
}
$imeiStatusCsv = $reports->export('imei_status', $today, $today, (int) $branch['id']);
if (!str_contains((string) $imeiStatusCsv['csv'], 'Status') || !str_contains((string) $imeiStatusCsv['csv'], 'Qty')) {
    throw new RuntimeException('IMEI status CSV must include Status and Qty columns.');
}
$invValCsv = $reports->export('inventory_valuation', $today, $today, (int) $branch['id']);
if (!str_contains((string) $invValCsv['csv'], 'Product') || !str_contains((string) $invValCsv['csv'], 'Valuation')) {
    throw new RuntimeException('Inventory valuation CSV must include Product and Valuation columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('imei_status_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose imei_status_lines.');
}
if (!array_key_exists('inventory_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose inventory_snapshot.');
}
if (!array_key_exists('inventory_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose inventory_lines.');
}
$todaySales = (new Atoms\Services\SaleService())->recentLines((int) $branch['id'], 1);
if ($todaySales === [] || ($todaySales[0]['invoice_number'] ?? '') === '') {
    throw new RuntimeException('Today sales lines must include invoice_number after sales are posted.');
}
$expSnap = (new Atoms\Services\ExpenseService())->snapshot((int) $branch['id']);
if (!array_key_exists('pending_count', $expSnap) || !array_key_exists('posted_today_total', $expSnap)) {
    throw new RuntimeException('Expense snapshot must expose pending_count and posted_today_total.');
}
$todayCash = (new Atoms\Services\ReportService())->recentCash((int) $branch['id'], 1);
if (!array_key_exists('inflows', $todayCash) || !array_key_exists('net', $todayCash)) {
    throw new RuntimeException('Today cash snapshot must expose inflows and net.');
}
$dashToday = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('today_sales_lines', $dashToday)) {
    throw new RuntimeException('Dashboard must expose today_sales_lines.');
}
if (!array_key_exists('today_payment_lines', $dashToday)) {
    throw new RuntimeException('Dashboard must expose today_payment_lines.');
}
if (!array_key_exists('today_return_lines', $dashToday)) {
    throw new RuntimeException('Dashboard must expose today_return_lines.');
}
if (!array_key_exists('today_cash_snapshot', $dashToday)) {
    throw new RuntimeException('Dashboard must expose today_cash_snapshot.');
}
if (!array_key_exists('expense_snapshot', $dashToday)) {
    throw new RuntimeException('Dashboard must expose expense_snapshot.');
}
$todaySalesCsv = $reports->export('today_sales', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todaySalesCsv['csv'], 'Invoice') || !str_contains((string) $todaySalesCsv['csv'], 'Total')) {
    throw new RuntimeException('Today sales CSV must include Invoice and Total columns.');
}
$expSnapCsv = $reports->export('expense_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $expSnapCsv['csv'], 'Bucket') || !str_contains((string) $expSnapCsv['csv'], 'Pending')) {
    throw new RuntimeException('Expense snapshot CSV must include Bucket and Pending columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('today_sales_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_sales_lines.');
}
if (!array_key_exists('today_cash_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose today_cash_snapshot.');
}
if (!array_key_exists('expense_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose expense_snapshot.');
}
$intakeSnap = (new Atoms\Services\ReportService())->intakeSnapshot((int) $branch['id']);
if (!array_key_exists('purchase_count', $intakeSnap) || !array_key_exists('imei_count', $intakeSnap)) {
    throw new RuntimeException('Intake snapshot must expose purchase_count and imei_count.');
}
$todayPurchases = (new Atoms\Services\PurchaseService())->recentLines((int) $branch['id'], 1);
if ($todayPurchases === [] || ($todayPurchases[0]['supplier_name'] ?? '') === '') {
    throw new RuntimeException('Today purchase lines must include supplier_name after intake.');
}
$todayImeis = (new Atoms\Services\ImeiService())->recentLines((int) $branch['id'], 1);
if ($todayImeis === [] || ($todayImeis[0]['device_summary'] ?? '') === '') {
    throw new RuntimeException('Today IMEI lines must include device_summary after registration.');
}
$dashIntake = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('intake_snapshot', $dashIntake)) {
    throw new RuntimeException('Dashboard must expose intake_snapshot.');
}
if (!array_key_exists('today_purchase_lines', $dashIntake)) {
    throw new RuntimeException('Dashboard must expose today_purchase_lines.');
}
if (!array_key_exists('today_imei_lines', $dashIntake)) {
    throw new RuntimeException('Dashboard must expose today_imei_lines.');
}
if (!array_key_exists('today_supplier_payment_lines', $dashIntake)) {
    throw new RuntimeException('Dashboard must expose today_supplier_payment_lines.');
}
if (!array_key_exists('today_swap_lines', $dashIntake)) {
    throw new RuntimeException('Dashboard must expose today_swap_lines.');
}
$intakeCsv = $reports->export('intake_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $intakeCsv['csv'], 'Purchases today') || !str_contains((string) $intakeCsv['csv'], 'IMEIs')) {
    throw new RuntimeException('Intake snapshot CSV must include Purchases today and IMEIs rows.');
}
$purchCsv = $reports->export('today_purchases', $today, $today, (int) $branch['id']);
if (!str_contains((string) $purchCsv['csv'], 'Supplier') || !str_contains((string) $purchCsv['csv'], 'Total')) {
    throw new RuntimeException('Today purchases CSV must include Supplier and Total columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('intake_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose intake_snapshot.');
}
if (!array_key_exists('today_purchase_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_purchase_lines.');
}
if (!array_key_exists('today_imei_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_imei_lines.');
}
$opsSnap = (new Atoms\Services\ReportService())->operationsSnapshot((int) $branch['id']);
if (!array_key_exists('open_repair_count', $opsSnap) || !array_key_exists('in_transit_count', $opsSnap)) {
    throw new RuntimeException('Operations snapshot must expose open_repair_count and in_transit_count.');
}
$todayTransfers = (new Atoms\Services\TransferService())->recentLines((int) $branch['id'], 1);
if ($todayTransfers === [] || !array_key_exists('device_summary', $todayTransfers[0])) {
    throw new RuntimeException('Today transfer lines must include device_summary after dispatch.');
}
$todayRepairs = (new Atoms\Services\RepairService())->recentLines((int) $branch['id'], 1);
if ($todayRepairs === [] || ($todayRepairs[0]['device_summary'] ?? '') === '') {
    throw new RuntimeException('Today repair lines must include device_summary after completion.');
}
$todayAudit = (new Atoms\Services\AuditLogger())->recentLines((int) $branch['id'], 1);
if ($todayAudit === [] || ($todayAudit[0]['action_label'] ?? '') === '') {
    throw new RuntimeException('Today audit lines must include action_label after activity.');
}
$dashOps = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('operations_snapshot', $dashOps)) {
    throw new RuntimeException('Dashboard must expose operations_snapshot.');
}
if (!array_key_exists('today_transfer_lines', $dashOps)) {
    throw new RuntimeException('Dashboard must expose today_transfer_lines.');
}
if (!array_key_exists('today_repair_lines', $dashOps)) {
    throw new RuntimeException('Dashboard must expose today_repair_lines.');
}
if (!array_key_exists('today_audit_lines', $dashOps)) {
    throw new RuntimeException('Dashboard must expose today_audit_lines.');
}
$opsCsv = $reports->export('operations_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $opsCsv['csv'], 'Open repairs') || !str_contains((string) $opsCsv['csv'], 'In transit')) {
    throw new RuntimeException('Operations snapshot CSV must include Open repairs and In transit rows.');
}
$xferCsv = $reports->export('today_transfers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $xferCsv['csv'], 'Transfer') || !str_contains((string) $xferCsv['csv'], 'Devices')) {
    throw new RuntimeException('Today transfers CSV must include Transfer and Devices columns.');
}
$repairCsv = $reports->export('today_repairs', $today, $today, (int) $branch['id']);
if (!str_contains((string) $repairCsv['csv'], 'Ticket') || !str_contains((string) $repairCsv['csv'], 'Completed')) {
    throw new RuntimeException('Today repairs CSV must include Ticket and Completed columns.');
}
$auditTodayCsv = $reports->export('today_audit', $today, $today, (int) $branch['id']);
if (!str_contains((string) $auditTodayCsv['csv'], 'Action') || !str_contains((string) $auditTodayCsv['csv'], 'Summary')) {
    throw new RuntimeException('Today audit CSV must include Action and Summary columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('operations_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose operations_snapshot.');
}
if (!array_key_exists('today_transfer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_transfer_lines.');
}
if (!array_key_exists('today_repair_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_repair_lines.');
}
if (!array_key_exists('today_audit_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_audit_lines.');
}
$recvSnap = (new Atoms\Services\ReportService())->receivablesSnapshot((int) $branch['id']);
if (!array_key_exists('overdue_count', $recvSnap) || !array_key_exists('collection_count', $recvSnap)) {
    throw new RuntimeException('Receivables snapshot must expose overdue_count and collection_count.');
}
$todayApprovals = (new Atoms\Services\ApprovalService())->recentLines((int) $branch['id'], 1);
if ($todayApprovals === [] || ($todayApprovals[0]['type_label'] ?? '') === '') {
    throw new RuntimeException('Today approval lines must include type_label after decisions.');
}
$todayCustomers = (new Atoms\Services\CustomerService())->recentLines((int) $branch['id'], 1);
if ($todayCustomers === [] || ($todayCustomers[0]['name'] ?? '') === '') {
    throw new RuntimeException('Today customer lines must include name after registration.');
}
$dashRecv = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('receivables_snapshot', $dashRecv)) {
    throw new RuntimeException('Dashboard must expose receivables_snapshot.');
}
if (!array_key_exists('today_approval_lines', $dashRecv)) {
    throw new RuntimeException('Dashboard must expose today_approval_lines.');
}
if (!array_key_exists('today_customer_lines', $dashRecv)) {
    throw new RuntimeException('Dashboard must expose today_customer_lines.');
}
$recvCsv = $reports->export('receivables_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recvCsv['csv'], 'Overdue invoices') || !str_contains((string) $recvCsv['csv'], 'Collections today')) {
    throw new RuntimeException('Receivables snapshot CSV must include Overdue invoices and Collections today rows.');
}
$apprTodayCsv = $reports->export('today_approvals', $today, $today, (int) $branch['id']);
if (!str_contains((string) $apprTodayCsv['csv'], 'Decision') || !str_contains((string) $apprTodayCsv['csv'], 'Reviewer')) {
    throw new RuntimeException('Today approvals CSV must include Decision and Reviewer columns.');
}
$custTodayCsv = $reports->export('today_customers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $custTodayCsv['csv'], 'Customer') || !str_contains((string) $custTodayCsv['csv'], 'Balance')) {
    throw new RuntimeException('Today customers CSV must include Customer and Balance columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('receivables_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose receivables_snapshot.');
}
if (!array_key_exists('today_approval_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_approval_lines.');
}
if (!array_key_exists('today_customer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_customer_lines.');
}
$paySnap = (new Atoms\Services\ReportService())->payablesSnapshot((int) $branch['id']);
if (!array_key_exists('open_payable_count', $paySnap) || !array_key_exists('supplier_payment_count', $paySnap)) {
    throw new RuntimeException('Payables snapshot must expose open_payable_count and supplier_payment_count.');
}
$todaySupReturns = (new Atoms\Services\SupplierService())->recentReturnLines((int) $branch['id'], 1);
if ($todaySupReturns === [] || ($todaySupReturns[0]['device_summary'] ?? '') === '') {
    throw new RuntimeException('Today supplier return lines must include device_summary after return.');
}
$todayStockCounts = (new Atoms\Services\StockCountService())->recentLines((int) $branch['id'], 1);
if ($todayStockCounts === [] || !array_key_exists('posted_at', $todayStockCounts[0])) {
    throw new RuntimeException('Today stock count lines must include posted_at after counts.');
}
$dashPay = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('payables_snapshot', $dashPay)) {
    throw new RuntimeException('Dashboard must expose payables_snapshot.');
}
if (!array_key_exists('today_supplier_return_lines', $dashPay)) {
    throw new RuntimeException('Dashboard must expose today_supplier_return_lines.');
}
if (!array_key_exists('today_stock_count_lines', $dashPay)) {
    throw new RuntimeException('Dashboard must expose today_stock_count_lines.');
}
$payCsv = $reports->export('payables_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $payCsv['csv'], 'Open payables') || !str_contains((string) $payCsv['csv'], 'Supplier payments today')) {
    throw new RuntimeException('Payables snapshot CSV must include Open payables and Supplier payments today rows.');
}
$supRetTodayCsv = $reports->export('today_supplier_returns', $today, $today, (int) $branch['id']);
if (!str_contains((string) $supRetTodayCsv['csv'], 'Supplier') || !str_contains((string) $supRetTodayCsv['csv'], 'Credit')) {
    throw new RuntimeException('Today supplier returns CSV must include Supplier and Credit columns.');
}
$countTodayCsv = $reports->export('today_stock_counts', $today, $today, (int) $branch['id']);
if (!str_contains((string) $countTodayCsv['csv'], 'Count') || !str_contains((string) $countTodayCsv['csv'], 'Missing')) {
    throw new RuntimeException('Today stock counts CSV must include Count and Missing columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('payables_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose payables_snapshot.');
}
if (!array_key_exists('today_supplier_return_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_supplier_return_lines.');
}
if (!array_key_exists('today_stock_count_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_stock_count_lines.');
}
$adjSnap = (new Atoms\Services\ReportService())->adjustmentsSnapshot((int) $branch['id']);
if (!array_key_exists('return_count', $adjSnap) || !array_key_exists('voided_count', $adjSnap)) {
    throw new RuntimeException('Adjustments snapshot must expose return_count and voided_count.');
}
$todayReversals = (new Atoms\Services\PaymentService())->reversalLines((int) $branch['id'], 1);
if ($todayReversals === [] || ($todayReversals[0]['notes'] ?? '') === '') {
    throw new RuntimeException('Today reversal lines must include notes after reversal.');
}
$todayVoided = (new Atoms\Services\SaleService())->voidedLines((int) $branch['id'], 1);
if ($todayVoided === [] || ($todayVoided[0]['void_reason'] ?? '') === '') {
    throw new RuntimeException('Today voided lines must include void_reason after void.');
}
$dashAdj = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('adjustments_snapshot', $dashAdj)) {
    throw new RuntimeException('Dashboard must expose adjustments_snapshot.');
}
if (!array_key_exists('today_reversal_lines', $dashAdj)) {
    throw new RuntimeException('Dashboard must expose today_reversal_lines.');
}
if (!array_key_exists('today_voided_lines', $dashAdj)) {
    throw new RuntimeException('Dashboard must expose today_voided_lines.');
}
$adjCsv = $reports->export('adjustments_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $adjCsv['csv'], 'Returns today') || !str_contains((string) $adjCsv['csv'], 'Voided sales today')) {
    throw new RuntimeException('Adjustments snapshot CSV must include Returns today and Voided sales today rows.');
}
$revTodayCsv = $reports->export('today_reversals', $today, $today, (int) $branch['id']);
if (!str_contains((string) $revTodayCsv['csv'], 'Reason') || !str_contains((string) $revTodayCsv['csv'], 'Invoice')) {
    throw new RuntimeException('Today reversals CSV must include Reason and Invoice columns.');
}
$voidTodayCsv = $reports->export('today_voided_sales', $today, $today, (int) $branch['id']);
if (!str_contains((string) $voidTodayCsv['csv'], 'Voided') || !str_contains((string) $voidTodayCsv['csv'], 'Reason')) {
    throw new RuntimeException('Today voided sales CSV must include Voided and Reason columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('adjustments_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose adjustments_snapshot.');
}
if (!array_key_exists('today_reversal_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_reversal_lines.');
}
if (!array_key_exists('today_voided_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_voided_lines.');
}
$perfSnap = (new Atoms\Services\ReportService())->performanceSnapshot((int) $branch['id']);
if (!array_key_exists('low_stock_count', $perfSnap) || !array_key_exists('alert_today_count', $perfSnap)) {
    throw new RuntimeException('Performance snapshot must expose low_stock_count and alert_today_count.');
}
$todayAlerts = (new Atoms\Services\NotifyService())->recentLines((int) $branch['id'], 1);
if ($todayAlerts === [] || ($todayAlerts[0]['title'] ?? '') === '') {
    throw new RuntimeException('Today alert lines must include title after notifications.');
}
$dashPerf = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('performance_snapshot', $dashPerf)) {
    throw new RuntimeException('Dashboard must expose performance_snapshot.');
}
if (!array_key_exists('today_notify_lines', $dashPerf)) {
    throw new RuntimeException('Dashboard must expose today_notify_lines.');
}
$perfCsv = $reports->export('performance_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $perfCsv['csv'], 'Low stock alerts') || !str_contains((string) $perfCsv['csv'], 'Alerts today')) {
    throw new RuntimeException('Performance snapshot CSV must include Low stock alerts and Alerts today rows.');
}
$alertTodayCsv = $reports->export('today_alerts', $today, $today, (int) $branch['id']);
if (!str_contains((string) $alertTodayCsv['csv'], 'Title') || !str_contains((string) $alertTodayCsv['csv'], 'Detail')) {
    throw new RuntimeException('Today alerts CSV must include Title and Detail columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('performance_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose performance_snapshot.');
}
if (!array_key_exists('today_notify_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_notify_lines.');
}
$staffSnap = (new Atoms\Services\ReportService())->staffSnapshot((int) $branch['id']);
if (!array_key_exists('staff_count', $staffSnap) || !array_key_exists('sales_today_count', $staffSnap)) {
    throw new RuntimeException('Staff snapshot must expose staff_count and sales_today_count.');
}
$dashStaff = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('staff_snapshot', $dashStaff)) {
    throw new RuntimeException('Dashboard must expose staff_snapshot.');
}
if (!array_key_exists('today_sales_lines', $dashStaff)) {
    throw new RuntimeException('Dashboard must expose today_sales_lines.');
}
$staffCsv = $reports->export('staff_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $staffCsv['csv'], 'Staff with sales (14d)') || !str_contains((string) $staffCsv['csv'], 'Sales today')) {
    throw new RuntimeException('Staff snapshot CSV must include Staff with sales (14d) and Sales today rows.');
}
$salesTodayCsv = $reports->export('today_sales', $today, $today, (int) $branch['id']);
if (!str_contains((string) $salesTodayCsv['csv'], 'Invoice') || !str_contains((string) $salesTodayCsv['csv'], 'Total')) {
    throw new RuntimeException('Today sales CSV must include Invoice and Total columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('staff_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose staff_snapshot.');
}
if (!array_key_exists('today_sales_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_sales_lines.');
}
$moveSnap = (new Atoms\Services\ReportService())->movementSnapshot((int) $branch['id']);
if (!array_key_exists('transfer_count', $moveSnap) || !array_key_exists('movement_14d_count', $moveSnap)) {
    throw new RuntimeException('Movement snapshot must expose transfer_count and movement_14d_count.');
}
$dashMove = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('movement_snapshot', $dashMove)) {
    throw new RuntimeException('Dashboard must expose movement_snapshot.');
}
if (!array_key_exists('today_transfer_lines', $dashMove)) {
    throw new RuntimeException('Dashboard must expose today_transfer_lines.');
}
$moveCsv = $reports->export('movement_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $moveCsv['csv'], 'Transfers today') || !str_contains((string) $moveCsv['csv'], 'IMEI events (14d)')) {
    throw new RuntimeException('Movement snapshot CSV must include Transfers today and IMEI events (14d) rows.');
}
$transferTodayCsv = $reports->export('today_transfers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $transferTodayCsv['csv'], 'Transfer') || !str_contains((string) $transferTodayCsv['csv'], 'Status')) {
    throw new RuntimeException('Today transfers CSV must include Transfer and Status columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('movement_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose movement_snapshot.');
}
if (!array_key_exists('today_transfer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_transfer_lines.');
}
$ledgerSnap = (new Atoms\Services\ReportService())->ledgerSnapshot((int) $branch['id']);
if (!array_key_exists('receivable_total', $ledgerSnap) || !array_key_exists('cash_net_14d', $ledgerSnap)) {
    throw new RuntimeException('Ledger snapshot must expose receivable_total and cash_net_14d.');
}
$dashLedger = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('ledger_snapshot', $dashLedger)) {
    throw new RuntimeException('Dashboard must expose ledger_snapshot.');
}
if (!array_key_exists('today_payment_lines', $dashLedger)) {
    throw new RuntimeException('Dashboard must expose today_payment_lines.');
}
$ledgerCsv = $reports->export('ledger_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $ledgerCsv['csv'], 'Customer receivables') || !str_contains((string) $ledgerCsv['csv'], 'Net cash (14d)')) {
    throw new RuntimeException('Ledger snapshot CSV must include Customer receivables and Net cash (14d) rows.');
}
$payTodayCsv = $reports->export('today_payments', $today, $today, (int) $branch['id']);
if (!str_contains((string) $payTodayCsv['csv'], 'Customer') || !str_contains((string) $payTodayCsv['csv'], 'Amount')) {
    throw new RuntimeException('Today payments CSV must include Customer and Amount columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('ledger_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose ledger_snapshot.');
}
if (!array_key_exists('today_payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_payment_lines.');
}
$repairSnap = (new Atoms\Services\ReportService())->repairSnapshot((int) $branch['id']);
if (!array_key_exists('open_repair_count', $repairSnap) || !array_key_exists('completed_today_count', $repairSnap)) {
    throw new RuntimeException('Repair snapshot must expose open_repair_count and completed_today_count.');
}
$dashRepair = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('repair_snapshot', $dashRepair)) {
    throw new RuntimeException('Dashboard must expose repair_snapshot.');
}
if (!array_key_exists('today_repair_lines', $dashRepair)) {
    throw new RuntimeException('Dashboard must expose today_repair_lines.');
}
$repairCsv = $reports->export('repair_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $repairCsv['csv'], 'Open repairs') || !str_contains((string) $repairCsv['csv'], 'Completed today')) {
    throw new RuntimeException('Repair snapshot CSV must include Open repairs and Completed today rows.');
}
$repairTodayCsv = $reports->export('today_repairs', $today, $today, (int) $branch['id']);
if (!str_contains((string) $repairTodayCsv['csv'], 'Ticket') || !str_contains((string) $repairTodayCsv['csv'], 'Engineer')) {
    throw new RuntimeException('Today repairs CSV must include Ticket and Engineer columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('repair_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose repair_snapshot.');
}
if (!array_key_exists('today_repair_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_repair_lines.');
}
$compSnap = (new Atoms\Services\ReportService())->complianceSnapshot((int) $branch['id']);
if (!array_key_exists('pending_approval_count', $compSnap) || !array_key_exists('audit_today_count', $compSnap)) {
    throw new RuntimeException('Compliance snapshot must expose pending_approval_count and audit_today_count.');
}
$dashComp = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('compliance_snapshot', $dashComp)) {
    throw new RuntimeException('Dashboard must expose compliance_snapshot.');
}
if (!array_key_exists('today_audit_lines', $dashComp)) {
    throw new RuntimeException('Dashboard must expose today_audit_lines.');
}
$compCsv = $reports->export('compliance_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $compCsv['csv'], 'Pending approvals') || !str_contains((string) $compCsv['csv'], 'Audit events today')) {
    throw new RuntimeException('Compliance snapshot CSV must include Pending approvals and Audit events today rows.');
}
$auditTodayCsv = $reports->export('today_audit', $today, $today, (int) $branch['id']);
if (!str_contains((string) $auditTodayCsv['csv'], 'Action') || !str_contains((string) $auditTodayCsv['csv'], 'Summary')) {
    throw new RuntimeException('Today audit CSV must include Action and Summary columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('compliance_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose compliance_snapshot.');
}
if (!array_key_exists('today_audit_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_audit_lines.');
}
$tradeSnap = (new Atoms\Services\ReportService())->tradeSnapshot((int) $branch['id']);
if (!array_key_exists('wholesale_owing_count', $tradeSnap) || !array_key_exists('swap_today_count', $tradeSnap)) {
    throw new RuntimeException('Trade snapshot must expose wholesale_owing_count and swap_today_count.');
}
$dashTrade = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('trade_snapshot', $dashTrade)) {
    throw new RuntimeException('Dashboard must expose trade_snapshot.');
}
if (!array_key_exists('today_swap_lines', $dashTrade)) {
    throw new RuntimeException('Dashboard must expose today_swap_lines.');
}
$tradeCsv = $reports->export('trade_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $tradeCsv['csv'], 'Wholesale owing') || !str_contains((string) $tradeCsv['csv'], 'Swaps today')) {
    throw new RuntimeException('Trade snapshot CSV must include Wholesale owing and Swaps today rows.');
}
$swapTodayCsv = $reports->export('today_swaps', $today, $today, (int) $branch['id']);
if (!str_contains((string) $swapTodayCsv['csv'], 'Swap') || !str_contains((string) $swapTodayCsv['csv'], 'Collected')) {
    throw new RuntimeException('Today swaps CSV must include Swap and Collected columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('trade_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose trade_snapshot.');
}
if (!array_key_exists('today_swap_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_swap_lines.');
}
$agingSnap = (new Atoms\Services\ReportService())->agingSnapshot((int) $branch['id']);
if (!array_key_exists('receivable_total', $agingSnap) || !array_key_exists('payment_collected_14d', $agingSnap)) {
    throw new RuntimeException('Aging snapshot must expose receivable_total and payment_collected_14d.');
}
$dashAging = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('aging_snapshot', $dashAging)) {
    throw new RuntimeException('Dashboard must expose aging_snapshot.');
}
if (!array_key_exists('aging_lines', $dashAging)) {
    throw new RuntimeException('Dashboard must expose aging_lines.');
}
$agingCsv = $reports->export('aging_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $agingCsv['csv'], 'Open receivables') || !str_contains((string) $agingCsv['csv'], 'Payment methods (14d)')) {
    throw new RuntimeException('Aging snapshot CSV must include Open receivables and Payment methods (14d) rows.');
}
$recvAgingCsv = $reports->export('receivable_aging', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recvAgingCsv['csv'], 'Customer') || !str_contains((string) $recvAgingCsv['csv'], 'Age (days)')) {
    throw new RuntimeException('Receivable aging CSV must include Customer and Age (days) columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('aging_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose aging_snapshot.');
}
if (!array_key_exists('aging_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose aging_lines.');
}
$executiveSnap = (new Atoms\Services\ReportService())->executiveSnapshot((int) $branch['id']);
if (!array_key_exists('sales_today_count', $executiveSnap) || !array_key_exists('notify_unread', $executiveSnap)) {
    throw new RuntimeException('Executive snapshot must expose sales_today_count and notify_unread.');
}
$dashExecutive = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('executive_snapshot', $dashExecutive)) {
    throw new RuntimeException('Dashboard must expose executive_snapshot.');
}
if (!array_key_exists('today_sales_lines', $dashExecutive)) {
    throw new RuntimeException('Dashboard must expose today_sales_lines.');
}
$executiveCsv = $reports->export('executive_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $executiveCsv['csv'], 'Sales today') || !str_contains((string) $executiveCsv['csv'], 'Unread alerts')) {
    throw new RuntimeException('Executive snapshot CSV must include Sales today and Unread alerts rows.');
}
$todaySalesCsv = $reports->export('today_sales', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todaySalesCsv['csv'], 'Invoice') || !str_contains((string) $todaySalesCsv['csv'], 'Total')) {
    throw new RuntimeException('Today sales CSV must include Invoice and Total columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('executive_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose executive_snapshot.');
}
$branchSnap = (new Atoms\Services\ReportService())->branchSnapshot((int) $branch['id']);
if (!array_key_exists('branch_count', $branchSnap) || !array_key_exists('profit_14d', $branchSnap)) {
    throw new RuntimeException('Branch snapshot must expose branch_count and profit_14d.');
}
$dashBranch = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('branch_snapshot', $dashBranch)) {
    throw new RuntimeException('Dashboard must expose branch_snapshot.');
}
if (!array_key_exists('branch_lines', $dashBranch)) {
    throw new RuntimeException('Dashboard must expose branch_lines.');
}
$branchSnapCsv = $reports->export('branch_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $branchSnapCsv['csv'], 'Active branches') || !str_contains((string) $branchSnapCsv['csv'], 'Top branch profit (14d)')) {
    throw new RuntimeException('Branch snapshot CSV must include Active branches and Top branch profit (14d) rows.');
}
$branchesCsv = $reports->export('branches', $today, $today, (int) $branch['id']);
if (!str_contains((string) $branchesCsv['csv'], 'Branch') || !str_contains((string) $branchesCsv['csv'], 'Collection %')) {
    throw new RuntimeException('Branches CSV must include Branch and Collection % columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('branch_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose branch_snapshot.');
}
if (!array_key_exists('branch_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose branch_lines.');
}
$mixSnap = (new Atoms\Services\ReportService())->mixSnapshot((int) $branch['id']);
if (!array_key_exists('retail_revenue', $mixSnap) || !array_key_exists('payment_collected_14d', $mixSnap)) {
    throw new RuntimeException('Mix snapshot must expose retail_revenue and payment_collected_14d.');
}
$dashMixDesk = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('mix_snapshot', $dashMixDesk)) {
    throw new RuntimeException('Dashboard must expose mix_snapshot.');
}
if (!array_key_exists('payment_mix_lines', $dashMixDesk)) {
    throw new RuntimeException('Dashboard must expose payment_mix_lines.');
}
if (!array_key_exists('sale_type_lines', $dashMixDesk)) {
    throw new RuntimeException('Dashboard must expose sale_type_lines.');
}
$mixSnapCsv = $reports->export('mix_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $mixSnapCsv['csv'], 'Payment methods (14d)') || !str_contains((string) $mixSnapCsv['csv'], 'Retail invoices (14d)')) {
    throw new RuntimeException('Mix snapshot CSV must include Payment methods (14d) and Retail invoices (14d) rows.');
}
$mixCsv = $reports->export('payment_mix', $today, $today, (int) $branch['id']);
if (!str_contains((string) $mixCsv['csv'], 'Method') || !str_contains((string) $mixCsv['csv'], 'Collected')) {
    throw new RuntimeException('Payment mix CSV must include Method and Collected columns.');
}
$typeCsv = $reports->export('sale_types', $today, $today, (int) $branch['id']);
if (!str_contains((string) $typeCsv['csv'], 'Type') || !str_contains((string) $typeCsv['csv'], 'Net')) {
    throw new RuntimeException('Sale types CSV must include Type and Net columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('mix_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose mix_snapshot.');
}
if (!array_key_exists('payment_mix_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payment_mix_lines.');
}
if (!array_key_exists('sale_type_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose sale_type_lines.');
}
$productSnap = (new Atoms\Services\ReportService())->productSnapshot((int) $branch['id']);
if (!array_key_exists('top_seller_profit', $productSnap) || !array_key_exists('slow_mover_qty', $productSnap)) {
    throw new RuntimeException('Product snapshot must expose top_seller_profit and slow_mover_qty.');
}
$dashProduct = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('product_snapshot', $dashProduct)) {
    throw new RuntimeException('Dashboard must expose product_snapshot.');
}
if (!array_key_exists('top_product_lines', $dashProduct)) {
    throw new RuntimeException('Dashboard must expose top_product_lines.');
}
if (!array_key_exists('slow_lines', $dashProduct)) {
    throw new RuntimeException('Dashboard must expose slow_lines.');
}
$productSnapCsv = $reports->export('product_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $productSnapCsv['csv'], 'Top sellers (14d)') || !str_contains((string) $productSnapCsv['csv'], 'Slow mover units')) {
    throw new RuntimeException('Product snapshot CSV must include Top sellers (14d) and Slow mover units rows.');
}
$topCsv = $reports->export('top_products', $today, $today, (int) $branch['id']);
if (!str_contains((string) $topCsv['csv'], 'Product') || !str_contains((string) $topCsv['csv'], 'Profit')) {
    throw new RuntimeException('Top products CSV must include Product and Profit columns.');
}
$slowCsv = $reports->export('slow_movers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $slowCsv['csv'], 'Product') || !str_contains((string) $slowCsv['csv'], 'Oldest stock')) {
    throw new RuntimeException('Slow movers CSV must include Product and Oldest stock columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('product_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose product_snapshot.');
}
if (!array_key_exists('top_product_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose top_product_lines.');
}
if (!array_key_exists('slow_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose slow_lines.');
}
$trendSnap = (new Atoms\Services\ReportService())->trendSnapshot((int) $branch['id']);
if (!array_key_exists('sales_14d', $trendSnap) || !array_key_exists('best_day_net', $trendSnap)) {
    throw new RuntimeException('Trend snapshot must expose sales_14d and best_day_net.');
}
$dashTrend = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('trend_snapshot', $dashTrend)) {
    throw new RuntimeException('Dashboard must expose trend_snapshot.');
}
if (!array_key_exists('trend_lines', $dashTrend)) {
    throw new RuntimeException('Dashboard must expose trend_lines.');
}
$trendSnapCsv = $reports->export('trend_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $trendSnapCsv['csv'], 'Invoices (14d)') || !str_contains((string) $trendSnapCsv['csv'], 'Average daily sales')) {
    throw new RuntimeException('Trend snapshot CSV must include Invoices (14d) and Average daily sales rows.');
}
$trendCsv = $reports->export('sales_trend', $today, $today, (int) $branch['id']);
if (!str_contains((string) $trendCsv['csv'], 'Date') || !str_contains((string) $trendCsv['csv'], 'Collected')) {
    throw new RuntimeException('Sales trend CSV must include Date and Collected columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('trend_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose trend_snapshot.');
}
if (!array_key_exists('trend_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose trend_lines.');
}
$cashflowSnap = (new Atoms\Services\ReportService())->cashflowSnapshot((int) $branch['id']);
if (!array_key_exists('net_14d', $cashflowSnap) || !array_key_exists('net_today', $cashflowSnap)) {
    throw new RuntimeException('Cashflow snapshot must expose net_14d and net_today.');
}
$dashCashflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('cashflow_snapshot', $dashCashflow)) {
    throw new RuntimeException('Dashboard must expose cashflow_snapshot.');
}
if (!array_key_exists('cash_snapshot', $dashCashflow)) {
    throw new RuntimeException('Dashboard must expose cash_snapshot.');
}
if (!array_key_exists('today_cash_snapshot', $dashCashflow)) {
    throw new RuntimeException('Dashboard must expose today_cash_snapshot.');
}
$cashflowCsv = $reports->export('cashflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $cashflowCsv['csv'], 'Cash in (14d)') || !str_contains((string) $cashflowCsv['csv'], 'Net cash today')) {
    throw new RuntimeException('Cashflow snapshot CSV must include Cash in (14d) and Net cash today rows.');
}
$cashCsv = $reports->export('cash', $today, $today, (int) $branch['id']);
if (!str_contains((string) $cashCsv['csv'], 'Inflows') || !str_contains((string) $cashCsv['csv'], 'Net')) {
    throw new RuntimeException('Cash CSV must include Inflows and Net rows.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('cashflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose cashflow_snapshot.');
}
if (!array_key_exists('cash_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose cash_snapshot.');
}
if (!array_key_exists('today_cash_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose today_cash_snapshot.');
}
$staffDeviceSnap = (new Atoms\Services\ReportService())->staffDeviceSnapshot((int) $branch['id']);
if (!array_key_exists('device_line_count', $staffDeviceSnap) || !array_key_exists('revenue_today', $staffDeviceSnap)) {
    throw new RuntimeException('Staff device snapshot must expose device_line_count and revenue_today.');
}
$dashStaffDevice = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('staff_device_snapshot', $dashStaffDevice)) {
    throw new RuntimeException('Dashboard must expose staff_device_snapshot.');
}
if (!array_key_exists('staff_device_lines', $dashStaffDevice)) {
    throw new RuntimeException('Dashboard must expose staff_device_lines.');
}
$staffDeviceSnapCsv = $reports->export('staff_device_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $staffDeviceSnapCsv['csv'], 'Devices sold (14d)') || !str_contains((string) $staffDeviceSnapCsv['csv'], 'Devices sold today')) {
    throw new RuntimeException('Staff device snapshot CSV must include Devices sold (14d) and Devices sold today rows.');
}
$staffDevicesCsv = $reports->export('staff_devices', $today, $today, (int) $branch['id']);
if (!str_contains((string) $staffDevicesCsv['csv'], 'Staff') || !str_contains((string) $staffDevicesCsv['csv'], 'IMEI')) {
    throw new RuntimeException('Staff devices CSV must include Staff and IMEI columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('staff_device_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose staff_device_snapshot.');
}
if (!array_key_exists('staff_device_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose staff_device_lines.');
}
$stockSnap = (new Atoms\Services\ReportService())->stockSnapshot((int) $branch['id']);
if (!array_key_exists('low_stock_count', $stockSnap) || !array_key_exists('imei_total', $stockSnap)) {
    throw new RuntimeException('Stock snapshot must expose low_stock_count and imei_total.');
}
$dashStock = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('stock_snapshot', $dashStock)) {
    throw new RuntimeException('Dashboard must expose stock_snapshot.');
}
if (!array_key_exists('low_stock_lines', $dashStock)) {
    throw new RuntimeException('Dashboard must expose low_stock_lines.');
}
$stockSnapCsv = $reports->export('stock_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $stockSnapCsv['csv'], 'Low stock alerts') || !str_contains((string) $stockSnapCsv['csv'], 'IMEI on hand')) {
    throw new RuntimeException('Stock snapshot CSV must include Low stock alerts and IMEI on hand rows.');
}
$lowStockCsv = $reports->export('low_stock', $today, $today, (int) $branch['id']);
if (!str_contains((string) $lowStockCsv['csv'], 'Product') || !str_contains((string) $lowStockCsv['csv'], 'Threshold')) {
    throw new RuntimeException('Low stock CSV must include Product and Threshold columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('stock_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose stock_snapshot.');
}
if (!array_key_exists('low_stock_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose low_stock_lines.');
}
$imeiSnap = (new Atoms\Services\ReportService())->imeiSnapshot((int) $branch['id']);
if (!array_key_exists('imei_total', $imeiSnap) || !array_key_exists('registered_today', $imeiSnap)) {
    throw new RuntimeException('IMEI snapshot must expose imei_total and registered_today.');
}
$dashImei = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('imei_snapshot', $dashImei)) {
    throw new RuntimeException('Dashboard must expose imei_snapshot.');
}
if (!array_key_exists('imei_status_lines', $dashImei)) {
    throw new RuntimeException('Dashboard must expose imei_status_lines for IMEI desk.');
}
if (!array_key_exists('today_imei_lines', $dashImei)) {
    throw new RuntimeException('Dashboard must expose today_imei_lines for IMEI desk.');
}
$imeiSnapCsv = $reports->export('imei_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $imeiSnapCsv['csv'], 'IMEI on hand') || !str_contains((string) $imeiSnapCsv['csv'], 'Registered today')) {
    throw new RuntimeException('IMEI snapshot CSV must include IMEI on hand and Registered today rows.');
}
$imeiStatusCsv = $reports->export('imei_status', $today, $today, (int) $branch['id']);
if (!str_contains((string) $imeiStatusCsv['csv'], 'Status') || !str_contains((string) $imeiStatusCsv['csv'], 'Qty')) {
    throw new RuntimeException('IMEI status CSV must include Status and Qty columns.');
}
$todayImeisCsv = $reports->export('today_imeis', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayImeisCsv['csv'], 'IMEI') || !str_contains((string) $todayImeisCsv['csv'], 'Device')) {
    throw new RuntimeException('Today IMEIs CSV must include IMEI and Device columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('imei_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose imei_snapshot.');
}
if (!array_key_exists('imei_status_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose imei_status_lines for IMEI desk.');
}
if (!array_key_exists('today_imei_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_imei_lines for IMEI desk.');
}
$transferSnap = (new Atoms\Services\ReportService())->transferSnapshot((int) $branch['id']);
if (!array_key_exists('in_transit_count', $transferSnap) || !array_key_exists('transfer_count_today', $transferSnap)) {
    throw new RuntimeException('Transfer snapshot must expose in_transit_count and transfer_count_today.');
}
$dashTransfer = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('transfer_snapshot', $dashTransfer)) {
    throw new RuntimeException('Dashboard must expose transfer_snapshot.');
}
if (!array_key_exists('transit_lines', $dashTransfer)) {
    throw new RuntimeException('Dashboard must expose transit_lines for transfer desk.');
}
if (!array_key_exists('stuck_transfer_lines', $dashTransfer)) {
    throw new RuntimeException('Dashboard must expose stuck_transfer_lines for transfer desk.');
}
if (!array_key_exists('today_transfer_lines', $dashTransfer)) {
    throw new RuntimeException('Dashboard must expose today_transfer_lines for transfer desk.');
}
$transferSnapCsv = $reports->export('transfer_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $transferSnapCsv['csv'], 'In transit now') || !str_contains((string) $transferSnapCsv['csv'], 'Received today')) {
    throw new RuntimeException('Transfer snapshot CSV must include In transit now and Received today rows.');
}
$recentTransfersCsv = $reports->export('recent_transfers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recentTransfersCsv['csv'], 'From') || !str_contains((string) $recentTransfersCsv['csv'], 'To')) {
    throw new RuntimeException('Recent transfers CSV must include From and To columns.');
}
$todayTransfersCsv = $reports->export('today_transfers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayTransfersCsv['csv'], 'Status') || !str_contains((string) $todayTransfersCsv['csv'], 'Devices')) {
    throw new RuntimeException('Today transfers CSV must include Status and Devices columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('transfer_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose transfer_snapshot.');
}
if (!array_key_exists('transit_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose transit_lines for transfer desk.');
}
if (!array_key_exists('stuck_transfer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose stuck_transfer_lines for transfer desk.');
}
if (!array_key_exists('today_transfer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_transfer_lines for transfer desk.');
}
$purchaseSnap = (new Atoms\Services\ReportService())->purchaseSnapshot((int) $branch['id']);
if (!array_key_exists('open_po_count', $purchaseSnap) || !array_key_exists('purchase_count_today', $purchaseSnap)) {
    throw new RuntimeException('Purchase snapshot must expose open_po_count and purchase_count_today.');
}
$dashPurchase = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('purchase_snapshot', $dashPurchase)) {
    throw new RuntimeException('Dashboard must expose purchase_snapshot.');
}
if (!array_key_exists('open_purchase_lines', $dashPurchase)) {
    throw new RuntimeException('Dashboard must expose open_purchase_lines for purchase desk.');
}
if (!array_key_exists('today_purchase_lines', $dashPurchase)) {
    throw new RuntimeException('Dashboard must expose today_purchase_lines for purchase desk.');
}
$purchaseSnapCsv = $reports->export('purchase_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $purchaseSnapCsv['csv'], 'Open purchase orders') || !str_contains((string) $purchaseSnapCsv['csv'], 'Purchases today')) {
    throw new RuntimeException('Purchase snapshot CSV must include Open purchase orders and Purchases today rows.');
}
$recentPurchasesCsv = $reports->export('recent_purchases', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recentPurchasesCsv['csv'], 'Supplier') || !str_contains((string) $recentPurchasesCsv['csv'], 'PO invoice')) {
    throw new RuntimeException('Recent purchases CSV must include Supplier and PO invoice columns.');
}
$todayPurchasesCsv = $reports->export('today_purchases', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayPurchasesCsv['csv'], 'Supplier') || !str_contains((string) $todayPurchasesCsv['csv'], 'Units')) {
    throw new RuntimeException('Today purchases CSV must include Supplier and Units columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('purchase_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose purchase_snapshot.');
}
if (!array_key_exists('open_purchase_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose open_purchase_lines for purchase desk.');
}
if (!array_key_exists('today_purchase_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_purchase_lines for purchase desk.');
}
$returnsSnap = (new Atoms\Services\ReportService())->returnsSnapshot((int) $branch['id']);
if (!array_key_exists('return_count_today', $returnsSnap) || !array_key_exists('swap_count_14d', $returnsSnap)) {
    throw new RuntimeException('Returns snapshot must expose return_count_today and swap_count_14d.');
}
$dashReturns = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('returns_snapshot', $dashReturns)) {
    throw new RuntimeException('Dashboard must expose returns_snapshot.');
}
if (!array_key_exists('return_lines', $dashReturns)) {
    throw new RuntimeException('Dashboard must expose return_lines for returns desk.');
}
if (!array_key_exists('today_return_lines', $dashReturns)) {
    throw new RuntimeException('Dashboard must expose today_return_lines for returns desk.');
}
if (!array_key_exists('today_swap_lines', $dashReturns)) {
    throw new RuntimeException('Dashboard must expose today_swap_lines for returns desk.');
}
$returnsSnapCsv = $reports->export('returns_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $returnsSnapCsv['csv'], 'Returns today') || !str_contains((string) $returnsSnapCsv['csv'], 'Swaps (14d)')) {
    throw new RuntimeException('Returns snapshot CSV must include Returns today and Swaps (14d) rows.');
}
$recentReturnsCsv = $reports->export('recent_returns', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recentReturnsCsv['csv'], 'Customer') || !str_contains((string) $recentReturnsCsv['csv'], 'Refund')) {
    throw new RuntimeException('Recent returns CSV must include Customer and Refund columns.');
}
$todayReturnsCsv = $reports->export('today_returns', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayReturnsCsv['csv'], 'Customer') || !str_contains((string) $todayReturnsCsv['csv'], 'Type')) {
    throw new RuntimeException('Today returns CSV must include Customer and Type columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('returns_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose returns_snapshot.');
}
if (!array_key_exists('return_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose return_lines for returns desk.');
}
if (!array_key_exists('today_return_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_return_lines for returns desk.');
}
if (!array_key_exists('today_swap_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_swap_lines for returns desk.');
}
$faultySnap = (new Atoms\Services\ReportService())->faultySnapshot((int) $branch['id']);
if (!array_key_exists('faulty_device_count', $faultySnap) || !array_key_exists('repair_completed_14d', $faultySnap)) {
    throw new RuntimeException('Faulty snapshot must expose faulty_device_count and repair_completed_14d.');
}
$dashFaulty = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('faulty_snapshot', $dashFaulty)) {
    throw new RuntimeException('Dashboard must expose faulty_snapshot.');
}
if (!array_key_exists('repair_lines', $dashFaulty)) {
    throw new RuntimeException('Dashboard must expose repair_lines for repair desk.');
}
if (!array_key_exists('faulty_lines', $dashFaulty)) {
    throw new RuntimeException('Dashboard must expose faulty_lines for repair desk.');
}
if (!array_key_exists('today_repair_lines', $dashFaulty)) {
    throw new RuntimeException('Dashboard must expose today_repair_lines for repair desk.');
}
$faultySnapCsv = $reports->export('faulty_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $faultySnapCsv['csv'], 'Faulty devices') || !str_contains((string) $faultySnapCsv['csv'], 'Repairs completed (14d)')) {
    throw new RuntimeException('Faulty snapshot CSV must include Faulty devices and Repairs completed (14d) rows.');
}
$openRepairsCsv = $reports->export('open_repairs', $today, $today, (int) $branch['id']);
if (!str_contains((string) $openRepairsCsv['csv'], 'Ticket') || !str_contains((string) $openRepairsCsv['csv'], 'Status')) {
    throw new RuntimeException('Open repairs CSV must include Ticket and Status columns.');
}
$faultyDevicesCsv = $reports->export('faulty_devices', $today, $today, (int) $branch['id']);
if (!str_contains((string) $faultyDevicesCsv['csv'], 'IMEI') || !str_contains((string) $faultyDevicesCsv['csv'], 'Device')) {
    throw new RuntimeException('Faulty devices CSV must include IMEI and Device columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('faulty_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose faulty_snapshot.');
}
if (!array_key_exists('repair_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose repair_lines for repair desk.');
}
if (!array_key_exists('faulty_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose faulty_lines for repair desk.');
}
if (!array_key_exists('today_repair_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_repair_lines for repair desk.');
}
$customerSnap = (new Atoms\Services\ReportService())->customerSnapshot((int) $branch['id']);
if (!array_key_exists('new_customers_today', $customerSnap) || !array_key_exists('receivable_total', $customerSnap)) {
    throw new RuntimeException('Customer snapshot must expose new_customers_today and receivable_total.');
}
$dashCustomer = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('customer_snapshot', $dashCustomer)) {
    throw new RuntimeException('Dashboard must expose customer_snapshot.');
}
if (!array_key_exists('receivable_party_lines', $dashCustomer)) {
    throw new RuntimeException('Dashboard must expose receivable_party_lines for customer desk.');
}
if (!array_key_exists('today_customer_lines', $dashCustomer)) {
    throw new RuntimeException('Dashboard must expose today_customer_lines for customer desk.');
}
if (!array_key_exists('recent_customer_lines', $dashCustomer)) {
    throw new RuntimeException('Dashboard must expose recent_customer_lines for customer desk.');
}
$customerSnapCsv = $reports->export('customer_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $customerSnapCsv['csv'], 'New customers today') || !str_contains((string) $customerSnapCsv['csv'], 'Customers owing')) {
    throw new RuntimeException('Customer snapshot CSV must include New customers today and Customers owing rows.');
}
$recentCustomersCsv = $reports->export('recent_customers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recentCustomersCsv['csv'], 'Customer') || !str_contains((string) $recentCustomersCsv['csv'], 'Balance')) {
    throw new RuntimeException('Recent customers CSV must include Customer and Balance columns.');
}
$todayCustomersCsv = $reports->export('today_customers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayCustomersCsv['csv'], 'Customer') || !str_contains((string) $todayCustomersCsv['csv'], 'Phone')) {
    throw new RuntimeException('Today customers CSV must include Customer and Phone columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('customer_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose customer_snapshot.');
}
if (!array_key_exists('receivable_party_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose receivable_party_lines for customer desk.');
}
if (!array_key_exists('today_customer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_customer_lines for customer desk.');
}
if (!array_key_exists('recent_customer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose recent_customer_lines for customer desk.');
}
$supplierSnap = (new Atoms\Services\ReportService())->supplierSnapshot((int) $branch['id']);
if (!array_key_exists('owing_supplier_count', $supplierSnap) || !array_key_exists('payable_total', $supplierSnap)) {
    throw new RuntimeException('Supplier snapshot must expose owing_supplier_count and payable_total.');
}
$dashSupplier = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('supplier_snapshot', $dashSupplier)) {
    throw new RuntimeException('Dashboard must expose supplier_snapshot.');
}
if (!array_key_exists('payable_party_lines', $dashSupplier)) {
    throw new RuntimeException('Dashboard must expose payable_party_lines for supplier desk.');
}
if (!array_key_exists('payable_lines', $dashSupplier)) {
    throw new RuntimeException('Dashboard must expose payable_lines for supplier desk.');
}
if (!array_key_exists('today_supplier_payment_lines', $dashSupplier)) {
    throw new RuntimeException('Dashboard must expose today_supplier_payment_lines for supplier desk.');
}
$supplierSnapCsv = $reports->export('supplier_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $supplierSnapCsv['csv'], 'Suppliers owing') || !str_contains((string) $supplierSnapCsv['csv'], 'Open purchase orders')) {
    throw new RuntimeException('Supplier snapshot CSV must include Suppliers owing and Open purchase orders rows.');
}
$payablesCsv = $reports->export('payables', $today, $today, (int) $branch['id']);
if (!str_contains((string) $payablesCsv['csv'], 'Supplier') || !str_contains((string) $payablesCsv['csv'], 'Balance')) {
    throw new RuntimeException('Payables CSV must include Supplier and Balance columns.');
}
$todaySupplierPayCsv = $reports->export('today_supplier_payments', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todaySupplierPayCsv['csv'], 'Supplier') || !str_contains((string) $todaySupplierPayCsv['csv'], 'Amount')) {
    throw new RuntimeException('Today supplier payments CSV must include Supplier and Amount columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('supplier_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose supplier_snapshot.');
}
if (!array_key_exists('payable_party_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payable_party_lines for supplier desk.');
}
if (!array_key_exists('payable_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payable_lines for supplier desk.');
}
if (!array_key_exists('today_supplier_payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_supplier_payment_lines for supplier desk.');
}
$countSnap = (new Atoms\Services\ReportService())->countSnapshot((int) $branch['id']);
if (!array_key_exists('open_count_count', $countSnap) || !array_key_exists('posted_today_count', $countSnap)) {
    throw new RuntimeException('Count snapshot must expose open_count_count and posted_today_count.');
}
$dashCount = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('count_snapshot', $dashCount)) {
    throw new RuntimeException('Dashboard must expose count_snapshot.');
}
if (!array_key_exists('stock_count_lines', $dashCount)) {
    throw new RuntimeException('Dashboard must expose stock_count_lines for count desk.');
}
if (!array_key_exists('posted_stock_count_lines', $dashCount)) {
    throw new RuntimeException('Dashboard must expose posted_stock_count_lines for count desk.');
}
if (!array_key_exists('today_stock_count_lines', $dashCount)) {
    throw new RuntimeException('Dashboard must expose today_stock_count_lines for count desk.');
}
$countSnapCsv = $reports->export('count_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $countSnapCsv['csv'], 'Open stock counts') || !str_contains((string) $countSnapCsv['csv'], 'Posted today')) {
    throw new RuntimeException('Count snapshot CSV must include Open stock counts and Posted today rows.');
}
$openCountsCsv = $reports->export('open_stock_counts', $today, $today, (int) $branch['id']);
if (!str_contains((string) $openCountsCsv['csv'], 'Count') || !str_contains((string) $openCountsCsv['csv'], 'Missing')) {
    throw new RuntimeException('Open stock counts CSV must include Count and Missing columns.');
}
$todayCountsCsv = $reports->export('today_stock_counts', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayCountsCsv['csv'], 'Count') || !str_contains((string) $todayCountsCsv['csv'], 'Posted')) {
    throw new RuntimeException('Today stock counts CSV must include Count and Posted columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('count_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose count_snapshot.');
}
if (!array_key_exists('stock_count_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose stock_count_lines for count desk.');
}
if (!array_key_exists('posted_stock_count_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose posted_stock_count_lines for count desk.');
}
if (!array_key_exists('today_stock_count_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_stock_count_lines for count desk.');
}
$approvalSnap = (new Atoms\Services\ReportService())->approvalSnapshot((int) $branch['id']);
if (!array_key_exists('pending_count', $approvalSnap) || !array_key_exists('reviewed_today_count', $approvalSnap)) {
    throw new RuntimeException('Approval snapshot must expose pending_count and reviewed_today_count.');
}
$dashApproval = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('approval_snapshot', $dashApproval)) {
    throw new RuntimeException('Dashboard must expose approval_snapshot.');
}
if (!array_key_exists('approval_lines', $dashApproval)) {
    throw new RuntimeException('Dashboard must expose approval_lines for approval desk.');
}
if (!array_key_exists('recent_approval_lines', $dashApproval)) {
    throw new RuntimeException('Dashboard must expose recent_approval_lines for approval desk.');
}
if (!array_key_exists('today_approval_lines', $dashApproval)) {
    throw new RuntimeException('Dashboard must expose today_approval_lines for approval desk.');
}
$approvalSnapCsv = $reports->export('approval_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $approvalSnapCsv['csv'], 'Pending approvals') || !str_contains((string) $approvalSnapCsv['csv'], 'Sell below minimum')) {
    throw new RuntimeException('Approval snapshot CSV must include Pending approvals and Sell below minimum rows.');
}
$pendingApprovalCsv = $reports->export('pending_approvals', $today, $today, (int) $branch['id']);
if (!str_contains((string) $pendingApprovalCsv['csv'], 'Request') || !str_contains((string) $pendingApprovalCsv['csv'], 'Type')) {
    throw new RuntimeException('Pending approvals CSV must include Request and Type columns.');
}
$todayApprovalCsv = $reports->export('today_approvals', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayApprovalCsv['csv'], 'Decision') || !str_contains((string) $todayApprovalCsv['csv'], 'Reviewer')) {
    throw new RuntimeException('Today approvals CSV must include Decision and Reviewer columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('approval_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose approval_snapshot.');
}
if (!array_key_exists('approval_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose approval_lines for approval desk.');
}
if (!array_key_exists('recent_approval_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose recent_approval_lines for approval desk.');
}
if (!array_key_exists('today_approval_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_approval_lines for approval desk.');
}
$expSnap = (new Atoms\Services\ExpenseService())->snapshot((int) $branch['id']);
if (!array_key_exists('category_count_14d', $expSnap) || !array_key_exists('largest_pending_amount', $expSnap)) {
    throw new RuntimeException('Expense snapshot must expose category_count_14d and largest_pending_amount.');
}
$dashExpense = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('expense_snapshot', $dashExpense)) {
    throw new RuntimeException('Dashboard must expose expense_snapshot.');
}
if (!array_key_exists('expense_lines', $dashExpense)) {
    throw new RuntimeException('Dashboard must expose expense_lines for expense desk.');
}
if (!array_key_exists('posted_expense_lines', $dashExpense)) {
    throw new RuntimeException('Dashboard must expose posted_expense_lines for expense desk.');
}
if (!array_key_exists('today_expense_lines', $dashExpense)) {
    throw new RuntimeException('Dashboard must expose today_expense_lines for expense desk.');
}
$expSnapCsv = $reports->export('expense_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $expSnapCsv['csv'], 'Categories (14 days)') || !str_contains((string) $expSnapCsv['csv'], 'Largest pending')) {
    throw new RuntimeException('Expense snapshot CSV must include Categories (14 days) and Largest pending rows.');
}
$pendingExpCsvDesk = $reports->export('pending_expenses', $today, $today, (int) $branch['id']);
if (!str_contains((string) $pendingExpCsvDesk['csv'], 'Expense') || !str_contains((string) $pendingExpCsvDesk['csv'], 'Amount')) {
    throw new RuntimeException('Pending expenses CSV must include Expense and Amount columns.');
}
$todayExpCsv = $reports->export('today_expenses', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayExpCsv['csv'], 'Category') || !str_contains((string) $todayExpCsv['csv'], 'Posted')) {
    throw new RuntimeException('Today expenses CSV must include Category and Posted columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('expense_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose expense_snapshot.');
}
if (!array_key_exists('expense_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose expense_lines for expense desk.');
}
if (!array_key_exists('posted_expense_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose posted_expense_lines for expense desk.');
}
if (!array_key_exists('today_expense_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_expense_lines for expense desk.');
}
$auditSnap = (new Atoms\Services\ReportService())->auditSnapshot((int) $branch['id']);
if (!array_key_exists('event_count_today', $auditSnap) || !array_key_exists('event_count_14d', $auditSnap)) {
    throw new RuntimeException('Audit snapshot must expose event_count_today and event_count_14d.');
}
$dashAudit = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('audit_snapshot', $dashAudit)) {
    throw new RuntimeException('Dashboard must expose audit_snapshot.');
}
if (!array_key_exists('audit_lines', $dashAudit)) {
    throw new RuntimeException('Dashboard must expose audit_lines for audit desk.');
}
if (!array_key_exists('today_audit_lines', $dashAudit)) {
    throw new RuntimeException('Dashboard must expose today_audit_lines for audit desk.');
}
$auditSnapCsv = $reports->export('audit_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $auditSnapCsv['csv'], 'Events today') || !str_contains((string) $auditSnapCsv['csv'], 'Inventory events')) {
    throw new RuntimeException('Audit snapshot CSV must include Events today and Inventory events rows.');
}
$recentAuditCsv = $reports->export('recent_audit', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recentAuditCsv['csv'], 'Action') || !str_contains((string) $recentAuditCsv['csv'], 'Summary')) {
    throw new RuntimeException('Recent audit CSV must include Action and Summary columns.');
}
$todayAuditCsv = $reports->export('today_audit', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayAuditCsv['csv'], 'When') || !str_contains((string) $todayAuditCsv['csv'], 'User')) {
    throw new RuntimeException('Today audit CSV must include When and User columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('audit_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose audit_snapshot.');
}
if (!array_key_exists('audit_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose audit_lines for audit desk.');
}
if (!array_key_exists('today_audit_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_audit_lines for audit desk.');
}
$collectionSnap = (new Atoms\Services\ReportService())->collectionSnapshot((int) $branch['id']);
if (!array_key_exists('collection_count_today', $collectionSnap) || !array_key_exists('receivable_total', $collectionSnap)) {
    throw new RuntimeException('Collection snapshot must expose collection_count_today and receivable_total.');
}
$dashCollection = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('collection_snapshot', $dashCollection)) {
    throw new RuntimeException('Dashboard must expose collection_snapshot.');
}
if (!array_key_exists('receivable_party_lines', $dashCollection)) {
    throw new RuntimeException('Dashboard must expose receivable_party_lines for collection desk.');
}
if (!array_key_exists('overdue_lines', $dashCollection)) {
    throw new RuntimeException('Dashboard must expose overdue_lines for collection desk.');
}
if (!array_key_exists('payment_lines', $dashCollection)) {
    throw new RuntimeException('Dashboard must expose payment_lines for collection desk.');
}
if (!array_key_exists('today_payment_lines', $dashCollection)) {
    throw new RuntimeException('Dashboard must expose today_payment_lines for collection desk.');
}
$collectionSnapCsv = $reports->export('collection_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $collectionSnapCsv['csv'], 'Collections today') || !str_contains((string) $collectionSnapCsv['csv'], 'Overdue invoices')) {
    throw new RuntimeException('Collection snapshot CSV must include Collections today and Overdue invoices rows.');
}
$receivablesCsvDesk = $reports->export('receivables', $today, $today, (int) $branch['id']);
if (!str_contains((string) $receivablesCsvDesk['csv'], 'Customer') || !str_contains((string) $receivablesCsvDesk['csv'], 'Balance')) {
    throw new RuntimeException('Receivables CSV must include Customer and Balance columns.');
}
$todayPayCsv = $reports->export('today_payments', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayPayCsv['csv'], 'Customer') || !str_contains((string) $todayPayCsv['csv'], 'Amount')) {
    throw new RuntimeException('Today payments CSV must include Customer and Amount columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('collection_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose collection_snapshot.');
}
if (!array_key_exists('receivable_party_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose receivable_party_lines for collection desk.');
}
if (!array_key_exists('overdue_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose overdue_lines for collection desk.');
}
if (!array_key_exists('payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payment_lines for collection desk.');
}
if (!array_key_exists('today_payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_payment_lines for collection desk.');
}
$alertSnap = (new Atoms\Services\ReportService())->alertSnapshot((int) $branch['id']);
if (!array_key_exists('unread_count', $alertSnap) || !array_key_exists('alert_count_today', $alertSnap)) {
    throw new RuntimeException('Alert snapshot must expose unread_count and alert_count_today.');
}
$dashAlert = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('alert_snapshot', $dashAlert)) {
    throw new RuntimeException('Dashboard must expose alert_snapshot.');
}
if (!array_key_exists('notify_lines', $dashAlert)) {
    throw new RuntimeException('Dashboard must expose notify_lines for alert desk.');
}
if (!array_key_exists('today_notify_lines', $dashAlert)) {
    throw new RuntimeException('Dashboard must expose today_notify_lines for alert desk.');
}
$alertSnapCsv = $reports->export('alert_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $alertSnapCsv['csv'], 'Unread alerts') || !str_contains((string) $alertSnapCsv['csv'], 'Alerts today')) {
    throw new RuntimeException('Alert snapshot CSV must include Unread alerts and Alerts today rows.');
}
$todayAlertsCsvDesk = $reports->export('today_alerts', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayAlertsCsvDesk['csv'], 'Title') || !str_contains((string) $todayAlertsCsvDesk['csv'], 'Type')) {
    throw new RuntimeException('Today alerts CSV must include Title and Type columns.');
}
$unreadAlertsCsv = $reports->export('unread_alerts', $today, $today, (int) $branch['id']);
if (!str_contains((string) $unreadAlertsCsv['csv'], 'Title') || !str_contains((string) $unreadAlertsCsv['csv'], 'Detail')) {
    throw new RuntimeException('Unread alerts CSV must include Title and Detail columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('alert_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose alert_snapshot.');
}
if (!array_key_exists('notify_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose notify_lines for alert desk.');
}
if (!array_key_exists('today_notify_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_notify_lines for alert desk.');
}
$salesSnap = (new Atoms\Services\ReportService())->salesSnapshot((int) $branch['id']);
if (!array_key_exists('sale_count_today', $salesSnap) || !array_key_exists('sale_total_today', $salesSnap)) {
    throw new RuntimeException('Sales snapshot must expose sale_count_today and sale_total_today.');
}
$dashSales = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('sales_snapshot', $dashSales)) {
    throw new RuntimeException('Dashboard must expose sales_snapshot.');
}
if (!array_key_exists('sale_lines', $dashSales)) {
    throw new RuntimeException('Dashboard must expose sale_lines for sales desk.');
}
if (!array_key_exists('today_sales_lines', $dashSales)) {
    throw new RuntimeException('Dashboard must expose today_sales_lines for sales desk.');
}
if (!array_key_exists('voided_lines', $dashSales)) {
    throw new RuntimeException('Dashboard must expose voided_lines for sales desk.');
}
if (!array_key_exists('today_voided_lines', $dashSales)) {
    throw new RuntimeException('Dashboard must expose today_voided_lines for sales desk.');
}
$salesSnapCsv = $reports->export('sales_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $salesSnapCsv['csv'], 'Sales today') || !str_contains((string) $salesSnapCsv['csv'], 'Collected today')) {
    throw new RuntimeException('Sales snapshot CSV must include Sales today and Collected today rows.');
}
$recentSalesCsv = $reports->export('recent_sales', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recentSalesCsv['csv'], 'Invoice') || !str_contains((string) $recentSalesCsv['csv'], 'Total')) {
    throw new RuntimeException('Recent sales CSV must include Invoice and Total columns.');
}
$todaySalesCsvDesk = $reports->export('today_sales', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todaySalesCsvDesk['csv'], 'Customer') || !str_contains((string) $todaySalesCsvDesk['csv'], 'Paid')) {
    throw new RuntimeException('Today sales CSV must include Customer and Paid columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('sales_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose sales_snapshot.');
}
if (!array_key_exists('sale_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose sale_lines for sales desk.');
}
if (!array_key_exists('today_sales_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_sales_lines for sales desk.');
}
if (!array_key_exists('voided_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose voided_lines for sales desk.');
}
if (!array_key_exists('today_voided_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_voided_lines for sales desk.');
}
$paymentSnap = (new Atoms\Services\ReportService())->paymentSnapshot((int) $branch['id']);
if (!array_key_exists('customer_payment_count_today', $paymentSnap) || !array_key_exists('customer_payment_total_today', $paymentSnap)) {
    throw new RuntimeException('Payment snapshot must expose customer_payment_count_today and customer_payment_total_today.');
}
$dashPayment = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('payment_snapshot', $dashPayment)) {
    throw new RuntimeException('Dashboard must expose payment_snapshot.');
}
if (!array_key_exists('payment_lines', $dashPayment)) {
    throw new RuntimeException('Dashboard must expose payment_lines for payments desk.');
}
if (!array_key_exists('today_payment_lines', $dashPayment)) {
    throw new RuntimeException('Dashboard must expose today_payment_lines for payments desk.');
}
if (!array_key_exists('supplier_payment_lines', $dashPayment)) {
    throw new RuntimeException('Dashboard must expose supplier_payment_lines for payments desk.');
}
if (!array_key_exists('today_supplier_payment_lines', $dashPayment)) {
    throw new RuntimeException('Dashboard must expose today_supplier_payment_lines for payments desk.');
}
if (!array_key_exists('reversal_lines', $dashPayment)) {
    throw new RuntimeException('Dashboard must expose reversal_lines for payments desk.');
}
if (!array_key_exists('today_reversal_lines', $dashPayment)) {
    throw new RuntimeException('Dashboard must expose today_reversal_lines for payments desk.');
}
$paymentSnapCsv = $reports->export('payment_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $paymentSnapCsv['csv'], 'Customer payments today') || !str_contains((string) $paymentSnapCsv['csv'], 'Supplier payments today')) {
    throw new RuntimeException('Payment snapshot CSV must include Customer payments today and Supplier payments today rows.');
}
$recentPaymentsCsv = $reports->export('recent_payments', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recentPaymentsCsv['csv'], 'Customer') || !str_contains((string) $recentPaymentsCsv['csv'], 'Amount')) {
    throw new RuntimeException('Recent payments CSV must include Customer and Amount columns.');
}
$todayPaymentsCsvDesk = $reports->export('today_payments', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayPaymentsCsvDesk['csv'], 'Customer') || !str_contains((string) $todayPaymentsCsvDesk['csv'], 'Method')) {
    throw new RuntimeException('Today payments CSV must include Customer and Method columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('payment_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose payment_snapshot.');
}
if (!array_key_exists('payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payment_lines for payments desk.');
}
if (!array_key_exists('today_payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_payment_lines for payments desk.');
}
if (!array_key_exists('supplier_payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose supplier_payment_lines for payments desk.');
}
if (!array_key_exists('today_supplier_payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_supplier_payment_lines for payments desk.');
}
if (!array_key_exists('reversal_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose reversal_lines for payments desk.');
}
if (!array_key_exists('today_reversal_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_reversal_lines for payments desk.');
}
$swapSnap = (new Atoms\Services\ReportService())->swapSnapshot((int) $branch['id']);
if (!array_key_exists('swap_count_today', $swapSnap) || !array_key_exists('collected_today', $swapSnap)) {
    throw new RuntimeException('Swap snapshot must expose swap_count_today and collected_today.');
}
$dashSwap = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('swap_snapshot', $dashSwap)) {
    throw new RuntimeException('Dashboard must expose swap_snapshot.');
}
if (!array_key_exists('swap_lines', $dashSwap)) {
    throw new RuntimeException('Dashboard must expose swap_lines for swap desk.');
}
if (!array_key_exists('today_swap_lines', $dashSwap)) {
    throw new RuntimeException('Dashboard must expose today_swap_lines for swap desk.');
}
$swapSnapCsv = $reports->export('swap_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $swapSnapCsv['csv'], 'Swaps today') || !str_contains((string) $swapSnapCsv['csv'], 'Upgrades (14d)')) {
    throw new RuntimeException('Swap snapshot CSV must include Swaps today and Upgrades (14d) rows.');
}
$recentSwapsCsvDesk = $reports->export('recent_swaps', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recentSwapsCsvDesk['csv'], 'Customer') || !str_contains((string) $recentSwapsCsvDesk['csv'], 'Collected')) {
    throw new RuntimeException('Recent swaps CSV must include Customer and Collected columns.');
}
$todaySwapsCsvDesk = $reports->export('today_swaps', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todaySwapsCsvDesk['csv'], 'Customer') || !str_contains((string) $todaySwapsCsvDesk['csv'], 'Difference')) {
    throw new RuntimeException('Today swaps CSV must include Customer and Difference columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('swap_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose swap_snapshot.');
}
if (!array_key_exists('swap_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose swap_lines for swap desk.');
}
if (!array_key_exists('today_swap_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_swap_lines for swap desk.');
}
$returnSnap = (new Atoms\Services\ReportService())->returnSnapshot((int) $branch['id']);
if (!array_key_exists('return_count_today', $returnSnap) || !array_key_exists('return_total_today', $returnSnap)) {
    throw new RuntimeException('Return snapshot must expose return_count_today and return_total_today.');
}
$dashReturn = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('return_snapshot', $dashReturn)) {
    throw new RuntimeException('Dashboard must expose return_snapshot.');
}
if (!array_key_exists('return_lines', $dashReturn)) {
    throw new RuntimeException('Dashboard must expose return_lines for return desk.');
}
if (!array_key_exists('today_return_lines', $dashReturn)) {
    throw new RuntimeException('Dashboard must expose today_return_lines for return desk.');
}
$returnSnapCsv = $reports->export('return_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $returnSnapCsv['csv'], 'Returns today') || !str_contains((string) $returnSnapCsv['csv'], 'Refund resolutions (14d)')) {
    throw new RuntimeException('Return snapshot CSV must include Returns today and Refund resolutions (14d) rows.');
}
$recentReturnsCsvDesk = $reports->export('recent_returns', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recentReturnsCsvDesk['csv'], 'Customer') || !str_contains((string) $recentReturnsCsvDesk['csv'], 'Refund')) {
    throw new RuntimeException('Recent returns CSV must include Customer and Refund columns.');
}
$todayReturnsCsvDesk = $reports->export('today_returns', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayReturnsCsvDesk['csv'], 'Customer') || !str_contains((string) $todayReturnsCsvDesk['csv'], 'Resolution')) {
    throw new RuntimeException('Today returns CSV must include Customer and Resolution columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('return_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose return_snapshot.');
}
if (!array_key_exists('return_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose return_lines for return desk.');
}
if (!array_key_exists('today_return_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_return_lines for return desk.');
}
$adjustmentSnap = (new Atoms\Services\ReportService())->adjustmentSnapshot((int) $branch['id']);
if (!array_key_exists('reversal_count_today', $adjustmentSnap) || !array_key_exists('voided_count_today', $adjustmentSnap)) {
    throw new RuntimeException('Adjustment snapshot must expose reversal_count_today and voided_count_today.');
}
$dashAdjustment = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('adjustment_snapshot', $dashAdjustment)) {
    throw new RuntimeException('Dashboard must expose adjustment_snapshot.');
}
if (!array_key_exists('reversal_lines', $dashAdjustment)) {
    throw new RuntimeException('Dashboard must expose reversal_lines for adjustments desk.');
}
if (!array_key_exists('today_reversal_lines', $dashAdjustment)) {
    throw new RuntimeException('Dashboard must expose today_reversal_lines for adjustments desk.');
}
if (!array_key_exists('voided_lines', $dashAdjustment)) {
    throw new RuntimeException('Dashboard must expose voided_lines for adjustments desk.');
}
if (!array_key_exists('today_voided_lines', $dashAdjustment)) {
    throw new RuntimeException('Dashboard must expose today_voided_lines for adjustments desk.');
}
$adjustmentSnapCsv = $reports->export('adjustment_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $adjustmentSnapCsv['csv'], 'Reversals today') || !str_contains((string) $adjustmentSnapCsv['csv'], 'Voided sales today')) {
    throw new RuntimeException('Adjustment snapshot CSV must include Reversals today and Voided sales today rows.');
}
$todayReversalsCsvDesk = $reports->export('today_reversals', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayReversalsCsvDesk['csv'], 'Customer') || !str_contains((string) $todayReversalsCsvDesk['csv'], 'Amount')) {
    throw new RuntimeException('Today reversals CSV must include Customer and Amount columns.');
}
$todayVoidedCsvDesk = $reports->export('today_voided_sales', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayVoidedCsvDesk['csv'], 'Customer') || !str_contains((string) $todayVoidedCsvDesk['csv'], 'Total')) {
    throw new RuntimeException('Today voided sales CSV must include Customer and Total columns.');
}
$analytics = (new Atoms\Services\AnalyticsService())->overview(14, (int) $branch['id']);
if (!array_key_exists('adjustment_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose adjustment_snapshot.');
}
if (!array_key_exists('reversal_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose reversal_lines for adjustments desk.');
}
if (!array_key_exists('today_reversal_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_reversal_lines for adjustments desk.');
}
if (!array_key_exists('voided_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose voided_lines for adjustments desk.');
}
if (!array_key_exists('today_voided_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_voided_lines for adjustments desk.');
}
if (!array_key_exists('procurement_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose procurement_snapshot.');
}
if (!array_key_exists('open_purchase_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose open_purchase_lines for procurement desk.');
}
if (!array_key_exists('purchase_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose purchase_lines for procurement desk.');
}
if (!array_key_exists('today_purchase_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_purchase_lines for procurement desk.');
}
$procurementSnap = (new Atoms\Services\ReportService())->procurementSnapshot((int) $branch['id']);
if (!array_key_exists('open_po_count', $procurementSnap) || !array_key_exists('purchase_count_14d', $procurementSnap)) {
    throw new RuntimeException('Procurement snapshot must expose open_po_count and purchase_count_14d.');
}
$dashProcurement = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('procurement_snapshot', $dashProcurement)) {
    throw new RuntimeException('Dashboard must expose procurement_snapshot.');
}
if (!array_key_exists('open_purchase_lines', $dashProcurement)) {
    throw new RuntimeException('Dashboard must expose open_purchase_lines for procurement desk.');
}
if (!array_key_exists('purchase_lines', $dashProcurement)) {
    throw new RuntimeException('Dashboard must expose purchase_lines for procurement desk.');
}
if (!array_key_exists('today_purchase_lines', $dashProcurement)) {
    throw new RuntimeException('Dashboard must expose today_purchase_lines for procurement desk.');
}
$procurementSnapCsv = $reports->export('procurement_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $procurementSnapCsv['csv'], 'Open purchase orders') || !str_contains((string) $procurementSnapCsv['csv'], 'Purchases (14 days)')) {
    throw new RuntimeException('Procurement snapshot CSV must include Open purchase orders and Purchases (14 days) rows.');
}
$todayPurchasesCsvDesk = $reports->export('today_purchases', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayPurchasesCsvDesk['csv'], 'Supplier') || !str_contains((string) $todayPurchasesCsvDesk['csv'], 'Total')) {
    throw new RuntimeException('Today purchases CSV must include Supplier and Total columns.');
}
$receivingSnap = (new Atoms\Services\ReportService())->receivingSnapshot((int) $branch['id']);
if (!array_key_exists('purchase_count_today', $receivingSnap) || !array_key_exists('receiving_count_14d', $receivingSnap)) {
    throw new RuntimeException('Receiving snapshot must expose purchase_count_today and receiving_count_14d.');
}
$dashReceiving = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('receiving_snapshot', $dashReceiving)) {
    throw new RuntimeException('Dashboard must expose receiving_snapshot.');
}
if (!array_key_exists('today_purchase_lines', $dashReceiving)) {
    throw new RuntimeException('Dashboard must expose today_purchase_lines for receiving desk.');
}
if (!array_key_exists('today_imei_lines', $dashReceiving)) {
    throw new RuntimeException('Dashboard must expose today_imei_lines for receiving desk.');
}
if (!array_key_exists('today_supplier_payment_lines', $dashReceiving)) {
    throw new RuntimeException('Dashboard must expose today_supplier_payment_lines for receiving desk.');
}
if (!array_key_exists('today_swap_lines', $dashReceiving)) {
    throw new RuntimeException('Dashboard must expose today_swap_lines for receiving desk.');
}
if (!array_key_exists('today_supplier_return_lines', $dashReceiving)) {
    throw new RuntimeException('Dashboard must expose today_supplier_return_lines for receiving desk.');
}
$receivingSnapCsv = $reports->export('receiving_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $receivingSnapCsv['csv'], 'Purchases today') || !str_contains((string) $receivingSnapCsv['csv'], 'Receiving events (14 days)')) {
    throw new RuntimeException('Receiving snapshot CSV must include Purchases today and Receiving events (14 days) rows.');
}
$todayImeisCsvDesk = $reports->export('today_imeis', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayImeisCsvDesk['csv'], 'IMEI') || !str_contains((string) $todayImeisCsvDesk['csv'], 'Device')) {
    throw new RuntimeException('Today IMEIs CSV must include IMEI and Device columns.');
}
$todaySupplierPaymentsCsvDesk = $reports->export('today_supplier_payments', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todaySupplierPaymentsCsvDesk['csv'], 'Supplier') || !str_contains((string) $todaySupplierPaymentsCsvDesk['csv'], 'Amount')) {
    throw new RuntimeException('Today supplier payments CSV must include Supplier and Amount columns.');
}
if (!array_key_exists('receiving_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose receiving_snapshot.');
}
if (!array_key_exists('recent_imei_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose recent_imei_lines for receiving desk.');
}
if (!array_key_exists('today_imei_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_imei_lines for receiving desk.');
}
if (!array_key_exists('today_supplier_payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_supplier_payment_lines for receiving desk.');
}
if (!array_key_exists('today_swap_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_swap_lines for receiving desk.');
}
if (!array_key_exists('today_supplier_return_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_supplier_return_lines for receiving desk.');
}
$payableSnap = (new Atoms\Services\ReportService())->payableSnapshot((int) $branch['id']);
if (!array_key_exists('owing_supplier_count', $payableSnap) || !array_key_exists('supplier_payment_count_14d', $payableSnap)) {
    throw new RuntimeException('Payable snapshot must expose owing_supplier_count and supplier_payment_count_14d.');
}
$dashPayable = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('payable_snapshot', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose payable_snapshot.');
}
if (!array_key_exists('payable_party_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose payable_party_lines for payables desk.');
}
if (!array_key_exists('payable_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose payable_lines for payables desk.');
}
if (!array_key_exists('supplier_payment_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose supplier_payment_lines for payables desk.');
}
if (!array_key_exists('today_supplier_payment_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose today_supplier_payment_lines for payables desk.');
}
if (!array_key_exists('supplier_return_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose supplier_return_lines for payables desk.');
}
if (!array_key_exists('today_supplier_return_lines', $dashPayable)) {
    throw new RuntimeException('Dashboard must expose today_supplier_return_lines for payables desk.');
}
$payableSnapCsv = $reports->export('payable_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $payableSnapCsv['csv'], 'Suppliers owing') || !str_contains((string) $payableSnapCsv['csv'], 'Supplier payments (14 days)')) {
    throw new RuntimeException('Payable snapshot CSV must include Suppliers owing and Supplier payments (14 days) rows.');
}
$payablesCsvDesk = $reports->export('payables', $today, $today, (int) $branch['id']);
if (!str_contains((string) $payablesCsvDesk['csv'], 'Supplier') || !str_contains((string) $payablesCsvDesk['csv'], 'Balance')) {
    throw new RuntimeException('Payables CSV must include Supplier and Balance columns.');
}
$supplierPaymentsCsvDesk = $reports->export('supplier_payments', $today, $today, (int) $branch['id']);
if (!str_contains((string) $supplierPaymentsCsvDesk['csv'], 'Supplier') || !str_contains((string) $supplierPaymentsCsvDesk['csv'], 'Amount')) {
    throw new RuntimeException('Supplier payments CSV must include Supplier and Amount columns.');
}
if (!array_key_exists('payable_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose payable_snapshot.');
}
if (!array_key_exists('payable_party_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payable_party_lines for payables desk.');
}
if (!array_key_exists('payable_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payable_lines for payables desk.');
}
if (!array_key_exists('supplier_payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose supplier_payment_lines for payables desk.');
}
if (!array_key_exists('supplier_return_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose supplier_return_lines for payables desk.');
}
$receivableSnap = (new Atoms\Services\ReportService())->receivableSnapshot((int) $branch['id']);
if (!array_key_exists('owing_customer_count', $receivableSnap) || !array_key_exists('collection_count_14d', $receivableSnap)) {
    throw new RuntimeException('Receivable snapshot must expose owing_customer_count and collection_count_14d.');
}
$dashReceivable = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('receivable_snapshot', $dashReceivable)) {
    throw new RuntimeException('Dashboard must expose receivable_snapshot.');
}
if (!array_key_exists('receivable_party_lines', $dashReceivable)) {
    throw new RuntimeException('Dashboard must expose receivable_party_lines for receivables desk.');
}
if (!array_key_exists('overdue_lines', $dashReceivable)) {
    throw new RuntimeException('Dashboard must expose overdue_lines for receivables desk.');
}
if (!array_key_exists('payment_lines', $dashReceivable)) {
    throw new RuntimeException('Dashboard must expose payment_lines for receivables desk.');
}
if (!array_key_exists('today_payment_lines', $dashReceivable)) {
    throw new RuntimeException('Dashboard must expose today_payment_lines for receivables desk.');
}
if (!array_key_exists('recent_customer_lines', $dashReceivable)) {
    throw new RuntimeException('Dashboard must expose recent_customer_lines for receivables desk.');
}
if (!array_key_exists('today_customer_lines', $dashReceivable)) {
    throw new RuntimeException('Dashboard must expose today_customer_lines for receivables desk.');
}
$receivableSnapCsv = $reports->export('receivable_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $receivableSnapCsv['csv'], 'Customers owing') || !str_contains((string) $receivableSnapCsv['csv'], 'Collections (14 days)')) {
    throw new RuntimeException('Receivable snapshot CSV must include Customers owing and Collections (14 days) rows.');
}
$receivablesCsvDesk = $reports->export('receivables', $today, $today, (int) $branch['id']);
if (!str_contains((string) $receivablesCsvDesk['csv'], 'Customer') || !str_contains((string) $receivablesCsvDesk['csv'], 'Balance')) {
    throw new RuntimeException('Receivables CSV must include Customer and Balance columns.');
}
$todayPaymentsCsvDesk = $reports->export('today_payments', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayPaymentsCsvDesk['csv'], 'Customer') || !str_contains((string) $todayPaymentsCsvDesk['csv'], 'Amount')) {
    throw new RuntimeException('Today payments CSV must include Customer and Amount columns.');
}
if (!array_key_exists('receivable_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose receivable_snapshot.');
}
if (!array_key_exists('receivable_party_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose receivable_party_lines for receivables desk.');
}
if (!array_key_exists('overdue_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose overdue_lines for receivables desk.');
}
if (!array_key_exists('recent_customer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose recent_customer_lines for receivables desk.');
}
if (!array_key_exists('today_customer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_customer_lines for receivables desk.');
}
$workflowSnap = (new Atoms\Services\ReportService())->workflowSnapshot((int) $branch['id']);
if (!array_key_exists('open_repair_count', $workflowSnap) || !array_key_exists('workflow_events_14d', $workflowSnap)) {
    throw new RuntimeException('Workflow snapshot must expose open_repair_count and workflow_events_14d.');
}
$dashWorkflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('workflow_snapshot', $dashWorkflow)) {
    throw new RuntimeException('Dashboard must expose workflow_snapshot.');
}
if (!array_key_exists('repair_lines', $dashWorkflow)) {
    throw new RuntimeException('Dashboard must expose repair_lines for workflow desk.');
}
if (!array_key_exists('stuck_repair_lines', $dashWorkflow)) {
    throw new RuntimeException('Dashboard must expose stuck_repair_lines for workflow desk.');
}
if (!array_key_exists('transit_lines', $dashWorkflow)) {
    throw new RuntimeException('Dashboard must expose transit_lines for workflow desk.');
}
if (!array_key_exists('stuck_transfer_lines', $dashWorkflow)) {
    throw new RuntimeException('Dashboard must expose stuck_transfer_lines for workflow desk.');
}
if (!array_key_exists('approval_lines', $dashWorkflow)) {
    throw new RuntimeException('Dashboard must expose approval_lines for workflow desk.');
}
if (!array_key_exists('today_repair_lines', $dashWorkflow)) {
    throw new RuntimeException('Dashboard must expose today_repair_lines for workflow desk.');
}
if (!array_key_exists('today_transfer_lines', $dashWorkflow)) {
    throw new RuntimeException('Dashboard must expose today_transfer_lines for workflow desk.');
}
if (!array_key_exists('today_approval_lines', $dashWorkflow)) {
    throw new RuntimeException('Dashboard must expose today_approval_lines for workflow desk.');
}
$workflowSnapCsv = $reports->export('workflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $workflowSnapCsv['csv'], 'Open repairs') || !str_contains((string) $workflowSnapCsv['csv'], 'Workflow events (14 days)')) {
    throw new RuntimeException('Workflow snapshot CSV must include Open repairs and Workflow events (14 days) rows.');
}
$todayRepairsCsvDesk = $reports->export('today_repairs', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayRepairsCsvDesk['csv'], 'Ticket') || !str_contains((string) $todayRepairsCsvDesk['csv'], 'Customer')) {
    throw new RuntimeException('Today repairs CSV must include Ticket and Customer columns.');
}
$todayTransfersCsvDesk = $reports->export('today_transfers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayTransfersCsvDesk['csv'], 'Transfer') || !str_contains((string) $todayTransfersCsvDesk['csv'], 'Status')) {
    throw new RuntimeException('Today transfers CSV must include Transfer and Status columns.');
}
if (!array_key_exists('workflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose workflow_snapshot.');
}
if (!array_key_exists('repair_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose repair_lines for workflow desk.');
}
if (!array_key_exists('transit_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose transit_lines for workflow desk.');
}
if (!array_key_exists('approval_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose approval_lines for workflow desk.');
}
if (!array_key_exists('today_repair_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_repair_lines for workflow desk.');
}
if (!array_key_exists('today_transfer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_transfer_lines for workflow desk.');
}
$transitSnap = (new Atoms\Services\ReportService())->transitSnapshot((int) $branch['id']);
if (!array_key_exists('in_transit_count', $transitSnap) || !array_key_exists('transfer_count_14d', $transitSnap)) {
    throw new RuntimeException('Transit snapshot must expose in_transit_count and transfer_count_14d.');
}
$dashTransit = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('transit_snapshot', $dashTransit)) {
    throw new RuntimeException('Dashboard must expose transit_snapshot.');
}
if (!array_key_exists('transit_lines', $dashTransit)) {
    throw new RuntimeException('Dashboard must expose transit_lines for transit desk.');
}
if (!array_key_exists('stuck_transfer_lines', $dashTransit)) {
    throw new RuntimeException('Dashboard must expose stuck_transfer_lines for transit desk.');
}
if (!array_key_exists('recent_transfer_lines', $dashTransit)) {
    throw new RuntimeException('Dashboard must expose recent_transfer_lines for transit desk.');
}
if (!array_key_exists('today_transfer_lines', $dashTransit)) {
    throw new RuntimeException('Dashboard must expose today_transfer_lines for transit desk.');
}
$transitSnapCsv = $reports->export('transit_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $transitSnapCsv['csv'], 'In transit now') || !str_contains((string) $transitSnapCsv['csv'], 'Transfers (14 days)')) {
    throw new RuntimeException('Transit snapshot CSV must include In transit now and Transfers (14 days) rows.');
}
$recentTransfersCsvDesk = $reports->export('recent_transfers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recentTransfersCsvDesk['csv'], 'Transfer') || !str_contains((string) $recentTransfersCsvDesk['csv'], 'Status')) {
    throw new RuntimeException('Recent transfers CSV must include Transfer and Status columns.');
}
if (!array_key_exists('transit_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose transit_snapshot.');
}
if (!array_key_exists('transit_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose transit_lines for transit desk.');
}
if (!array_key_exists('stuck_transfer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose stuck_transfer_lines for transit desk.');
}
if (!array_key_exists('recent_transfer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose recent_transfer_lines for transit desk.');
}

$stockflowSnap = (new Atoms\Services\ReportService())->stockflowSnapshot((int) $branch['id']);
if (!array_key_exists('available_qty', $stockflowSnap) || !array_key_exists('imei_registered_14d', $stockflowSnap)) {
    throw new RuntimeException('Stockflow snapshot must expose available_qty and imei_registered_14d.');
}
$dashStockflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('stockflow_snapshot', $dashStockflow)) {
    throw new RuntimeException('Dashboard must expose stockflow_snapshot.');
}
if (!array_key_exists('inventory_lines', $dashStockflow)) {
    throw new RuntimeException('Dashboard must expose inventory_lines for stockflow desk.');
}
if (!array_key_exists('low_stock', $dashStockflow)) {
    throw new RuntimeException('Dashboard must expose low_stock for stockflow desk.');
}
if (!array_key_exists('imei_status_lines', $dashStockflow)) {
    throw new RuntimeException('Dashboard must expose imei_status_lines for stockflow desk.');
}
if (!array_key_exists('recent_imei_lines', $dashStockflow)) {
    throw new RuntimeException('Dashboard must expose recent_imei_lines for stockflow desk.');
}
if (!array_key_exists('today_imei_lines', $dashStockflow)) {
    throw new RuntimeException('Dashboard must expose today_imei_lines for stockflow desk.');
}
$stockflowSnapCsv = $reports->export('stockflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $stockflowSnapCsv['csv'], 'Available stock') || !str_contains((string) $stockflowSnapCsv['csv'], 'IMEI registered (14 days)')) {
    throw new RuntimeException('Stockflow snapshot CSV must include Available stock and IMEI registered (14 days) rows.');
}
$lowStockCsvDesk = $reports->export('low_stock', $today, $today, (int) $branch['id']);
if (!str_contains((string) $lowStockCsvDesk['csv'], 'Threshold') || !str_contains((string) $lowStockCsvDesk['csv'], 'Available')) {
    throw new RuntimeException('Low stock CSV must include Threshold and Available columns.');
}
if (!array_key_exists('stockflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose stockflow_snapshot.');
}
if (!array_key_exists('inventory_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose inventory_lines for stockflow desk.');
}
if (!array_key_exists('low_stock_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose low_stock_lines for stockflow desk.');
}
if (!array_key_exists('imei_status_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose imei_status_lines for stockflow desk.');
}
if (!array_key_exists('recent_imei_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose recent_imei_lines for stockflow desk.');
}

$serviceSnap = (new Atoms\Services\ReportService())->serviceSnapshot((int) $branch['id']);
if (!array_key_exists('open_repair_count', $serviceSnap) || !array_key_exists('repair_intake_14d', $serviceSnap)) {
    throw new RuntimeException('Service snapshot must expose open_repair_count and repair_intake_14d.');
}
$dashService = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('service_snapshot', $dashService)) {
    throw new RuntimeException('Dashboard must expose service_snapshot.');
}
if (!array_key_exists('repair_lines', $dashService)) {
    throw new RuntimeException('Dashboard must expose repair_lines for service desk.');
}
if (!array_key_exists('stuck_repair_lines', $dashService)) {
    throw new RuntimeException('Dashboard must expose stuck_repair_lines for service desk.');
}
if (!array_key_exists('faulty_lines', $dashService)) {
    throw new RuntimeException('Dashboard must expose faulty_lines for service desk.');
}
if (!array_key_exists('stuck_faulty_lines', $dashService)) {
    throw new RuntimeException('Dashboard must expose stuck_faulty_lines for service desk.');
}
if (!array_key_exists('completed_repair_lines', $dashService)) {
    throw new RuntimeException('Dashboard must expose completed_repair_lines for service desk.');
}
if (!array_key_exists('today_repair_lines', $dashService)) {
    throw new RuntimeException('Dashboard must expose today_repair_lines for service desk.');
}
$serviceSnapCsv = $reports->export('service_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $serviceSnapCsv['csv'], 'Open repairs') || !str_contains((string) $serviceSnapCsv['csv'], 'Repair intake (14 days)')) {
    throw new RuntimeException('Service snapshot CSV must include Open repairs and Repair intake (14 days) rows.');
}
$openRepairsCsvDesk = $reports->export('open_repairs', $today, $today, (int) $branch['id']);
if (!str_contains((string) $openRepairsCsvDesk['csv'], 'Ticket') || !str_contains((string) $openRepairsCsvDesk['csv'], 'Status')) {
    throw new RuntimeException('Open repairs CSV must include Ticket and Status columns.');
}
if (!array_key_exists('service_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose service_snapshot.');
}
if (!array_key_exists('repair_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose repair_lines for service desk.');
}
if (!array_key_exists('stuck_repair_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose stuck_repair_lines for service desk.');
}
if (!array_key_exists('faulty_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose faulty_lines for service desk.');
}
if (!array_key_exists('completed_repair_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose completed_repair_lines for service desk.');
}

$countflowSnap = (new Atoms\Services\ReportService())->countflowSnapshot((int) $branch['id']);
if (!array_key_exists('open_count_count', $countflowSnap) || !array_key_exists('posted_14d_count', $countflowSnap)) {
    throw new RuntimeException('Countflow snapshot must expose open_count_count and posted_14d_count.');
}
$dashCountflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('countflow_snapshot', $dashCountflow)) {
    throw new RuntimeException('Dashboard must expose countflow_snapshot.');
}
if (!array_key_exists('stock_count_lines', $dashCountflow)) {
    throw new RuntimeException('Dashboard must expose stock_count_lines for countflow desk.');
}
if (!array_key_exists('posted_stock_count_lines', $dashCountflow)) {
    throw new RuntimeException('Dashboard must expose posted_stock_count_lines for countflow desk.');
}
if (!array_key_exists('today_stock_count_lines', $dashCountflow)) {
    throw new RuntimeException('Dashboard must expose today_stock_count_lines for countflow desk.');
}
$countflowSnapCsv = $reports->export('countflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $countflowSnapCsv['csv'], 'Open stock counts') || !str_contains((string) $countflowSnapCsv['csv'], 'Posted (14 days)')) {
    throw new RuntimeException('Countflow snapshot CSV must include Open stock counts and Posted (14 days) rows.');
}
$openCountsCsvDesk = $reports->export('open_stock_counts', $today, $today, (int) $branch['id']);
if (!str_contains((string) $openCountsCsvDesk['csv'], 'Missing') || !str_contains((string) $openCountsCsvDesk['csv'], 'Status')) {
    throw new RuntimeException('Open stock counts CSV must include Missing and Status columns.');
}
if (!array_key_exists('countflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose countflow_snapshot.');
}
if (!array_key_exists('stock_count_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose stock_count_lines for countflow desk.');
}
if (!array_key_exists('posted_stock_count_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose posted_stock_count_lines for countflow desk.');
}
if (!array_key_exists('today_stock_count_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_stock_count_lines for countflow desk.');
}

$approvalflowSnap = (new Atoms\Services\ReportService())->approvalflowSnapshot((int) $branch['id']);
if (!array_key_exists('pending_count', $approvalflowSnap) || !array_key_exists('approved_14d_count', $approvalflowSnap)) {
    throw new RuntimeException('Approvalflow snapshot must expose pending_count and approved_14d_count.');
}
$dashApprovalflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('approvalflow_snapshot', $dashApprovalflow)) {
    throw new RuntimeException('Dashboard must expose approvalflow_snapshot.');
}
if (!array_key_exists('approval_lines', $dashApprovalflow)) {
    throw new RuntimeException('Dashboard must expose approval_lines for approvalflow desk.');
}
if (!array_key_exists('recent_approval_lines', $dashApprovalflow)) {
    throw new RuntimeException('Dashboard must expose recent_approval_lines for approvalflow desk.');
}
if (!array_key_exists('today_approval_lines', $dashApprovalflow)) {
    throw new RuntimeException('Dashboard must expose today_approval_lines for approvalflow desk.');
}
$approvalflowSnapCsv = $reports->export('approvalflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $approvalflowSnapCsv['csv'], 'Pending approvals') || !str_contains((string) $approvalflowSnapCsv['csv'], 'Approved (14 days)')) {
    throw new RuntimeException('Approvalflow snapshot CSV must include Pending approvals and Approved (14 days) rows.');
}
$pendingApprovalsCsvDesk = $reports->export('pending_approvals', $today, $today, (int) $branch['id']);
if (!str_contains((string) $pendingApprovalsCsvDesk['csv'], 'Type') || !str_contains((string) $pendingApprovalsCsvDesk['csv'], 'Summary')) {
    throw new RuntimeException('Pending approvals CSV must include Type and Summary columns.');
}
if (!array_key_exists('approvalflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose approvalflow_snapshot.');
}
if (!array_key_exists('approval_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose approval_lines for approvalflow desk.');
}
if (!array_key_exists('recent_approval_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose recent_approval_lines for approvalflow desk.');
}
if (!array_key_exists('today_approval_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_approval_lines for approvalflow desk.');
}

$auditflowSnap = (new Atoms\Services\ReportService())->auditflowSnapshot((int) $branch['id']);
if (!array_key_exists('event_count_today', $auditflowSnap) || !array_key_exists('payment_event_count_14d', $auditflowSnap)) {
    throw new RuntimeException('Auditflow snapshot must expose event_count_today and payment_event_count_14d.');
}
$dashAuditflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('auditflow_snapshot', $dashAuditflow)) {
    throw new RuntimeException('Dashboard must expose auditflow_snapshot.');
}
if (!array_key_exists('audit_lines', $dashAuditflow)) {
    throw new RuntimeException('Dashboard must expose audit_lines for auditflow desk.');
}
if (!array_key_exists('today_audit_lines', $dashAuditflow)) {
    throw new RuntimeException('Dashboard must expose today_audit_lines for auditflow desk.');
}
$auditflowSnapCsv = $reports->export('auditflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $auditflowSnapCsv['csv'], 'Events today') || !str_contains((string) $auditflowSnapCsv['csv'], 'Payment events (14 days)')) {
    throw new RuntimeException('Auditflow snapshot CSV must include Events today and Payment events (14 days) rows.');
}
$recentAuditCsvDesk = $reports->export('recent_audit', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recentAuditCsvDesk['csv'], 'Action') || !str_contains((string) $recentAuditCsvDesk['csv'], 'Summary')) {
    throw new RuntimeException('Recent audit CSV must include Action and Summary columns.');
}
if (!array_key_exists('auditflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose auditflow_snapshot.');
}
if (!array_key_exists('audit_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose audit_lines for auditflow desk.');
}
if (!array_key_exists('today_audit_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_audit_lines for auditflow desk.');
}

$collectionflowSnap = (new Atoms\Services\ReportService())->collectionflowSnapshot((int) $branch['id']);
if (!array_key_exists('receivable_total', $collectionflowSnap) || !array_key_exists('avg_collection_14d', $collectionflowSnap)) {
    throw new RuntimeException('Collectionflow snapshot must expose receivable_total and avg_collection_14d.');
}
$dashCollectionflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('collectionflow_snapshot', $dashCollectionflow)) {
    throw new RuntimeException('Dashboard must expose collectionflow_snapshot.');
}
if (!array_key_exists('receivable_party_lines', $dashCollectionflow)) {
    throw new RuntimeException('Dashboard must expose receivable_party_lines for collectionflow desk.');
}
if (!array_key_exists('overdue_lines', $dashCollectionflow)) {
    throw new RuntimeException('Dashboard must expose overdue_lines for collectionflow desk.');
}
if (!array_key_exists('payment_lines', $dashCollectionflow)) {
    throw new RuntimeException('Dashboard must expose payment_lines for collectionflow desk.');
}
if (!array_key_exists('today_payment_lines', $dashCollectionflow)) {
    throw new RuntimeException('Dashboard must expose today_payment_lines for collectionflow desk.');
}
$collectionflowSnapCsv = $reports->export('collectionflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $collectionflowSnapCsv['csv'], 'Customers owing') || !str_contains((string) $collectionflowSnapCsv['csv'], 'Average collection (14 days)')) {
    throw new RuntimeException('Collectionflow snapshot CSV must include Customers owing and Average collection (14 days) rows.');
}
$recentPaymentsCsvDesk = $reports->export('recent_payments', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recentPaymentsCsvDesk['csv'], 'Invoice') || !str_contains((string) $recentPaymentsCsvDesk['csv'], 'Amount')) {
    throw new RuntimeException('Recent payments CSV must include Invoice and Amount columns.');
}
if (!array_key_exists('collectionflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose collectionflow_snapshot.');
}
if (!array_key_exists('receivable_party_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose receivable_party_lines for collectionflow desk.');
}
if (!array_key_exists('payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payment_lines for collectionflow desk.');
}
if (!array_key_exists('today_payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_payment_lines for collectionflow desk.');
}

$alertflowSnap = (new Atoms\Services\ReportService())->alertflowSnapshot((int) $branch['id']);
if (!array_key_exists('unread_count', $alertflowSnap) || !array_key_exists('alert_types_active', $alertflowSnap)) {
    throw new RuntimeException('Alertflow snapshot must expose unread_count and alert_types_active.');
}
$dashAlertflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('alertflow_snapshot', $dashAlertflow)) {
    throw new RuntimeException('Dashboard must expose alertflow_snapshot.');
}
if (!array_key_exists('notify_lines', $dashAlertflow)) {
    throw new RuntimeException('Dashboard must expose notify_lines for alertflow desk.');
}
if (!array_key_exists('today_notify_lines', $dashAlertflow)) {
    throw new RuntimeException('Dashboard must expose today_notify_lines for alertflow desk.');
}
$alertflowSnapCsv = $reports->export('alertflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $alertflowSnapCsv['csv'], 'Unread alerts') || !str_contains((string) $alertflowSnapCsv['csv'], 'Active alert types (14d)')) {
    throw new RuntimeException('Alertflow snapshot CSV must include Unread alerts and Active alert types (14d) rows.');
}
$unreadAlertsCsvDesk = $reports->export('unread_alerts', $today, $today, (int) $branch['id']);
if (!str_contains((string) $unreadAlertsCsvDesk['csv'], 'Title') || !str_contains((string) $unreadAlertsCsvDesk['csv'], 'Type')) {
    throw new RuntimeException('Unread alerts CSV must include Title and Type columns.');
}
if (!array_key_exists('alertflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose alertflow_snapshot.');
}
if (!array_key_exists('notify_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose notify_lines for alertflow desk.');
}
if (!array_key_exists('today_notify_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_notify_lines for alertflow desk.');
}

$expenseflowSnap = (new Atoms\Services\ReportService())->expenseflowSnapshot((int) $branch['id']);
if (!array_key_exists('pending_count', $expenseflowSnap) || !array_key_exists('avg_posted_14d', $expenseflowSnap)) {
    throw new RuntimeException('Expenseflow snapshot must expose pending_count and avg_posted_14d.');
}
$dashExpenseflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('expenseflow_snapshot', $dashExpenseflow)) {
    throw new RuntimeException('Dashboard must expose expenseflow_snapshot.');
}
if (!array_key_exists('expense_lines', $dashExpenseflow)) {
    throw new RuntimeException('Dashboard must expose expense_lines for expenseflow desk.');
}
if (!array_key_exists('posted_expense_lines', $dashExpenseflow)) {
    throw new RuntimeException('Dashboard must expose posted_expense_lines for expenseflow desk.');
}
if (!array_key_exists('today_expense_lines', $dashExpenseflow)) {
    throw new RuntimeException('Dashboard must expose today_expense_lines for expenseflow desk.');
}
$expenseflowSnapCsv = $reports->export('expenseflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $expenseflowSnapCsv['csv'], 'Pending approval') || !str_contains((string) $expenseflowSnapCsv['csv'], 'Average posted (14 days)')) {
    throw new RuntimeException('Expenseflow snapshot CSV must include Pending approval and Average posted (14 days) rows.');
}
$pendingExpensesCsvDesk = $reports->export('pending_expenses', $today, $today, (int) $branch['id']);
if (!str_contains((string) $pendingExpensesCsvDesk['csv'], 'Category') || !str_contains((string) $pendingExpensesCsvDesk['csv'], 'Amount')) {
    throw new RuntimeException('Pending expenses CSV must include Category and Amount columns.');
}
if (!array_key_exists('expenseflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose expenseflow_snapshot.');
}
if (!array_key_exists('expense_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose expense_lines for expenseflow desk.');
}
if (!array_key_exists('posted_expense_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose posted_expense_lines for expenseflow desk.');
}
if (!array_key_exists('today_expense_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_expense_lines for expenseflow desk.');
}

$performanceflowSnap = (new Atoms\Services\ReportService())->performanceflowSnapshot((int) $branch['id']);
if (!array_key_exists('low_stock_count', $performanceflowSnap) || !array_key_exists('top_product_profit', $performanceflowSnap)) {
    throw new RuntimeException('Performanceflow snapshot must expose low_stock_count and top_product_profit.');
}
$dashPerformanceflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('performanceflow_snapshot', $dashPerformanceflow)) {
    throw new RuntimeException('Dashboard must expose performanceflow_snapshot.');
}
if (!array_key_exists('slow_lines', $dashPerformanceflow)) {
    throw new RuntimeException('Dashboard must expose slow_lines for performanceflow desk.');
}
if (!array_key_exists('top_product_lines', $dashPerformanceflow)) {
    throw new RuntimeException('Dashboard must expose top_product_lines for performanceflow desk.');
}
if (!array_key_exists('low_stock', $dashPerformanceflow)) {
    throw new RuntimeException('Dashboard must expose low_stock for performanceflow desk.');
}
$performanceflowSnapCsv = $reports->export('performanceflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $performanceflowSnapCsv['csv'], 'Slow mover units') || !str_contains((string) $performanceflowSnapCsv['csv'], 'Top product profit (14d)')) {
    throw new RuntimeException('Performanceflow snapshot CSV must include Slow mover units and Top product profit (14d) rows.');
}
$slowMoversCsvDesk = $reports->export('slow_movers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $slowMoversCsvDesk['csv'], 'Product') || !str_contains((string) $slowMoversCsvDesk['csv'], 'Qty')) {
    throw new RuntimeException('Slow movers CSV must include Product and Qty columns.');
}
if (!array_key_exists('performanceflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose performanceflow_snapshot.');
}
if (!array_key_exists('slow_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose slow_lines for performanceflow desk.');
}
if (!array_key_exists('top_product_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose top_product_lines for performanceflow desk.');
}
if (!array_key_exists('low_stock_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose low_stock_lines for performanceflow desk.');
}

$customerflowSnap = (new Atoms\Services\ReportService())->customerflowSnapshot((int) $branch['id']);
if (!array_key_exists('new_customers_today', $customerflowSnap) || !array_key_exists('overdue_share_pct', $customerflowSnap)) {
    throw new RuntimeException('Customerflow snapshot must expose new_customers_today and overdue_share_pct.');
}
$dashCustomerflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('customerflow_snapshot', $dashCustomerflow)) {
    throw new RuntimeException('Dashboard must expose customerflow_snapshot.');
}
if (!array_key_exists('recent_customer_lines', $dashCustomerflow)) {
    throw new RuntimeException('Dashboard must expose recent_customer_lines for customerflow desk.');
}
if (!array_key_exists('retail_receivable_lines', $dashCustomerflow)) {
    throw new RuntimeException('Dashboard must expose retail_receivable_lines for customerflow desk.');
}
if (!array_key_exists('overdue_lines', $dashCustomerflow)) {
    throw new RuntimeException('Dashboard must expose overdue_lines for customerflow desk.');
}
$customerflowSnapCsv = $reports->export('customerflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $customerflowSnapCsv['csv'], 'Average balance owing') || !str_contains((string) $customerflowSnapCsv['csv'], 'Collections (14 days)')) {
    throw new RuntimeException('Customerflow snapshot CSV must include Average balance owing and Collections (14 days) rows.');
}
$recentCustomersCsvDesk = $reports->export('recent_customers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recentCustomersCsvDesk['csv'], 'Customer') || !str_contains((string) $recentCustomersCsvDesk['csv'], 'Balance')) {
    throw new RuntimeException('Recent customers CSV must include Customer and Balance columns.');
}
if (!array_key_exists('customerflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose customerflow_snapshot.');
}
if (!array_key_exists('recent_customer_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose recent_customer_lines for customerflow desk.');
}
if (!array_key_exists('retail_receivable_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose retail_receivable_lines for customerflow desk.');
}
if (!array_key_exists('overdue_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose overdue_lines for customerflow desk.');
}

$intakeflowSnap = (new Atoms\Services\ReportService())->intakeflowSnapshot((int) $branch['id']);
if (!array_key_exists('purchase_count', $intakeflowSnap) || !array_key_exists('avg_purchase_14d', $intakeflowSnap)) {
    throw new RuntimeException('Intakeflow snapshot must expose purchase_count and avg_purchase_14d.');
}
$dashIntakeflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('intakeflow_snapshot', $dashIntakeflow)) {
    throw new RuntimeException('Dashboard must expose intakeflow_snapshot.');
}
if (!array_key_exists('today_purchase_lines', $dashIntakeflow)) {
    throw new RuntimeException('Dashboard must expose today_purchase_lines for intakeflow desk.');
}
if (!array_key_exists('today_imei_lines', $dashIntakeflow)) {
    throw new RuntimeException('Dashboard must expose today_imei_lines for intakeflow desk.');
}
if (!array_key_exists('today_supplier_payment_lines', $dashIntakeflow)) {
    throw new RuntimeException('Dashboard must expose today_supplier_payment_lines for intakeflow desk.');
}
$intakeflowSnapCsv = $reports->export('intakeflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $intakeflowSnapCsv['csv'], 'Average purchase (14 days)') || !str_contains((string) $intakeflowSnapCsv['csv'], 'Intake events (14 days)')) {
    throw new RuntimeException('Intakeflow snapshot CSV must include Average purchase (14 days) and Intake events (14 days) rows.');
}
$todayPurchasesCsvDesk = $reports->export('today_purchases', $today, $today, (int) $branch['id']);
if (!str_contains((string) $todayPurchasesCsvDesk['csv'], 'Supplier') || !str_contains((string) $todayPurchasesCsvDesk['csv'], 'Total')) {
    throw new RuntimeException('Today purchases CSV must include Supplier and Total columns.');
}
if (!array_key_exists('intakeflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose intakeflow_snapshot.');
}
if (!array_key_exists('today_purchase_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_purchase_lines for intakeflow desk.');
}
if (!array_key_exists('today_imei_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_imei_lines for intakeflow desk.');
}
if (!array_key_exists('today_supplier_payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_supplier_payment_lines for intakeflow desk.');
}

$supplierflowSnap = (new Atoms\Services\ReportService())->supplierflowSnapshot((int) $branch['id']);
if (!array_key_exists('owing_supplier_count', $supplierflowSnap) || !array_key_exists('aged_share_pct', $supplierflowSnap)) {
    throw new RuntimeException('Supplierflow snapshot must expose owing_supplier_count and aged_share_pct.');
}
$dashSupplierflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('supplierflow_snapshot', $dashSupplierflow)) {
    throw new RuntimeException('Dashboard must expose supplierflow_snapshot.');
}
if (!array_key_exists('payable_lines', $dashSupplierflow)) {
    throw new RuntimeException('Dashboard must expose payable_lines for supplierflow desk.');
}
if (!array_key_exists('open_purchase_lines', $dashSupplierflow)) {
    throw new RuntimeException('Dashboard must expose open_purchase_lines for supplierflow desk.');
}
if (!array_key_exists('supplier_payment_lines', $dashSupplierflow)) {
    throw new RuntimeException('Dashboard must expose supplier_payment_lines for supplierflow desk.');
}
$supplierflowSnapCsv = $reports->export('supplierflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $supplierflowSnapCsv['csv'], 'Average balance owing') || !str_contains((string) $supplierflowSnapCsv['csv'], 'Supplier payments (14 days)')) {
    throw new RuntimeException('Supplierflow snapshot CSV must include Average balance owing and Supplier payments (14 days) rows.');
}
$payablesCsvDesk = $reports->export('payables', $today, $today, (int) $branch['id']);
if (!str_contains((string) $payablesCsvDesk['csv'], 'Supplier') || !str_contains((string) $payablesCsvDesk['csv'], 'Balance')) {
    throw new RuntimeException('Payables CSV must include Supplier and Balance columns.');
}
if (!array_key_exists('supplierflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose supplierflow_snapshot.');
}
if (!array_key_exists('payable_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payable_lines for supplierflow desk.');
}
if (!array_key_exists('open_purchase_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose open_purchase_lines for supplierflow desk.');
}
if (!array_key_exists('supplier_payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose supplier_payment_lines for supplierflow desk.');
}

$inventoryflowSnap = (new Atoms\Services\ReportService())->inventoryflowSnapshot((int) $branch['id']);
if (!array_key_exists('available_qty', $inventoryflowSnap) || !array_key_exists('faulty_share_pct', $inventoryflowSnap)) {
    throw new RuntimeException('Inventoryflow snapshot must expose available_qty and faulty_share_pct.');
}
$dashInventoryflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('inventoryflow_snapshot', $dashInventoryflow)) {
    throw new RuntimeException('Dashboard must expose inventoryflow_snapshot.');
}
if (!array_key_exists('inventory_lines', $dashInventoryflow)) {
    throw new RuntimeException('Dashboard must expose inventory_lines for inventoryflow desk.');
}
if (!array_key_exists('imei_status_lines', $dashInventoryflow)) {
    throw new RuntimeException('Dashboard must expose imei_status_lines for inventoryflow desk.');
}
if (!array_key_exists('low_stock', $dashInventoryflow)) {
    throw new RuntimeException('Dashboard must expose low_stock for inventoryflow desk.');
}
$inventoryflowSnapCsv = $reports->export('inventoryflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $inventoryflowSnapCsv['csv'], 'Average unit value') || !str_contains((string) $inventoryflowSnapCsv['csv'], 'IMEIs registered today')) {
    throw new RuntimeException('Inventoryflow snapshot CSV must include Average unit value and IMEIs registered today rows.');
}
$inventoryCsvDesk = $reports->export('inventory', $today, $today, (int) $branch['id']);
if (!str_contains((string) $inventoryCsvDesk['csv'], 'Product') || !str_contains((string) $inventoryCsvDesk['csv'], 'Valuation')) {
    throw new RuntimeException('Inventory CSV must include Product and Valuation columns.');
}
if (!array_key_exists('inventoryflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose inventoryflow_snapshot.');
}
if (!array_key_exists('inventory_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose inventory_lines for inventoryflow desk.');
}
if (!array_key_exists('imei_status_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose imei_status_lines for inventoryflow desk.');
}
if (!array_key_exists('low_stock_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose low_stock_lines for inventoryflow desk.');
}

$staffflowSnap = (new Atoms\Services\ReportService())->staffflowSnapshot((int) $branch['id']);
if (!array_key_exists('staff_count', $staffflowSnap) || !array_key_exists('collection_rate_14d', $staffflowSnap)) {
    throw new RuntimeException('Staffflow snapshot must expose staff_count and collection_rate_14d.');
}
$dashStaffflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('staffflow_snapshot', $dashStaffflow)) {
    throw new RuntimeException('Dashboard must expose staffflow_snapshot.');
}
if (!array_key_exists('staff_sales_lines', $dashStaffflow)) {
    throw new RuntimeException('Dashboard must expose staff_sales_lines for staffflow desk.');
}
if (!array_key_exists('staff_device_lines', $dashStaffflow)) {
    throw new RuntimeException('Dashboard must expose staff_device_lines for staffflow desk.');
}
if (!array_key_exists('branch_lines', $dashStaffflow)) {
    throw new RuntimeException('Dashboard must expose branch_lines for staffflow desk.');
}
$staffflowSnapCsv = $reports->export('staffflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $staffflowSnapCsv['csv'], 'Average revenue per staff') || !str_contains((string) $staffflowSnapCsv['csv'], 'Collection rate (14d)')) {
    throw new RuntimeException('Staffflow snapshot CSV must include Average revenue per staff and Collection rate (14d) rows.');
}
$staffCsvDesk = $reports->export('staff', $today, $today, (int) $branch['id']);
if (!str_contains((string) $staffCsvDesk['csv'], 'Staff') || !str_contains((string) $staffCsvDesk['csv'], 'Revenue')) {
    throw new RuntimeException('Staff CSV must include Staff and Revenue columns.');
}
if (!array_key_exists('staffflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose staffflow_snapshot.');
}
if (!array_key_exists('staff_sales_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose staff_sales_lines for staffflow desk.');
}
if (!array_key_exists('staff_device_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose staff_device_lines for staffflow desk.');
}
if (!array_key_exists('branch_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose branch_lines for staffflow desk.');
}

$branchflowSnap = (new Atoms\Services\ReportService())->branchflowSnapshot((int) $branch['id']);
if (!array_key_exists('active_branch_count', $branchflowSnap) || !array_key_exists('collection_rate_14d', $branchflowSnap)) {
    throw new RuntimeException('Branchflow snapshot must expose active_branch_count and collection_rate_14d.');
}
$dashBranchflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('branchflow_snapshot', $dashBranchflow)) {
    throw new RuntimeException('Dashboard must expose branchflow_snapshot.');
}
if (!array_key_exists('branch_lines', $dashBranchflow)) {
    throw new RuntimeException('Dashboard must expose branch_lines for branchflow desk.');
}
if (!array_key_exists('sale_lines', $dashBranchflow)) {
    throw new RuntimeException('Dashboard must expose sale_lines for branchflow desk.');
}
if (!array_key_exists('today_sales_lines', $dashBranchflow)) {
    throw new RuntimeException('Dashboard must expose today_sales_lines for branchflow desk.');
}
$branchflowSnapCsv = $reports->export('branchflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $branchflowSnapCsv['csv'], 'Average revenue per branch') || !str_contains((string) $branchflowSnapCsv['csv'], 'Collection rate (14d)')) {
    throw new RuntimeException('Branchflow snapshot CSV must include Average revenue per branch and Collection rate (14d) rows.');
}
$branchesCsvDesk = $reports->export('branches', $today, $today, (int) $branch['id']);
if (!str_contains((string) $branchesCsvDesk['csv'], 'Branch') || !str_contains((string) $branchesCsvDesk['csv'], 'Revenue')) {
    throw new RuntimeException('Branches CSV must include Branch and Revenue columns.');
}
if (!array_key_exists('branchflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose branchflow_snapshot.');
}
if (!array_key_exists('branch_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose branch_lines for branchflow desk.');
}
if (!array_key_exists('sale_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose sale_lines for branchflow desk.');
}
if (!array_key_exists('today_sales_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_sales_lines for branchflow desk.');
}

$cashflowflowSnap = (new Atoms\Services\ReportService())->cashflowflowSnapshot((int) $branch['id']);
if (!array_key_exists('avg_daily_inflow_14d', $cashflowflowSnap) || !array_key_exists('collection_share_pct', $cashflowflowSnap)) {
    throw new RuntimeException('Cashflowflow snapshot must expose avg_daily_inflow_14d and collection_share_pct.');
}
$dashCashflowflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('cashflowflow_snapshot', $dashCashflowflow)) {
    throw new RuntimeException('Dashboard must expose cashflowflow_snapshot.');
}
if (!array_key_exists('payment_mix_lines', $dashCashflowflow)) {
    throw new RuntimeException('Dashboard must expose payment_mix_lines for cashflowflow desk.');
}
if (!array_key_exists('today_payment_lines', $dashCashflowflow)) {
    throw new RuntimeException('Dashboard must expose today_payment_lines for cashflowflow desk.');
}
if (!array_key_exists('today_cash_snapshot', $dashCashflowflow)) {
    throw new RuntimeException('Dashboard must expose today_cash_snapshot for cashflowflow desk.');
}
$cashflowflowSnapCsv = $reports->export('cashflowflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $cashflowflowSnapCsv['csv'], 'Average daily inflow (14d)') || !str_contains((string) $cashflowflowSnapCsv['csv'], 'Collection share (14d)')) {
    throw new RuntimeException('Cashflowflow snapshot CSV must include Average daily inflow (14d) and Collection share (14d) rows.');
}
$paymentMixCsvDesk = $reports->export('payment_mix', $today, $today, (int) $branch['id']);
if (!str_contains((string) $paymentMixCsvDesk['csv'], 'Method') || !str_contains((string) $paymentMixCsvDesk['csv'], 'Collected')) {
    throw new RuntimeException('Payment mix CSV must include Method and Collected columns.');
}
if (!array_key_exists('cashflowflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose cashflowflow_snapshot.');
}
if (!array_key_exists('payment_mix_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payment_mix_lines for cashflowflow desk.');
}
if (!array_key_exists('today_payment_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_payment_lines for cashflowflow desk.');
}
if (!array_key_exists('today_cash_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose today_cash_snapshot for cashflowflow desk.');
}

$mixflowSnap = (new Atoms\Services\ReportService())->mixflowSnapshot((int) $branch['id']);
if (!array_key_exists('retail_share_pct', $mixflowSnap) || !array_key_exists('avg_invoice_value_14d', $mixflowSnap)) {
    throw new RuntimeException('Mixflow snapshot must expose retail_share_pct and avg_invoice_value_14d.');
}
$dashMixflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('mixflow_snapshot', $dashMixflow)) {
    throw new RuntimeException('Dashboard must expose mixflow_snapshot.');
}
if (!array_key_exists('payment_mix_lines', $dashMixflow)) {
    throw new RuntimeException('Dashboard must expose payment_mix_lines for mixflow desk.');
}
if (!array_key_exists('sale_type_lines', $dashMixflow)) {
    throw new RuntimeException('Dashboard must expose sale_type_lines for mixflow desk.');
}
if (!array_key_exists('today_sales_lines', $dashMixflow)) {
    throw new RuntimeException('Dashboard must expose today_sales_lines for mixflow desk.');
}
$mixflowSnapCsv = $reports->export('mixflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $mixflowSnapCsv['csv'], 'Retail share (14d)') || !str_contains((string) $mixflowSnapCsv['csv'], 'Average invoice value (14d)')) {
    throw new RuntimeException('Mixflow snapshot CSV must include Retail share (14d) and Average invoice value (14d) rows.');
}
$saleTypesCsvDesk = $reports->export('sale_types', $today, $today, (int) $branch['id']);
if (!str_contains((string) $saleTypesCsvDesk['csv'], 'Type') || !str_contains((string) $saleTypesCsvDesk['csv'], 'Net')) {
    throw new RuntimeException('Sale types CSV must include Type and Net columns.');
}
if (!array_key_exists('mixflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose mixflow_snapshot.');
}
if (!array_key_exists('payment_mix_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payment_mix_lines for mixflow desk.');
}
if (!array_key_exists('sale_type_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose sale_type_lines for mixflow desk.');
}
if (!array_key_exists('today_sales_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_sales_lines for mixflow desk.');
}

$trendflowSnap = (new Atoms\Services\ReportService())->trendflowSnapshot((int) $branch['id']);
if (!array_key_exists('collection_rate_14d', $trendflowSnap) || !array_key_exists('today_vs_avg_pct', $trendflowSnap)) {
    throw new RuntimeException('Trendflow snapshot must expose collection_rate_14d and today_vs_avg_pct.');
}
$dashTrendflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('trendflow_snapshot', $dashTrendflow)) {
    throw new RuntimeException('Dashboard must expose trendflow_snapshot.');
}
if (!array_key_exists('trend_lines', $dashTrendflow)) {
    throw new RuntimeException('Dashboard must expose trend_lines for trendflow desk.');
}
if (!array_key_exists('sale_lines', $dashTrendflow)) {
    throw new RuntimeException('Dashboard must expose sale_lines for trendflow desk.');
}
if (!array_key_exists('today_sales_lines', $dashTrendflow)) {
    throw new RuntimeException('Dashboard must expose today_sales_lines for trendflow desk.');
}
$trendflowSnapCsv = $reports->export('trendflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $trendflowSnapCsv['csv'], 'Collection rate (14d)') || !str_contains((string) $trendflowSnapCsv['csv'], 'Today vs average (14d)')) {
    throw new RuntimeException('Trendflow snapshot CSV must include Collection rate (14d) and Today vs average (14d) rows.');
}
$salesTrendCsvDesk = $reports->export('sales_trend', $today, $today, (int) $branch['id']);
if (!str_contains((string) $salesTrendCsvDesk['csv'], 'Date') || !str_contains((string) $salesTrendCsvDesk['csv'], 'Net')) {
    throw new RuntimeException('Sales trend CSV must include Date and Net columns.');
}
if (!array_key_exists('trendflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose trendflow_snapshot.');
}
if (!array_key_exists('trend_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose trend_lines for trendflow desk.');
}
if (!array_key_exists('sale_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose sale_lines for trendflow desk.');
}
if (!array_key_exists('today_sales_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_sales_lines for trendflow desk.');
}

$productflowSnap = (new Atoms\Services\ReportService())->productflowSnapshot((int) $branch['id']);
if (!array_key_exists('top_product_share_pct', $productflowSnap) || !array_key_exists('profit_margin_pct', $productflowSnap)) {
    throw new RuntimeException('Productflow snapshot must expose top_product_share_pct and profit_margin_pct.');
}
$dashProductflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('productflow_snapshot', $dashProductflow)) {
    throw new RuntimeException('Dashboard must expose productflow_snapshot.');
}
if (!array_key_exists('top_product_lines', $dashProductflow)) {
    throw new RuntimeException('Dashboard must expose top_product_lines for productflow desk.');
}
if (!array_key_exists('slow_lines', $dashProductflow)) {
    throw new RuntimeException('Dashboard must expose slow_lines for productflow desk.');
}
if (!array_key_exists('low_stock', $dashProductflow)) {
    throw new RuntimeException('Dashboard must expose low_stock for productflow desk.');
}
$productflowSnapCsv = $reports->export('productflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $productflowSnapCsv['csv'], 'Top product share (14d)') || !str_contains((string) $productflowSnapCsv['csv'], 'Profit margin (14d)')) {
    throw new RuntimeException('Productflow snapshot CSV must include Top product share (14d) and Profit margin (14d) rows.');
}
$slowMoversCsvDesk = $reports->export('slow_movers', $today, $today, (int) $branch['id']);
if (!str_contains((string) $slowMoversCsvDesk['csv'], 'Product') || !str_contains((string) $slowMoversCsvDesk['csv'], 'Qty')) {
    throw new RuntimeException('Slow movers CSV must include Product and Qty columns.');
}
if (!array_key_exists('productflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose productflow_snapshot.');
}
if (!array_key_exists('top_product_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose top_product_lines for productflow desk.');
}
if (!array_key_exists('slow_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose slow_lines for productflow desk.');
}
if (!array_key_exists('low_stock_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose low_stock_lines for productflow desk.');
}

$ledgerflowSnap = (new Atoms\Services\ReportService())->ledgerflowSnapshot((int) $branch['id']);
if (!array_key_exists('net_position', $ledgerflowSnap) || !array_key_exists('collection_rate_14d', $ledgerflowSnap)) {
    throw new RuntimeException('Ledgerflow snapshot must expose net_position and collection_rate_14d.');
}
$dashLedgerflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('ledgerflow_snapshot', $dashLedgerflow)) {
    throw new RuntimeException('Dashboard must expose ledgerflow_snapshot.');
}
if (!array_key_exists('receivable_party_lines', $dashLedgerflow)) {
    throw new RuntimeException('Dashboard must expose receivable_party_lines for ledgerflow desk.');
}
if (!array_key_exists('payable_party_lines', $dashLedgerflow)) {
    throw new RuntimeException('Dashboard must expose payable_party_lines for ledgerflow desk.');
}
if (!array_key_exists('cash_snapshot', $dashLedgerflow)) {
    throw new RuntimeException('Dashboard must expose cash_snapshot for ledgerflow desk.');
}
$ledgerflowSnapCsv = $reports->export('ledgerflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $ledgerflowSnapCsv['csv'], 'Net position') || !str_contains((string) $ledgerflowSnapCsv['csv'], 'Collection rate (14d)')) {
    throw new RuntimeException('Ledgerflow snapshot CSV must include Net position and Collection rate (14d) rows.');
}
$receivablesCsvDesk = $reports->export('receivables', $today, $today, (int) $branch['id']);
if (!str_contains((string) $receivablesCsvDesk['csv'], 'Customer') || !str_contains((string) $receivablesCsvDesk['csv'], 'Balance')) {
    throw new RuntimeException('Receivables CSV must include Customer and Balance columns.');
}
if (!array_key_exists('ledgerflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose ledgerflow_snapshot.');
}
if (!array_key_exists('receivable_party_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose receivable_party_lines for ledgerflow desk.');
}
if (!array_key_exists('payable_party_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payable_party_lines for ledgerflow desk.');
}
if (!array_key_exists('cash_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose cash_snapshot for ledgerflow desk.');
}

$executiveflowSnap = (new Atoms\Services\ReportService())->executiveflowSnapshot((int) $branch['id']);
if (!array_key_exists('net_position', $executiveflowSnap) || !array_key_exists('operations_load', $executiveflowSnap)) {
    throw new RuntimeException('Executiveflow snapshot must expose net_position and operations_load.');
}
$dashExecutiveflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('executiveflow_snapshot', $dashExecutiveflow)) {
    throw new RuntimeException('Dashboard must expose executiveflow_snapshot.');
}
if (!array_key_exists('today_sales_lines', $dashExecutiveflow)) {
    throw new RuntimeException('Dashboard must expose today_sales_lines for executiveflow desk.');
}
if (!array_key_exists('overdue_lines', $dashExecutiveflow)) {
    throw new RuntimeException('Dashboard must expose overdue_lines for executiveflow desk.');
}
if (!array_key_exists('notify_lines', $dashExecutiveflow)) {
    throw new RuntimeException('Dashboard must expose notify_lines for executiveflow desk.');
}
$executiveflowSnapCsv = $reports->export('executiveflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $executiveflowSnapCsv['csv'], 'Net position') || !str_contains((string) $executiveflowSnapCsv['csv'], 'Operations load')) {
    throw new RuntimeException('Executiveflow snapshot CSV must include Net position and Operations load rows.');
}
$unreadAlertsCsvDesk = $reports->export('unread_alerts', $today, $today, (int) $branch['id']);
if (!str_contains((string) $unreadAlertsCsvDesk['csv'], 'Title') || !str_contains((string) $unreadAlertsCsvDesk['csv'], 'Detail')) {
    throw new RuntimeException('Unread alerts CSV must include Title and Detail columns.');
}
if (!array_key_exists('executiveflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose executiveflow_snapshot.');
}
if (!array_key_exists('today_sales_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose today_sales_lines for executiveflow desk.');
}
if (!array_key_exists('overdue_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose overdue_lines for executiveflow desk.');
}
if (!array_key_exists('notify_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose notify_lines for executiveflow desk.');
}

$agingflowSnap = (new Atoms\Services\ReportService())->agingflowSnapshot((int) $branch['id']);
if (!array_key_exists('net_aging_position', $agingflowSnap) || !array_key_exists('receivable_aged_share_pct', $agingflowSnap)) {
    throw new RuntimeException('Agingflow snapshot must expose net_aging_position and receivable_aged_share_pct.');
}
$dashAgingflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('agingflow_snapshot', $dashAgingflow)) {
    throw new RuntimeException('Dashboard must expose agingflow_snapshot.');
}
if (!array_key_exists('aging_lines', $dashAgingflow)) {
    throw new RuntimeException('Dashboard must expose aging_lines for agingflow desk.');
}
if (!array_key_exists('payable_aging_lines', $dashAgingflow)) {
    throw new RuntimeException('Dashboard must expose payable_aging_lines for agingflow desk.');
}
if (!array_key_exists('payment_mix_lines', $dashAgingflow)) {
    throw new RuntimeException('Dashboard must expose payment_mix_lines for agingflow desk.');
}
$agingflowSnapCsv = $reports->export('agingflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $agingflowSnapCsv['csv'], 'Net aging position') || !str_contains((string) $agingflowSnapCsv['csv'], 'Receivable aged share (90+)')) {
    throw new RuntimeException('Agingflow snapshot CSV must include Net aging position and Receivable aged share (90+) rows.');
}
$recvAgingCsvDesk = $reports->export('receivable_aging', $today, $today, (int) $branch['id']);
if (!str_contains((string) $recvAgingCsvDesk['csv'], 'Customer') || !str_contains((string) $recvAgingCsvDesk['csv'], 'Bucket')) {
    throw new RuntimeException('Receivable aging CSV must include Customer and Bucket columns.');
}
$payAgingCsvDesk = $reports->export('payable_aging', $today, $today, (int) $branch['id']);
if (!str_contains((string) $payAgingCsvDesk['csv'], 'Supplier') || !str_contains((string) $payAgingCsvDesk['csv'], 'Bucket')) {
    throw new RuntimeException('Payable aging CSV must include Supplier and Bucket columns.');
}
if (!array_key_exists('agingflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose agingflow_snapshot.');
}
if (!array_key_exists('aging_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose aging_lines for agingflow desk.');
}
if (!array_key_exists('payable_aging_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payable_aging_lines for agingflow desk.');
}
if (!array_key_exists('payment_mix_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose payment_mix_lines for agingflow desk.');
}

$tradeflowSnap = (new Atoms\Services\ReportService())->tradeflowSnapshot((int) $branch['id']);
if (!array_key_exists('total_owing_total', $tradeflowSnap) || !array_key_exists('wholesale_share_pct', $tradeflowSnap)) {
    throw new RuntimeException('Tradeflow snapshot must expose total_owing_total and wholesale_share_pct.');
}
$dashTradeflow = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('tradeflow_snapshot', $dashTradeflow)) {
    throw new RuntimeException('Dashboard must expose tradeflow_snapshot.');
}
if (!array_key_exists('wholesale_receivable_lines', $dashTradeflow)) {
    throw new RuntimeException('Dashboard must expose wholesale_receivable_lines for tradeflow desk.');
}
if (!array_key_exists('retail_receivable_lines', $dashTradeflow)) {
    throw new RuntimeException('Dashboard must expose retail_receivable_lines for tradeflow desk.');
}
if (!array_key_exists('swap_lines', $dashTradeflow)) {
    throw new RuntimeException('Dashboard must expose swap_lines for tradeflow desk.');
}
$tradeflowSnapCsv = $reports->export('tradeflow_snapshot', $today, $today, (int) $branch['id']);
if (!str_contains((string) $tradeflowSnapCsv['csv'], 'Total owing') || !str_contains((string) $tradeflowSnapCsv['csv'], 'Wholesale share (14d)')) {
    throw new RuntimeException('Tradeflow snapshot CSV must include Total owing and Wholesale share (14d) rows.');
}
$whRecvCsvDesk = $reports->export('wholesale_receivables', $today, $today, (int) $branch['id']);
if (!str_contains((string) $whRecvCsvDesk['csv'], 'Customer') || !str_contains((string) $whRecvCsvDesk['csv'], 'Age (days)')) {
    throw new RuntimeException('Wholesale receivables CSV must include Customer and Age (days) columns.');
}
$retRecvCsvDesk = $reports->export('retail_receivables', $today, $today, (int) $branch['id']);
if (!str_contains((string) $retRecvCsvDesk['csv'], 'Customer') || !str_contains((string) $retRecvCsvDesk['csv'], 'Age (days)')) {
    throw new RuntimeException('Retail receivables CSV must include Customer and Age (days) columns.');
}
if (!array_key_exists('tradeflow_snapshot', $analytics)) {
    throw new RuntimeException('Analytics must expose tradeflow_snapshot.');
}
if (!array_key_exists('wholesale_receivable_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose wholesale_receivable_lines for tradeflow desk.');
}
if (!array_key_exists('retail_receivable_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose retail_receivable_lines for tradeflow desk.');
}
if (!array_key_exists('swap_lines', $analytics)) {
    throw new RuntimeException('Analytics must expose swap_lines for tradeflow desk.');
}

$public = new Atoms\Services\PublicApiService();
$catalog = $public->catalog(['branch_id' => (int) $branch['id'], 'q' => 'Samsung']);
if (empty($catalog['success'])) {
    throw new RuntimeException('Public catalog must return success.');
}
$warranty = $public->checkWarranty($imei);
if (empty($warranty['success'])) {
    throw new RuntimeException('Public warranty check must succeed for smoke IMEI.');
}

$accessory = (new Atoms\Services\ProductService())->save(null, [
    'sku'                 => 'SMK-ACC-' . time(),
    'name'                => 'Smoke USB-C Cable',
    'brand'               => 'Accessory',
    'category'            => 'Accessory',
    'track_mode'          => 'quantity',
    'is_serialized'       => 0,
    'min_selling_price'   => 2500,
    'default_cost_price'  => 1200,
    'low_stock_threshold' => 5,
]);
$accPo = (new Atoms\Services\PurchaseService())->create([
    'supplier_id'    => (int) $supplier['id'],
    'branch_id'      => (int) $branch['id'],
    'invoice_number' => 'SMOKE-ACC-' . time(),
    'items'          => [[
        'product_id' => (int) $accessory['id'],
        'cost_price' => 1200,
        'quantity'   => 25,
    ]],
]);
(new Atoms\Services\PurchaseService())->receiveQuantity((int) $accPo['id'], [[
    'product_id' => (int) $accessory['id'],
    'quantity'   => 25,
]]);
$central = (new Atoms\Services\InventoryService())->stockCentral((int) $branch['id']);
$accHit = false;
foreach ($central as $row) {
    if ((int) ($row['product_id'] ?? 0) === (int) $accessory['id'] && ($row['track_mode'] ?? '') === 'quantity') {
        $accHit = true;
        if ((int) ($row['qty'] ?? 0) < 25) {
            throw new RuntimeException('Inventory central must show received accessory qty.');
        }
    }
}
if (!$accHit) {
    throw new RuntimeException('Inventory central must include quantity accessory rows.');
}
$accCatalog = $public->catalog(['branch_id' => (int) $branch['id'], 'q' => 'USB-C']);
$catHit = false;
foreach ($accCatalog['items'] ?? [] as $item) {
    if ((int) ($item['id'] ?? 0) === (int) $accessory['id'] && (int) ($item['total_stock'] ?? 0) >= 25) {
        $catHit = true;
    }
}
if (!$catHit) {
    throw new RuntimeException('Public catalog must include quantity accessory stock.');
}

$qtyCount = $counts->open(['branch_id' => (int) $branch['id']]);
$qtyLine = null;
foreach ($qtyCount['lines'] as $line) {
    if (($line['track_mode'] ?? '') === 'quantity' && (int) ($line['product_id'] ?? 0) === (int) $accessory['id']) {
        $qtyLine = $line;
        break;
    }
}
if (!$qtyLine) {
    throw new RuntimeException('Stock count snapshot must include quantity accessory lines.');
}
$expectedAccessoryQty = (int) ($qtyLine['expected_qty'] ?? 0);
foreach ($qtyCount['lines'] as $line) {
    if (($line['track_mode'] ?? '') !== 'quantity') {
        continue;
    }
    $counts->countQuantity((int) $qtyCount['id'], [
        'product_id'  => (int) $line['product_id'],
        'variant_id'  => !empty($line['variant_id']) ? (int) $line['variant_id'] : null,
        'counted_qty' => (int) ($line['expected_qty'] ?? 0),
    ]);
}
$qtyCounted = $counts->get((int) $qtyCount['id']);
foreach ($qtyCounted['lines'] as $line) {
    if (($line['track_mode'] ?? '') === 'quantity' && (int) ($line['product_id'] ?? 0) === (int) $accessory['id']) {
        if ((int) ($line['counted_qty'] ?? 0) !== $expectedAccessoryQty) {
            throw new RuntimeException('Quantity count must persist counted_qty.');
        }
    }
}
foreach ($qtyCounted['lines'] as $line) {
    if (($line['track_mode'] ?? 'imei') === 'quantity' || (int) ($line['counted'] ?? 0) === 1) {
        continue;
    }
    $counts->scan((int) $qtyCount['id'], ['imei' => $line['imei']]);
}
$qtyPosted = $counts->submit((int) $qtyCount['id'], '');
if (($qtyPosted['status'] ?? '') !== 'posted') {
    throw new RuntimeException('Matching quantity stock count should post. Status=' . ($qtyPosted['status'] ?? ''));
}

$inboundImei = (string) random_int(350000000000000, 359999999999999);
$inboundPo = (new Atoms\Services\PurchaseService())->create([
    'supplier_id'    => (int) $supplier['id'],
    'branch_id'      => (int) $branch['id'],
    'invoice_number' => 'SMOKE-INBOUND-' . time(),
    'items'          => [[
        'product_id' => (int) $product['id'],
        'cost_price' => 250000,
        'quantity'   => 1,
    ]],
]);
$purchases = new Atoms\Services\PurchaseService();
$purchases->preRegisterImeis((int) $inboundPo['id'], [[
    'imei'       => $inboundImei,
    'product_id' => (int) $product['id'],
]]);
$prereg = $purchases->get((int) $inboundPo['id']);
if ((int) ($prereg['inbound_reserved'] ?? 0) < 1) {
    throw new RuntimeException('Purchase desk must expose inbound_reserved after manifest pre-registration.');
}
$reservedRow = (new Atoms\Services\ImeiService())->getByImei($inboundImei);
if (($reservedRow['status'] ?? '') !== 'reserved') {
    throw new RuntimeException('Pre-registered inbound IMEI must stay reserved until receipt.');
}
if ((new Atoms\Services\ReportService())->inboundReservedCount((int) $branch['id']) < 1) {
    throw new RuntimeException('Dashboard inbound reserved count must include manifest units.');
}
$purchases->receive((int) $inboundPo['id']);
$confirmed = (new Atoms\Services\ImeiService())->getByImei($inboundImei);
if (($confirmed['status'] ?? '') !== 'available') {
    throw new RuntimeException('Inbound IMEI must confirm to available after receive.');
}

$dashMetrics = (new Atoms\Services\ReportService())->dashboard((int) $branch['id']);
if (!array_key_exists('quantity_stock', $dashMetrics)) {
    throw new RuntimeException('Dashboard must expose quantity_stock totals.');
}
if (!array_key_exists('quantity_qty', $dashMetrics['stock_snapshot'] ?? [])) {
    throw new RuntimeException('Stock snapshot must expose quantity_qty.');
}
if (!array_key_exists('inbound_reserved_count', $dashMetrics['operations_snapshot'] ?? [])) {
    throw new RuntimeException('Operations snapshot must expose inbound_reserved_count.');
}

$beforeQty = (new Atoms\Services\StockService())->get((int) $branch['id'], (int) $accessory['id'], null)['qty_on_hand'];
if ($beforeQty < 5) {
    throw new RuntimeException('Accessory smoke stock must have at least 5 units before quantity sale test.');
}
$qtySale = (new Atoms\Services\SaleService())->create([
    'branch_id'      => (int) $branch['id'],
    'customer_id'    => (int) $customer['id'],
    'sale_type'      => 'retail',
    'payment_method' => 'cash',
    'paid_amount'    => 7500,
    'items'          => [[
        'product_id'    => (int) $accessory['id'],
        'quantity'      => 3,
        'selling_price' => 2500,
    ]],
]);
if (($qtySale['status'] ?? '') !== 'completed') {
    throw new RuntimeException('Quantity POS sale must complete. Status=' . ($qtySale['status'] ?? ''));
}
$afterQty = (new Atoms\Services\StockService())->get((int) $branch['id'], (int) $accessory['id'], null)['qty_on_hand'];
if ($afterQty !== $beforeQty - 3) {
    throw new RuntimeException('Quantity sale must decrement branch stock.');
}
$qtyItems = (new Atoms\Services\SaleService())->get((int) $qtySale['id'])['items'] ?? [];
if ((int) ($qtyItems[0]['quantity'] ?? 0) !== 3 || !empty($qtyItems[0]['imei_id'])) {
    throw new RuntimeException('Quantity sale item must store quantity without imei_id.');
}
$voided = (new Atoms\Services\SaleService())->void((int) $qtySale['id'], 'Smoke quantity sale void');
if (($voided['status'] ?? '') !== 'voided') {
    throw new RuntimeException('Quantity sale void must restore stock.');
}
$restoredQty = (new Atoms\Services\StockService())->get((int) $branch['id'], (int) $accessory['id'], null)['qty_on_hand'];
if ($restoredQty !== $beforeQty) {
    throw new RuntimeException('Voiding quantity sale must restore branch stock.');
}

$staffUsername = 'smoke_staff_' . time();
$staffEmail = 'smoke-staff-' . time() . '@example.test';
$staff = (new Atoms\Services\UserService())->createStaff([
    'name'               => 'Smoke Sales Officer',
    'email'              => $staffEmail,
    'username'           => $staffUsername,
    'password'           => 'SmokePass123!',
    'role'               => 'atoms_sales_officer',
    'branch_ids'         => [(int) $branch['id']],
    'default_branch_id'  => (int) $branch['id'],
]);
if (($staff['username'] ?? '') !== $staffUsername) {
    throw new RuntimeException('Staff create must return the new username.');
}
if (($staff['role_label'] ?? '') === '') {
    throw new RuntimeException('Staff create must expose role_label.');
}
$branchIds = array_map(static fn(array $b): int => (int) $b['id'], $staff['branches'] ?? []);
if (!in_array((int) $branch['id'], $branchIds, true)) {
    throw new RuntimeException('Staff create must assign branch access.');
}
$roles = (new Atoms\Services\UserService())->roleOptions();
if ($roles === []) {
    throw new RuntimeException('Staff role options must not be empty.');
}

$mixImei = (string) random_int(350000000000000, 359999999999999);
$mixPo = (new Atoms\Services\PurchaseService())->create([
    'supplier_id'    => (int) $supplier['id'],
    'branch_id'      => (int) $branch['id'],
    'invoice_number' => 'SMOKE-MIX-' . time(),
    'items'          => [[
        'product_id' => (int) $product['id'],
        'cost_price' => 250000,
        'quantity'   => 1,
    ]],
]);
$purchases->receive((int) $mixPo['id']);
$purchases->registerImeis((int) $mixPo['id'], [[
    'imei'       => $mixImei,
    'product_id' => (int) $product['id'],
]]);
$mixBeforeQty = (new Atoms\Services\StockService())->get((int) $branch['id'], (int) $accessory['id'], null)['qty_on_hand'];
$mixSale = (new Atoms\Services\SaleService())->create([
    'branch_id'      => (int) $branch['id'],
    'customer_id'    => (int) $customer['id'],
    'sale_type'      => 'retail',
    'payment_method' => 'cash',
    'paid_amount'    => 285000,
    'items'          => [
        ['imei' => $mixImei, 'selling_price' => 280000],
        ['product_id' => (int) $accessory['id'], 'quantity' => 2, 'selling_price' => 2500],
    ],
]);
if (($mixSale['status'] ?? '') !== 'completed') {
    throw new RuntimeException('Mixed IMEI + quantity POS sale must complete.');
}
$mixLines = (new Atoms\Services\SaleService())->get((int) $mixSale['id'])['items'] ?? [];
if (count($mixLines) !== 2) {
    throw new RuntimeException('Mixed sale must persist two line items.');
}
$mixImeiRow = (new Atoms\Services\ImeiService())->getByImei($mixImei);
if (($mixImeiRow['status'] ?? '') !== 'sold') {
    throw new RuntimeException('Mixed sale must mark the device IMEI as sold.');
}
$mixAfterQty = (new Atoms\Services\StockService())->get((int) $branch['id'], (int) $accessory['id'], null)['qty_on_hand'];
if ($mixAfterQty !== $mixBeforeQty - 2) {
    throw new RuntimeException('Mixed sale must decrement accessory stock.');
}

$csvInboundImei = (string) random_int(350000000000000, 359999999999999);
$csvPoInv = 'SMOKE-CSV-INBOUND-' . time();
$inboundCsvRun = $importer->run(
    'inbound_imeis',
    "supplier_name,branch_code,po_invoice,sku,imei\n{$supplier['name']},{$code},{$csvPoInv},{$product['sku']},{$csvInboundImei}\n"
);
if (($inboundCsvRun['created'] ?? 0) < 1) {
    throw new RuntimeException('Inbound IMEI CSV import must create reserved units: ' . json_encode($inboundCsvRun['errors'] ?? []));
}
$csvReserved = (new Atoms\Services\ImeiService())->getByImei($csvInboundImei);
if (($csvReserved['status'] ?? '') !== 'reserved') {
    throw new RuntimeException('Inbound IMEI CSV must pre-register units as reserved.');
}
$csvPoId = (int) $wpdb->get_var($wpdb->prepare(
    'SELECT id FROM ' . $wpdb->prefix . 'atoms_purchases WHERE invoice_number = %s LIMIT 1',
    $csvPoInv
));
if ($csvPoId <= 0) {
    throw new RuntimeException('Inbound IMEI CSV must create a purchase order.');
}
$csvPurchase = $purchases->get($csvPoId);
if ((int) ($csvPurchase['inbound_reserved'] ?? 0) < 1) {
    throw new RuntimeException('Inbound IMEI CSV must expose inbound_reserved on the purchase.');
}

$stockBeforeCsv = (new Atoms\Services\StockService())->get((int) $branch['id'], (int) $accessory['id'], null)['qty_on_hand'];
$stockCsvRun = $importer->run(
    'stock',
    "sku,branch_code,quantity\n{$accessory['sku']},{$code},5\n"
);
if (($stockCsvRun['created'] ?? 0) < 1) {
    throw new RuntimeException('Quantity stock CSV import must increase branch stock.');
}
$stockAfterCsv = (new Atoms\Services\StockService())->get((int) $branch['id'], (int) $accessory['id'], null)['qty_on_hand'];
if ($stockAfterCsv !== $stockBeforeCsv + 5) {
    throw new RuntimeException('Stock CSV import must add the declared quantity.');
}
$importTypes = array_column((new Atoms\Services\ImportService())->catalog(), 'id');
if (!in_array('inbound', $importTypes, true) || !in_array('inbound_imeis', $importTypes, true) || !in_array('stock', $importTypes, true)) {
    throw new RuntimeException('Import catalog must expose inbound, inbound_imeis, and stock types.');
}

$inboundPoInv = 'SMOKE-INBOUND-PO-' . time();
$inboundPoRun = $importer->run(
    'inbound',
    "supplier_name,branch_code,po_invoice,sku,quantity\n{$supplier['name']},{$code},{$inboundPoInv},{$product['sku']},2\n"
);
if (($inboundPoRun['created'] ?? 0) < 1 && ($inboundPoRun['updated'] ?? 0) < 1) {
    throw new RuntimeException('Inbound PO CSV import must create a purchase order: ' . json_encode($inboundPoRun['errors'] ?? []));
}
$inboundPoId = (int) $wpdb->get_var($wpdb->prepare(
    'SELECT id FROM ' . $wpdb->prefix . 'atoms_purchases WHERE invoice_number = %s LIMIT 1',
    $inboundPoInv
));
if ($inboundPoId <= 0) {
    throw new RuntimeException('Inbound PO CSV must create a purchase order row.');
}
$inboundPo = $purchases->get($inboundPoId);
if (($inboundPo['status'] ?? '') !== 'ordered') {
    throw new RuntimeException('Inbound PO CSV must leave the order in ordered status.');
}
$inboundLine = $inboundPo['items'][0] ?? null;
if (!$inboundLine || (int) ($inboundLine['quantity'] ?? 0) !== 2) {
    throw new RuntimeException('Inbound PO CSV must persist the declared line quantity.');
}
$purchases->receive($inboundPoId);
$inboundRecvImei1 = (string) random_int(350000000000000, 359999999999999);
$inboundRecvImei2 = (string) random_int(350000000000000, 359999999999999);
$purchases->registerImeis($inboundPoId, [
    ['imei' => $inboundRecvImei1, 'product_id' => (int) $product['id']],
    ['imei' => $inboundRecvImei2, 'product_id' => (int) $product['id']],
]);
$receivedInboundPo = $purchases->get($inboundPoId);
if (($receivedInboundPo['status'] ?? '') !== 'completed') {
    throw new RuntimeException('Inbound PO CSV must complete after receive and IMEI registration.');
}
$recvRow1 = (new Atoms\Services\ImeiService())->getByImei($inboundRecvImei1);
if (($recvRow1['status'] ?? '') !== 'available') {
    throw new RuntimeException('Inbound PO receive must register devices as available.');
}

$qtyInboundProduct = (new Atoms\Services\ProductService())->save(null, [
    'sku'                => 'SMK-QIN-' . time(),
    'name'               => 'Smoke Inbound Qty Pouch',
    'brand'              => 'Accessory',
    'category'           => 'Accessory',
    'track_mode'         => 'quantity',
    'is_serialized'      => 0,
    'min_selling_price'  => 2500,
    'default_cost_price' => 1200,
]);
$qtyInboundInv = 'SMOKE-INBOUND-QTY-' . time();
$qtyInboundRun = $importer->run(
    'inbound',
    "supplier_name,branch_code,po_invoice,sku,quantity\n{$supplier['name']},{$code},{$qtyInboundInv},{$qtyInboundProduct['sku']},10\n"
);
if (($qtyInboundRun['created'] ?? 0) < 1 && ($qtyInboundRun['updated'] ?? 0) < 1) {
    throw new RuntimeException('Quantity inbound PO CSV import must create a purchase order: ' . json_encode($qtyInboundRun['errors'] ?? []));
}
$qtyInboundPoId = (int) $wpdb->get_var($wpdb->prepare(
    'SELECT id FROM ' . $wpdb->prefix . 'atoms_purchases WHERE invoice_number = %s LIMIT 1',
    $qtyInboundInv
));
if ($qtyInboundPoId <= 0) {
    throw new RuntimeException('Quantity inbound PO CSV must create a purchase order row.');
}
$qtyInboundPo = $purchases->get($qtyInboundPoId);
if (($qtyInboundPo['status'] ?? '') !== 'ordered') {
    throw new RuntimeException('Quantity inbound PO CSV must leave the order in ordered status.');
}
$purchases->receiveQuantity($qtyInboundPoId, [[
    'product_id' => (int) $qtyInboundProduct['id'],
    'quantity'   => 10,
]]);
$receivedQtyPo = $purchases->get($qtyInboundPoId);
if (($receivedQtyPo['status'] ?? '') !== 'completed') {
    throw new RuntimeException('Quantity inbound PO CSV must complete after receiveQuantity.');
}
$qtyStockRow = (new Atoms\Services\StockService())->get((int) $branch['id'], (int) $qtyInboundProduct['id'], null);
if ((int) ($qtyStockRow['qty_on_hand'] ?? 0) !== 10) {
    throw new RuntimeException('Quantity inbound PO receive must post branch stock.');
}

$lowAccessory = (new Atoms\Services\ProductService())->save(null, [
    'sku'                 => 'SMK-LOW-' . time(),
    'name'                => 'Smoke Low Stock Cable',
    'brand'               => 'Accessory',
    'category'            => 'Accessory',
    'track_mode'          => 'quantity',
    'is_serialized'       => 0,
    'min_selling_price'   => 1500,
    'default_cost_price'  => 800,
    'low_stock_threshold' => 5,
]);
$lowPo = (new Atoms\Services\PurchaseService())->create([
    'supplier_id'    => (int) $supplier['id'],
    'branch_id'      => (int) $branch['id'],
    'invoice_number' => 'SMOKE-LOW-' . time(),
    'items'          => [[
        'product_id' => (int) $lowAccessory['id'],
        'cost_price' => 800,
        'quantity'   => 3,
    ]],
]);
$purchases->receiveQuantity((int) $lowPo['id'], [[
    'product_id' => (int) $lowAccessory['id'],
    'quantity'   => 3,
]]);
$lowHit = false;
foreach ((new Atoms\Services\ProductService())->lowStockAlerts((int) $branch['id']) as $row) {
    if ((int) ($row['product_id'] ?? 0) === (int) $lowAccessory['id'] && ($row['track_mode'] ?? '') === 'quantity') {
        $lowHit = true;
        if ((int) ($row['qty'] ?? 0) !== 3) {
            throw new RuntimeException('Quantity low-stock alert must expose on-hand qty.');
        }
    }
}
if (!$lowHit) {
    throw new RuntimeException('Low stock alerts must include quantity accessories below threshold.');
}
$dashLowHit = false;
foreach ((new Atoms\Services\ReportService())->dashboard((int) $branch['id'])['low_stock'] ?? [] as $row) {
    if ((int) ($row['product_id'] ?? 0) === (int) $lowAccessory['id'] && ($row['track_mode'] ?? '') === 'quantity') {
        $dashLowHit = true;
    }
}
if (!$dashLowHit) {
    throw new RuntimeException('Dashboard low_stock must include quantity accessories.');
}

$notify = new Atoms\Services\NotifyService();
$lowNotifySent = $notify->scanLowStock();
$lowNotifyHit = false;
foreach ($notify->alertLines((int) $branch['id']) as $alert) {
    if (($alert['type'] ?? '') !== 'low_stock') {
        continue;
    }
    if (str_contains((string) ($alert['body'] ?? ''), 'Smoke Low Stock Cable')
        && str_contains((string) ($alert['body'] ?? ''), 'Accessory')) {
        $lowNotifyHit = true;
    }
}
// receiveQuantity may already have alerted; scanLowStock is idempotent within 24h.
if ($lowNotifySent < 1 && !$lowNotifyHit) {
    throw new RuntimeException('Low-stock notify scan must alert for below-threshold products.');
}
if (!$lowNotifyHit) {
    throw new RuntimeException('Low-stock notifications must identify quantity accessories.');
}

$catalogLowHit = false;
foreach ((new Atoms\Services\PublicApiService())->catalog([
    'branch_id' => (int) $branch['id'],
    'q'         => 'Smoke Low Stock Cable',
])['items'] ?? [] as $catItem) {
    if ((int) ($catItem['id'] ?? 0) === (int) $lowAccessory['id'] && !empty($catItem['is_low_stock'])) {
        $catalogLowHit = true;
    }
}
if (!$catalogLowHit) {
    throw new RuntimeException('Public catalog must flag low-stock accessories with is_low_stock.');
}

$cronLowStock = (new Atoms\Services\AutomationService())->runFromCron();
if (!isset($cronLowStock['counts']['low_stock'])) {
    throw new RuntimeException('Hourly cron automation must report low_stock scan counts.');
}

WP_CLI::success('Smoke passed: purchase → IMEI → sale → payment → return → supplier ledger → repair → expense → notify → analytics → stock count → supplier return → reports → automation → search → import → staff/branch → audit → statement/void/warranty → swap → secrets/outbox → locate/receipt → offline → variants → archive → wholesale → low-stock/restore → imei-variant-import → variant-bi-search → transfer-desk/exports/edit → count-repair-variant/party-edit → purchase-swap-return-variant → sales-approvals-variant-edit → returns-swap-search-variant → repair-return-detail-movement-variant → staff-audit-invoice-search → count-receivables-supplier-expenses → audit-alert-overdue-export → approval-payable-ledger → expense-payments-transit → open-repairs-stuck-transfers → approvals-faulty-queue → supplier-payments-stock-counts → returns-wholesale-pending-expenses → swaps-slow-movers-stuck-repairs → retail-receivables-recent-sales-alerts → collections-supplier-payments-overdue → purchases-supplier-returns-open-pos → reversals-voids-posted-expenses → audit-transfers-stock-counts → repairs-approvals-customers → imei-intake-staff-low-stock → aging-top-products → payable-aging-movement → mix-branches-staff → trend-cash-ledger → inventory-imei-status → today-expense-desk → today-intake-supplier → operations-workflow-desk → collections-receivables-desk → payables-supplier-desk → returns-adjustments-desk → alerts-performance-desk → staff-branch-desk → movement-stockflow-desk → cash-ledger-desk → repair-service-desk → audit-compliance-desk → wholesale-trade-desk → aging-paymentmix-desk → executive-overview-desk → branch-network-desk → sales-mix-desk → product-performance-desk → trend-velocity-desk → cashflow-desk → staff-devices-desk → low-stock-desk → imei-status-desk → transfer-transit-desk → open-po-desk → returns-swaps-desk → repair-faulty-desk → customer-desk → supplier-desk → count-desk → approval-desk → expense-desk → audit-desk → collection-desk → alert-desk → sales-desk → payment-desk → swap-desk → return-desk → adjustment-desk → procurement-desk → receiving-desk → payables-desk → receivables-desk → workflow-desk → transit-desk → stockflow-desk → service-desk → countflow-desk → approvalflow-desk → auditflow-desk → collectionflow-desk → alertflow-desk → expenseflow-desk → performanceflow-desk → customerflow-desk → intakeflow-desk → supplierflow-desk → inventoryflow-desk → staffflow-desk → branchflow-desk → cashflowflow-desk → mixflow-desk → trendflow-desk → productflow-desk → ledgerflow-desk → executiveflow-desk → agingflow-desk → tradeflow-desk → public-catalog-quantity-stocktake → inbound-imei-dashboard-metrics → quantity-pos-staff-elementor → mixed-pos-inbound-stock-import.');
WP_CLI::log('Invoice ' . $sale['invoice_number'] . ' IMEI ' . $imei . ' Repair ' . $repair['ticket_number'] . ' Alert #' . $nid);
