<?php
declare(strict_types=1);

namespace Atoms\Rest;

use Atoms\Services\AnalyticsService;
use Atoms\Services\ApprovalService;
use Atoms\Services\AuditLogger;
use Atoms\Services\AutomationService;
use Atoms\Services\BranchService;
use Atoms\Services\CustomerService;
use Atoms\Services\ExpenseService;
use Atoms\Services\ImportService;
use Atoms\Services\ImeiService;
use Atoms\Services\InboundManifestService;
use Atoms\Services\InventoryService;
use Atoms\Services\NotifyService;
use Atoms\Services\PaymentService;
use Atoms\Services\ProductService;
use Atoms\Services\PurchaseService;
use Atoms\Services\RepairService;
use Atoms\Services\ReportService;
use Atoms\Services\ReturnService;
use Atoms\Services\SaleService;
use Atoms\Services\SearchService;
use Atoms\Services\SettingsService;
use Atoms\Services\StockCountService;
use Atoms\Services\SupplierService;
use Atoms\Services\SwapService;
use Atoms\Services\TransferService;
use Atoms\Services\UserService;
use Atoms\Domain\OfflinePolicy;
use Atoms\Domain\ArchivePolicy;
use Atoms\Domain\WholesalePolicy;
use Atoms\Domain\RateLimited;
use Atoms\Support\Context;
use WP_REST_Request;

final class Router
{
    public function register(): void
    {
        add_action('rest_api_init', function (): void {
            $this->routes();
        });
    }

    private function routes(): void
    {
        $ns = 'atoms/v1';

        $this->get($ns, '/bootstrap', 'atoms_read', [$this, 'bootstrap']);
        $this->get($ns, '/search', 'atoms_read', [$this, 'search']);
        $this->get($ns, '/dashboard', 'atoms_read', [$this, 'dashboard']);
        $this->get($ns, '/analytics', 'atoms_view_reports', function (WP_REST_Request $r) {
            $days = max(7, min(90, (int) ($r->get_param('days') ?: 14)));
            $bid  = $r->get_param('branch_id') ? (int) $r->get_param('branch_id') : null;
            return Http::ok((new AnalyticsService())->overview($days, $bid));
        });
        $this->get($ns, '/notifications', 'atoms_read', fn() => Http::ok((new NotifyService())->inbox()));
        $this->post($ns, '/notifications/(?P<id>\d+)/read', 'atoms_read', function (WP_REST_Request $r) {
            (new NotifyService())->markRead((int) $r['id']);
            return Http::ok(true);
        });
        $this->get($ns, '/outbox', 'atoms_manage_settings', fn() => Http::ok((new NotifyService())->outbox()));
        $this->post($ns, '/outbox/(?P<id>\d+)/sent', 'atoms_manage_settings', function (WP_REST_Request $r) {
            return Http::ok((new NotifyService())->markSent((int) $r['id']));
        });
        $this->get($ns, '/settings', 'atoms_manage_settings', fn() => Http::ok((new SettingsService())->expose()));
        $this->post($ns, '/settings', 'atoms_manage_settings', function (WP_REST_Request $r) {
            return Http::ok((new SettingsService())->save(Http::json($r)));
        });
        $this->get($ns, '/home-layout', 'atoms_read', fn() => Http::ok((new \Atoms\Services\HomeDashboardService())->forCurrentUser()));
        $this->post($ns, '/home-layout', 'atoms_read', function (WP_REST_Request $r) {
            return Http::ok((new \Atoms\Services\HomeDashboardService())->save(get_current_user_id(), Http::json($r)));
        });
        $this->post($ns, '/home-layout/reset', 'atoms_read', function () {
            return Http::ok((new \Atoms\Services\HomeDashboardService())->reset(get_current_user_id()));
        });
        $this->get($ns, '/automation', 'atoms_manage_settings', fn() => Http::ok((new AutomationService())->status()));
        $this->post($ns, '/automation/run', 'atoms_manage_settings', function () {
            return Http::ok((new AutomationService())->run());
        });

        $this->get($ns, '/branches', 'atoms_read', fn() => Http::ok((new BranchService())->all(false)));
        $this->post($ns, '/branches', 'atoms_manage_settings', function (WP_REST_Request $r) {
            return Http::ok((new BranchService())->save(null, Http::json($r)), 201);
        });
        $this->post($ns, '/branches/(?P<id>\d+)', 'atoms_manage_settings', function (WP_REST_Request $r) {
            return Http::ok((new BranchService())->save((int) $r['id'], Http::json($r)));
        });

        // Public Frontend / Elementor Endpoints
        $this->publicGet($ns, '/public/warranty', function (WP_REST_Request $r) {
            return Http::ok((new \Atoms\Services\PublicApiService())->checkWarranty((string) $r->get_param('imei')));
        });
        $this->publicGet($ns, '/public/catalog', function (WP_REST_Request $r) {
            return Http::ok((new \Atoms\Services\PublicApiService())->catalog($r->get_params()));
        });
        $this->publicPost($ns, '/public/swap-estimate', function (WP_REST_Request $r) {
            return Http::ok((new \Atoms\Services\PublicApiService())->estimateSwap(Http::json($r)));
        });
        $this->publicGet($ns, '/public/branches', function () {
            return Http::ok((new \Atoms\Services\PublicApiService())->branches());
        });

        $this->get($ns, '/products', 'atoms_read', function (WP_REST_Request $r) {
            return Http::ok((new ProductService())->search((string) $r->get_param('q')));
        });
        $this->post($ns, '/products/prices/bulk', 'atoms_manage_products', function (WP_REST_Request $r) {
            return Http::ok((new ProductService())->bulkUpdatePrices(Http::json($r)));
        });

        $this->get($ns, '/pricing/dashboard', 'atoms_read', function () {
            return Http::ok((new \Atoms\Services\PricingService())->dashboard());
        });
        $this->get($ns, '/pricing/current', 'atoms_read', function (WP_REST_Request $r) {
            return Http::ok((new \Atoms\Services\PricingService())->currentPrices($r->get_params()));
        });
        $pricingWrite = static fn(): bool => current_user_can('atoms_manage_pricing') || current_user_can('atoms_manage_products');
        $this->post($ns, '/pricing/bulk', $pricingWrite, function (WP_REST_Request $r) {
            return Http::ok((new \Atoms\Services\PricingService())->bulkUpdate(Http::json($r)));
        });
        $this->post($ns, '/pricing/import', $pricingWrite, function (WP_REST_Request $r) {
            $body = Http::json($r);
            $csv = (string) ($body['csv'] ?? '');
            unset($body['csv']);

            return Http::ok((new \Atoms\Services\PricingService())->importCsv($csv, $body));
        });
        $this->get($ns, '/pricing/history', 'atoms_read', function (WP_REST_Request $r) {
            return Http::ok((new \Atoms\Services\PricingService())->history($r->get_params()));
        });
        $this->post($ns, '/pricing/branch', $pricingWrite, function (WP_REST_Request $r) {
            return Http::ok((new \Atoms\Services\PricingService())->setBranchPrice(Http::json($r)));
        });
        $this->post($ns, '/pricing/schedules/activate', $pricingWrite, function () {
            return Http::ok(['activated' => (new \Atoms\Services\PricingService())->activateDueSchedules()]);
        });

        $this->post($ns, '/products', 'atoms_manage_products', function (WP_REST_Request $r) {
            return Http::ok((new ProductService())->save(null, Http::json($r)), 201);
        });
        $this->post($ns, '/products/(?P<id>\d+)', 'atoms_manage_products', function (WP_REST_Request $r) {
            return Http::ok((new ProductService())->save((int) $r['id'], Http::json($r)));
        });
        $this->get($ns, '/products/(?P<id>\d+)', 'atoms_read', function (WP_REST_Request $r) {
            return Http::ok((new ProductService())->get((int) $r['id']));
        });
        $this->post($ns, '/products/(?P<id>\d+)/archive', 'atoms_manage_products', function (WP_REST_Request $r) {
            return Http::ok((new ProductService())->archive((int) $r['id']));
        });
        $this->post($ns, '/products/(?P<id>\d+)/restore', 'atoms_manage_products', function (WP_REST_Request $r) {
            return Http::ok((new ProductService())->restore((int) $r['id']));
        });
        $this->get($ns, '/products/archived', 'atoms_manage_products', function () {
            return Http::ok((new ProductService())->archived());
        });
        $this->post($ns, '/products/(?P<id>\d+)/variants', 'atoms_manage_products', function (WP_REST_Request $r) {
            return Http::ok((new ProductService())->addVariant((int) $r['id'], Http::json($r)), 201);
        });

        $this->get($ns, '/customers', 'atoms_read', function (WP_REST_Request $r) {
            return Http::ok((new CustomerService())->search((string) $r->get_param('q')));
        });
        $this->get($ns, '/customers/(?P<id>\d+)/statement', 'atoms_read', function (WP_REST_Request $r) {
            return Http::ok((new CustomerService())->exportStatement((int) $r['id']));
        });
        $this->get($ns, '/customers/(?P<id>\d+)', 'atoms_read', function (WP_REST_Request $r) {
            return Http::ok((new CustomerService())->statement((int) $r['id']));
        });
        $this->post($ns, '/customers', 'atoms_manage_customers', function (WP_REST_Request $r) {
            return Http::ok(Http::once($r, 'customers', fn () => (new CustomerService())->save(null, Http::json($r))), 201);
        });
        $this->post($ns, '/customers/(?P<id>\d+)', 'atoms_manage_customers', function (WP_REST_Request $r) {
            return Http::ok((new CustomerService())->save((int) $r['id'], Http::json($r)));
        });
        $this->post($ns, '/customers/(?P<id>\d+)/payments', 'atoms_create_payment', function (WP_REST_Request $r) {
            $body = Http::json($r);
            $body['customer_id'] = (int) $r['id'];
            return Http::ok(Http::once($r, 'customers/' . (int) $r['id'] . '/payments', fn () => (new PaymentService())->post($body)), 201);
        });
        $this->post($ns, '/customers/(?P<id>\d+)/archive', 'atoms_manage_customers', function (WP_REST_Request $r) {
            return Http::ok((new CustomerService())->archive((int) $r['id']));
        });
        $this->post($ns, '/customers/(?P<id>\d+)/restore', 'atoms_manage_customers', function (WP_REST_Request $r) {
            return Http::ok((new CustomerService())->restore((int) $r['id']));
        });
        $this->get($ns, '/customers/archived', 'atoms_manage_customers', function () {
            return Http::ok((new CustomerService())->archived());
        });

        $this->get($ns, '/suppliers', 'atoms_read', fn() => Http::ok((new SupplierService())->all()));
        $this->get($ns, '/suppliers/(?P<id>\d+)', 'atoms_read', function (WP_REST_Request $r) {
            return Http::ok((new SupplierService())->get((int) $r['id']));
        });
        $this->post($ns, '/suppliers', 'atoms_manage_suppliers', function (WP_REST_Request $r) {
            return Http::ok((new SupplierService())->save(null, Http::json($r)), 201);
        });
        $this->post($ns, '/suppliers/(?P<id>\d+)', 'atoms_manage_suppliers', function (WP_REST_Request $r) {
            return Http::ok((new SupplierService())->save((int) $r['id'], Http::json($r)));
        });
        $this->post($ns, '/suppliers/(?P<id>\d+)/payments', 'atoms_manage_suppliers', function (WP_REST_Request $r) {
            $body = Http::json($r);
            $body['supplier_id'] = (int) $r['id'];
            return Http::ok((new SupplierService())->pay($body), 201);
        });
        $this->post($ns, '/suppliers/(?P<id>\d+)/returns', 'atoms_manage_suppliers', function (WP_REST_Request $r) {
            $body = Http::json($r);
            $body['supplier_id'] = (int) $r['id'];
            return Http::ok((new SupplierService())->returnDevice($body), 201);
        });
        $this->post($ns, '/suppliers/(?P<id>\d+)/archive', 'atoms_manage_suppliers', function (WP_REST_Request $r) {
            return Http::ok((new SupplierService())->archive((int) $r['id']));
        });
        $this->post($ns, '/suppliers/(?P<id>\d+)/restore', 'atoms_manage_suppliers', function (WP_REST_Request $r) {
            return Http::ok((new SupplierService())->restore((int) $r['id']));
        });
        $this->get($ns, '/suppliers/archived', 'atoms_manage_suppliers', function () {
            return Http::ok((new SupplierService())->archived());
        });

        $this->get($ns, '/imei', 'atoms_view_imei', function (WP_REST_Request $r) {
            return Http::ok((new ImeiService())->search((string) $r->get_param('q')));
        });
        $this->get($ns, '/imei/(?P<imei>[0-9]+)', 'atoms_view_imei', function (WP_REST_Request $r) {
            $imei = (new ImeiService())->getByImei((string) $r['imei']);
            return Http::ok((new ImeiService())->history((int) $imei['id']));
        });

        $this->get($ns, '/inventory', 'atoms_read', function (WP_REST_Request $r) {
            $branch = $r->get_param('branch_id') ? (int) $r->get_param('branch_id') : null;
            return Http::ok((new InventoryService())->stockCentral($branch));
        });
        $this->get($ns, '/inventory/low-stock', 'atoms_read', function (WP_REST_Request $r) {
            $branch = $r->get_param('branch_id') ? (int) $r->get_param('branch_id') : null;
            return Http::ok((new ProductService())->lowStockAlerts($branch));
        });

        $inboundCaps = ['atoms_manage_inbound', 'atoms_manage_purchases'];

        $this->get($ns, '/purchases', Http::canAny($inboundCaps), function (WP_REST_Request $r) {
            $branch = $r->get_param('branch_id') ? (int) $r->get_param('branch_id') : null;
            return Http::ok((new PurchaseService())->list($branch));
        });
        $this->get($ns, '/purchases/(?P<id>\d+)', Http::canAny($inboundCaps), function (WP_REST_Request $r) {
            return Http::ok((new PurchaseService())->get((int) $r['id']));
        });
        $this->post($ns, '/purchases', Http::canAny($inboundCaps), function (WP_REST_Request $r) {
            return Http::ok((new PurchaseService())->create(Http::json($r)), 201);
        });
        $this->post($ns, '/purchases/(?P<id>\d+)/receive', 'atoms_manage_purchases', function (WP_REST_Request $r) {
            return Http::ok((new PurchaseService())->receive((int) $r['id']));
        });
        $this->post($ns, '/purchases/(?P<id>\d+)/receive-quantity', 'atoms_manage_purchases', function (WP_REST_Request $r) {
            $body = Http::json($r);
            return Http::ok((new PurchaseService())->receiveQuantity((int) $r['id'], $body['lines'] ?? []));
        });
        $this->post($ns, '/purchases/(?P<id>\d+)/inbound-imeis', Http::canAny($inboundCaps), function (WP_REST_Request $r) {
            $body = Http::json($r);
            return Http::ok((new PurchaseService())->preRegisterImeis((int) $r['id'], $body['imeis'] ?? []));
        });
        $this->post($ns, '/purchases/(?P<id>\d+)/imeis', 'atoms_register_imei', function (WP_REST_Request $r) {
            $body = Http::json($r);
            return Http::ok((new PurchaseService())->registerImeis((int) $r['id'], $body['imeis'] ?? []));
        });

        $this->get($ns, '/inbound/desk', Http::canAny($inboundCaps), function (WP_REST_Request $r) {
            $branch = $r->get_param('branch_id') ? (int) $r->get_param('branch_id') : null;
            return Http::ok((new InboundManifestService())->desk($branch));
        });
        $this->post($ns, '/inbound/shipment', Http::canAny($inboundCaps), function (WP_REST_Request $r) {
            return Http::ok((new InboundManifestService())->createShipment(Http::json($r)), 201);
        });
        $this->post($ns, '/inbound/units', Http::canAny($inboundCaps), function (WP_REST_Request $r) {
            $body = Http::json($r);
            if (!empty($body['imeis']) && is_array($body['imeis'])) {
                $purchaseId = (int) ($body['purchase_id'] ?? 0);
                if ($purchaseId <= 0) {
                    return Http::error(new \Atoms\Domain\DomainException('purchase_id is required for bulk units.'), 400);
                }
                return Http::ok((new InboundManifestService())->preRegisterUnits($purchaseId, $body['imeis']));
            }
            return Http::ok((new InboundManifestService())->preRegisterOne($body));
        });
        $this->get($ns, '/inbound/import', Http::canAny($inboundCaps), fn() => Http::ok((new InboundManifestService())->importCatalog()));
        $this->get($ns, '/inbound/template', Http::canAny($inboundCaps), function (WP_REST_Request $r) {
            return Http::ok((new InboundManifestService())->importTemplate((string) $r->get_param('type')));
        });
        $this->post($ns, '/inbound/import', Http::canAny($inboundCaps), function (WP_REST_Request $r) {
            $body = Http::json($r);
            return Http::ok((new InboundManifestService())->importManifest(
                (string) ($body['type'] ?? ''),
                (string) ($body['csv'] ?? '')
            ));
        });

        $this->get($ns, '/sales', 'atoms_read', function (WP_REST_Request $r) {
            return Http::ok((new SaleService())->list([
                'branch_id' => $r->get_param('branch_id'),
                'q'         => $r->get_param('q'),
            ]));
        });
        $this->get($ns, '/sales/(?P<id>\d+)', 'atoms_read', function (WP_REST_Request $r) {
            return Http::ok((new SaleService())->get((int) $r['id']));
        });
        $this->get($ns, '/sales/invoice/(?P<invoice>[A-Za-z0-9\-]+)', 'atoms_read', function (WP_REST_Request $r) {
            return Http::ok((new SaleService())->findByInvoice((string) $r['invoice']));
        });
        $this->post($ns, '/sales', 'atoms_create_sale', function (WP_REST_Request $r) {
            $body = Http::json($r);
            unset($body['imported'], $body['invoice_number'], $body['posted_at'], $body['sale_date']);
            return Http::ok(Http::once($r, 'sales', fn () => (new SaleService())->create($body)), 201);
        });
        $this->post($ns, '/sales/(?P<id>\d+)/void', 'atoms_void', function (WP_REST_Request $r) {
            $body = Http::json($r);
            return Http::ok((new SaleService())->void((int) $r['id'], (string) ($body['reason'] ?? '')));
        });

        $this->get($ns, '/returns', 'atoms_read', function (WP_REST_Request $r) {
            $bid = $r->get_param('branch_id') ? (int) $r->get_param('branch_id') : null;
            return Http::ok((new ReturnService())->list($bid));
        });
        $this->get($ns, '/returns/(?P<id>\d+)', 'atoms_read', function (WP_REST_Request $r) {
            return Http::ok((new ReturnService())->get((int) $r['id']));
        });
        $this->get($ns, '/returns/locate', 'atoms_create_return', function (WP_REST_Request $r) {
            return Http::ok((new ReturnService())->locate((string) $r->get_param('imei')));
        });
        $this->post($ns, '/returns', 'atoms_create_return', function (WP_REST_Request $r) {
            return Http::ok(Http::once($r, 'returns', fn () => (new ReturnService())->create(Http::json($r))), 201);
        });

        $this->get($ns, '/swaps', 'atoms_read', function (WP_REST_Request $r) {
            $bid = $r->get_param('branch_id') ? (int) $r->get_param('branch_id') : null;
            return Http::ok((new SwapService())->list($bid));
        });
        $this->get($ns, '/swaps/(?P<id>\d+)', 'atoms_read', function (WP_REST_Request $r) {
            return Http::ok((new SwapService())->get((int) $r['id']));
        });
        $this->post($ns, '/swaps', 'atoms_create_swap', function (WP_REST_Request $r) {
            return Http::ok((new SwapService())->create(Http::json($r)), 201);
        });

        $this->get($ns, '/transfers', 'atoms_manage_transfers', fn() => Http::ok((new TransferService())->list()));
        $this->get($ns, '/transfers/(?P<id>\d+)', 'atoms_manage_transfers', function (WP_REST_Request $r) {
            return Http::ok((new TransferService())->get((int) $r['id']));
        });
        $this->post($ns, '/transfers', 'atoms_manage_transfers', function (WP_REST_Request $r) {
            return Http::ok((new TransferService())->request(Http::json($r)), 201);
        });
        $this->post($ns, '/transfers/(?P<id>\d+)/approve', 'atoms_manage_transfers', function (WP_REST_Request $r) {
            return Http::ok((new TransferService())->approve((int) $r['id']));
        });
        $this->post($ns, '/transfers/(?P<id>\d+)/dispatch', 'atoms_manage_transfers', function (WP_REST_Request $r) {
            return Http::ok((new TransferService())->dispatch((int) $r['id']));
        });
        $this->post($ns, '/transfers/(?P<id>\d+)/receive', 'atoms_manage_transfers', function (WP_REST_Request $r) {
            return Http::ok((new TransferService())->receive((int) $r['id']));
        });

        $this->get($ns, '/stock-counts', 'atoms_manage_inventory', function (WP_REST_Request $r) {
            $bid = $r->get_param('branch_id') ? (int) $r->get_param('branch_id') : null;
            return Http::ok((new StockCountService())->list($bid));
        });
        $this->get($ns, '/stock-counts/(?P<id>\d+)', 'atoms_manage_inventory', function (WP_REST_Request $r) {
            return Http::ok((new StockCountService())->get((int) $r['id']));
        });
        $this->post($ns, '/stock-counts', 'atoms_manage_inventory', function (WP_REST_Request $r) {
            return Http::ok((new StockCountService())->open(Http::json($r)), 201);
        });
        $this->post($ns, '/stock-counts/(?P<id>\d+)/scan', 'atoms_manage_inventory', function (WP_REST_Request $r) {
            return Http::ok((new StockCountService())->scan((int) $r['id'], Http::json($r)));
        });
        $this->post($ns, '/stock-counts/(?P<id>\d+)/quantity', 'atoms_manage_inventory', function (WP_REST_Request $r) {
            return Http::ok((new StockCountService())->countQuantity((int) $r['id'], Http::json($r)));
        });
        $this->post($ns, '/stock-counts/(?P<id>\d+)/submit', 'atoms_manage_inventory', function (WP_REST_Request $r) {
            $body = Http::json($r);
            return Http::ok((new StockCountService())->submit((int) $r['id'], (string) ($body['reason'] ?? '')));
        });
        $this->post($ns, '/stock-counts/(?P<id>\d+)/cancel', 'atoms_manage_inventory', function (WP_REST_Request $r) {
            return Http::ok((new StockCountService())->cancel((int) $r['id']));
        });

        $this->get($ns, '/reports/sales', 'atoms_view_reports', function (WP_REST_Request $r) {
            [$from, $to, $bid] = $this->reportRange($r);
            return Http::ok((new ReportService())->sales($from, $to, $bid));
        });
        $this->get($ns, '/reports/inventory', 'atoms_view_reports', function (WP_REST_Request $r) {
            $bid = $r->get_param('branch_id') ? (int) $r->get_param('branch_id') : null;
            return Http::ok((new ReportService())->inventory($bid));
        });
        $this->get($ns, '/reports/payables', 'atoms_view_reports', fn() => Http::ok((new ReportService())->payables()));
        $this->get($ns, '/reports/expenses', 'atoms_view_reports', function (WP_REST_Request $r) {
            [$from, $to, $bid] = $this->reportRange($r);
            return Http::ok((new ReportService())->expenses($from, $to, $bid));
        });
        $this->get($ns, '/reports/pack', 'atoms_view_reports', function (WP_REST_Request $r) {
            [$from, $to, $bid, $period] = $this->reportRange($r, true);
            $pack = (new ReportService())->pack($from, $to, $bid);
            $pack['period'] = $period;

            return Http::ok($pack);
        });
        $this->get($ns, '/reports/export', 'atoms_view_reports', function (WP_REST_Request $r) {
            [$from, $to, $bid] = $this->reportRange($r);
            $type = (string) ($r->get_param('type') ?: 'sales');

            return Http::ok((new ReportService())->export(
                $type,
                $from,
                $to,
                $bid,
                (string) ($r->get_param('format') ?: 'csv')
            ));
        });

        $this->get($ns, '/repairs', 'atoms_manage_repairs', fn() => Http::ok((new RepairService())->list()));
        $this->get($ns, '/repairs/(?P<id>\d+)', 'atoms_manage_repairs', function (WP_REST_Request $r) {
            return Http::ok((new RepairService())->get((int) $r['id']));
        });
        $this->post($ns, '/repairs', 'atoms_manage_repairs', function (WP_REST_Request $r) {
            return Http::ok((new RepairService())->receive(Http::json($r)), 201);
        });
        $this->post($ns, '/repairs/(?P<id>\d+)/advance', 'atoms_manage_repairs', function (WP_REST_Request $r) {
            $body = Http::json($r);
            return Http::ok((new RepairService())->advance((int) $r['id'], (string) ($body['status'] ?? ''), (string) ($body['diagnosis'] ?? '')));
        });
        $this->post($ns, '/repairs/(?P<id>\d+)/resolve', 'atoms_manage_repairs', function (WP_REST_Request $r) {
            $body = Http::json($r);
            return Http::ok((new RepairService())->resolve((int) $r['id'], (string) ($body['outcome'] ?? 'stock')));
        });

        $this->get($ns, '/expenses', 'atoms_manage_expenses', fn() => Http::ok((new ExpenseService())->list()));
        $this->get($ns, '/expenses/(?P<id>\d+)', 'atoms_manage_expenses', function (WP_REST_Request $r) {
            return Http::ok((new ExpenseService())->get((int) $r['id']));
        });
        $this->post($ns, '/expenses', 'atoms_manage_expenses', function (WP_REST_Request $r) {
            return Http::ok((new ExpenseService())->submit(Http::json($r)), 201);
        });

        $this->get($ns, '/import', 'atoms_manage_settings', fn() => Http::ok((new ImportService())->catalog()));
        $this->get($ns, '/import/template', 'atoms_manage_settings', function (WP_REST_Request $r) {
            return Http::ok((new ImportService())->template((string) $r->get_param('type')));
        });
        $this->post($ns, '/import', 'atoms_manage_settings', function (WP_REST_Request $r) {
            $body = Http::json($r);
            return Http::ok((new ImportService())->run((string) ($body['type'] ?? ''), (string) ($body['csv'] ?? '')));
        });

        $this->get($ns, '/users', 'atoms_manage_settings', fn () => Http::ok((new UserService())->list()));
        $this->get($ns, '/users/roles', 'atoms_manage_settings', fn () => Http::ok((new UserService())->roleOptions()));
        $this->post($ns, '/users', 'atoms_manage_settings', function (WP_REST_Request $r) {
            return Http::ok((new UserService())->createStaff(Http::json($r)), 201);
        });
        $this->post($ns, '/users/(?P<id>\d+)', 'atoms_manage_settings', function (WP_REST_Request $r) {
            return Http::ok((new UserService())->updateStaff((int) $r['id'], Http::json($r)));
        });
        $this->post($ns, '/users/(?P<id>\d+)/branches', 'atoms_manage_settings', function (WP_REST_Request $r) {
            $body = Http::json($r);
            return Http::ok((new UserService())->assignBranches(
                (int) $r['id'],
                array_map('intval', $body['branch_ids'] ?? []),
                isset($body['default_branch_id']) ? (int) $body['default_branch_id'] : null
            ));
        });

        $this->get($ns, '/audit/export', 'atoms_view_audit', function (WP_REST_Request $r) {
            return Http::ok((new AuditLogger())->export($this->auditArgs($r)));
        });
        $this->get($ns, '/audit', 'atoms_view_audit', function (WP_REST_Request $r) {
            return Http::ok((new AuditLogger())->search($this->auditArgs($r)));
        });

        $this->get($ns, '/approvals', 'atoms_read', function () {
            if (!current_user_can('atoms_approve') && !current_user_can('atoms_approve_adjustments')) {
                return Http::error(new \RuntimeException('You cannot view approvals.'), 403);
            }
            return Http::ok((new ApprovalService())->pending());
        });
        $this->get($ns, '/approvals/(?P<id>\d+)', 'atoms_read', function (WP_REST_Request $r) {
            if (!current_user_can('atoms_approve') && !current_user_can('atoms_approve_adjustments')) {
                return Http::error(new \RuntimeException('You cannot view approvals.'), 403);
            }
            return Http::ok((new ApprovalService())->get((int) $r['id']));
        });
        $this->post($ns, '/approvals/(?P<id>\d+)/decide', 'atoms_read', function (WP_REST_Request $r) {
            $body = Http::json($r);
            return Http::ok((new ApprovalService())->decide((int) $r['id'], (string) ($body['decision'] ?? 'reject'), (string) ($body['notes'] ?? '')));
        });
    }

    public function bootstrap(): \WP_REST_Response
    {
        $ctx = new Context();
        $user = wp_get_current_user();
        $activeBranches = (new BranchService())->all(true);
        $mine = $ctx->branchIds();
        $visible = current_user_can('atoms_all_branches')
            ? $activeBranches
            : array_values(array_filter($activeBranches, static fn($b) => in_array((int) $b['id'], $mine, true)));

        return Http::ok([
            'user' => [
                'id'           => $user->ID,
                'name'         => $user->display_name,
                'roles'        => $user->roles,
                'capabilities' => array_values(array_filter(array_keys($user->allcaps), static fn($c) => str_starts_with((string) $c, 'atoms_') && !empty($user->allcaps[$c]))),
                'home'         => (new \Atoms\Services\HomeDashboardService())->forUser(
                    (int) $user->ID,
                    (array) $user->roles,
                    (new SettingsService())->expose()
                ),
            ],
            'branch_id' => $ctx->defaultBranchId() ?: ($visible[0]['id'] ?? null),
            'branches'  => $visible,
            'staff'       => (new UserService())->directory(),
            'staff_roles' => (new UserService())->roleOptions(),
            'settings'  => (new SettingsService())->expose() + ['version' => ATOMS_VERSION, 'currency' => 'NGN', 'symbol' => '₦'],
            'offline'   => (new OfflinePolicy())->manifest(),
            'archive'   => ['entities' => (new ArchivePolicy())->catalogEntities()],
            'wholesale' => (new WholesalePolicy())->manifest(),
        ]);
    }

    public function search(WP_REST_Request $r): \WP_REST_Response
    {
        return Http::ok((new SearchService())->query((string) $r->get_param('q')));
    }

    public function dashboard(WP_REST_Request $r): \WP_REST_Response
    {
        $bid = $r->get_param('branch_id') ? (int) $r->get_param('branch_id') : (new Context())->defaultBranchId();
        return Http::ok((new ReportService())->dashboard($bid));
    }

    /**
     * @return array<string, mixed>
     */
    private function auditArgs(WP_REST_Request $r): array
    {
        return [
            'q'           => $r->get_param('q'),
            'action'      => $r->get_param('action'),
            'entity_type' => $r->get_param('entity_type'),
            'user_id'     => $r->get_param('user_id'),
            'branch_id'   => $r->get_param('branch_id'),
            'from'        => $r->get_param('from'),
            'to'          => $r->get_param('to'),
            'page'        => $r->get_param('page'),
            'per_page'    => $r->get_param('per_page'),
        ];
    }

    /**
     * @return array{0: string, 1: string, 2: ?int}|array{0: string, 1: string, 2: ?int, 3: array{from: string, to: string, preset: string}}
     */
    private function reportRange(WP_REST_Request $r, bool $withPeriod = false): array
    {
        $hasDates = $r->get_param('from') || $r->get_param('to');
        $preset   = (string) ($r->get_param('preset') ?: ($hasDates ? 'custom' : 'today'));
        $period   = (new ReportService())->period(
            $preset,
            $r->get_param('from') ? (string) $r->get_param('from') : null,
            $r->get_param('to') ? (string) $r->get_param('to') : null
        );
        $bid = $r->get_param('branch_id') ? (int) $r->get_param('branch_id') : null;
        if ($withPeriod) {
            return [$period['from'], $period['to'], $bid, $period];
        }

        return [$period['from'], $period['to'], $bid];
    }

    private function get(string $ns, string $route, string|callable $cap, callable $cb): void
    {
        $this->add($ns, $route, 'GET', $cap, $cb);
    }

    private function post(string $ns, string $route, string|callable $cap, callable $cb): void
    {
        $this->add($ns, $route, 'POST', $cap, $cb);
    }

    private function publicGet(string $ns, string $route, callable $cb): void
    {
        $this->addPublic($ns, $route, 'GET', $cb);
    }

    private function publicPost(string $ns, string $route, callable $cb): void
    {
        $this->addPublic($ns, $route, 'POST', $cb);
    }

    private function add(string $ns, string $route, string $method, string|callable $cap, callable $cb): void
    {
        $permission = is_string($cap) ? Http::can($cap) : $cap;
        register_rest_route($ns, $route, [
            'methods'             => $method,
            'permission_callback' => $permission,
            'callback'            => function (WP_REST_Request $request) use ($cb) {
                try {
                    (new Guard())->assert();
                    return $cb($request);
                } catch (RateLimited $e) {
                    return Http::error($e, 429);
                } catch (\Throwable $e) {
                    return Http::error($e);
                }
            },
        ]);
    }

    private function addPublic(string $ns, string $route, string $method, callable $cb): void
    {
        register_rest_route($ns, $route, [
            'methods'             => $method,
            'permission_callback' => '__return_true',
            'callback'            => function (WP_REST_Request $request) use ($cb) {
                try {
                    return $cb($request);
                } catch (\Throwable $e) {
                    return Http::error($e);
                }
            },
        ]);
    }
}
