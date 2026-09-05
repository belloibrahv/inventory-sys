<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\CsvExporter;
use Atoms\Domain\CsvParser;
use Atoms\Domain\DomainException;
use Atoms\Domain\ImeiStatus;
use Atoms\Domain\Money;
use Atoms\Domain\WholesalePolicy;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class ImportService
{
    public const TYPES = ['products', 'customers', 'suppliers', 'imeis', 'serials', 'stock', 'inbound', 'inbound_imeis', 'sales'];

    /** @var list<string> */
    public const INBOUND_TYPES = ['inbound', 'inbound_imeis'];

    private const MAX_ROWS = 2000;

    /**
     * @var array<string, list<string>>
     */
    private const REQUIRED = [
        'products'  => ['sku', 'name'],
        'customers' => ['name', 'phone'],
        'suppliers' => ['name'],
        'imeis'     => ['imei', 'sku', 'branch_code'],
        'serials'   => ['serial_number', 'sku', 'branch_code'],
        'stock'     => ['sku', 'branch_code', 'quantity'],
        'inbound'   => ['supplier_name', 'branch_code', 'po_invoice', 'sku', 'quantity'],
        'inbound_imeis' => ['supplier_name', 'branch_code', 'po_invoice', 'sku', 'imei'],
        'sales'     => ['imei', 'selling_price', 'branch_code'],
    ];

    /**
     * @var array<string, list<string>>
     */
    private const HEADERS = [
        'products'  => ['sku', 'name', 'brand', 'category', 'track_mode', 'min_selling_price', 'default_cost_price', 'warranty_days', 'low_stock_threshold', 'color', 'storage', 'variant_min'],
        'customers' => ['name', 'phone', 'email', 'address', 'branch_code', 'opening_balance'],
        'suppliers' => ['name', 'phone', 'email', 'address', 'contact_person', 'opening_balance'],
        'imeis'     => ['imei', 'sku', 'branch_code', 'cost_price', 'status', 'color', 'storage', 'serial_number'],
        'serials'   => ['serial_number', 'sku', 'branch_code', 'cost_price', 'color', 'storage'],
        'stock'     => ['sku', 'branch_code', 'quantity', 'cost_price', 'color', 'storage'],
        'inbound'   => ['supplier_name', 'branch_code', 'po_invoice', 'expected_arrival', 'sku', 'quantity', 'cost_price', 'color', 'storage', 'notes'],
        'inbound_imeis' => ['supplier_name', 'branch_code', 'po_invoice', 'expected_arrival', 'sku', 'imei', 'serial_number', 'cost_price', 'color', 'storage', 'notes'],
        'sales'     => ['invoice_number', 'imei', 'sku', 'branch_code', 'customer_phone', 'selling_price', 'paid_amount', 'sale_date', 'payment_method', 'sale_type', 'color', 'storage', 'serial_number', 'cost_price'],
    ];

    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly CsvParser $parser = new CsvParser(),
        private readonly CsvExporter $exporter = new CsvExporter(),
        private readonly ProductService $products = new ProductService(),
        private readonly CustomerService $customers = new CustomerService(),
        private readonly SupplierService $suppliers = new SupplierService(),
        private readonly BranchService $branches = new BranchService(),
        private readonly ImeiService $imeis = new ImeiService(),
        private readonly SaleService $sales = new SaleService(),
        private readonly LedgerService $ledger = new LedgerService(),
        private readonly PurchaseService $purchases = new PurchaseService(),
        private readonly StockService $stock = new StockService(),
        private readonly AuditLogger $audit = new AuditLogger()
    ) {
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function catalog(): array
    {
        return [
            [
                'id'      => 'products',
                'label'   => 'Products',
                'headers' => self::HEADERS['products'],
                'notes'   => 'Prices in naira. track_mode: imei (phones), serial (serialized accessories), quantity (cables/chargers). Optional color, storage, and variant_min create or update a variant.',
            ],
            [
                'id'      => 'customers',
                'label'   => 'Customers',
                'headers' => self::HEADERS['customers'],
                'notes'   => 'Match on phone. Opening balance is what they still owe (posted once).',
            ],
            [
                'id'      => 'suppliers',
                'label'   => 'Suppliers',
                'headers' => self::HEADERS['suppliers'],
                'notes'   => 'Match on name. Opening balance is what we still owe (posted once).',
            ],
            [
                'id'      => 'imeis',
                'label'   => 'Phones (IMEI opening stock)',
                'headers' => self::HEADERS['imeis'],
                'notes'   => 'Status: available or faulty. For phones with IMEI before goods arrive, use Inbound purchase orders then register IMEIs when received.',
            ],
            [
                'id'      => 'serials',
                'label'   => 'Serialized items (serial numbers)',
                'headers' => self::HEADERS['serials'],
                'notes'   => 'For laptops, tablets, or accessories tracked by serial — not 15-digit IMEI.',
            ],
            [
                'id'      => 'stock',
                'label'   => 'Quantity stock (accessories)',
                'headers' => self::HEADERS['stock'],
                'notes'   => 'Bulk qty for chargers, cables, and other items with no individual ID. Product track_mode must be quantity.',
            ],
            [
                'id'      => 'inbound',
                'label'   => 'Inbound supplier manifest (PO)',
                'headers' => self::HEADERS['inbound'],
                'notes'   => 'Populate expected goods before arrival — like ATUM inbound stock. Creates/updates a purchase order in Ordered status.',
            ],
            [
                'id'      => 'inbound_imeis',
                'label'   => 'Inbound IMEI manifest (pre-register)',
                'headers' => self::HEADERS['inbound_imeis'],
                'notes'   => 'Load supplier IMEI lists before goods arrive. Units are reserved until you receive the PO.',
            ],
            [
                'id'      => 'sales',
                'label'   => 'Sales (history)',
                'headers' => self::HEADERS['sales'],
                'notes'   => 'Keeps the original invoice number and sale date. sale_type is retail or wholesale — wholesale needs customer_phone. color/storage create opening stock when the IMEI is new. Day-to-day POS still cannot backdate.',
            ],
        ];
    }

    /**
     * Import types allowed on the inbound manifest desk (pre-arrival only).
     *
     * @return list<array<string, mixed>>
     */
    public function inboundCatalog(): array
    {
        return array_values(array_filter(
            $this->catalog(),
            static fn(array $row): bool => in_array((string) ($row['id'] ?? ''), self::INBOUND_TYPES, true)
        ));
    }

    /**
     * @return array<string, mixed>
     */
    public function runInbound(string $type, string $csv): array
    {
        if (!in_array($type, self::INBOUND_TYPES, true)) {
            throw new DomainException('Import type must be inbound or inbound_imeis.');
        }

        return $this->run($type, $csv);
    }

    /**
     * @return array{csv: string, filename: string, type: string}
     */
    public function template(string $type): array
    {
        $type = $this->assertType($type);
        $headers = self::HEADERS[$type];

        return [
            'type'     => $type,
            'filename' => 'atoms-import-' . $type . '.csv',
            'csv'      => $this->exporter->toString($headers, []),
        ];
    }

    /**
     * @return array{type: string, created: int, updated: int, skipped: int, errors: list<array{row: int, message: string}>}
     */
    public function run(string $type, string $csv): array
    {
        $type = $this->assertType($type);
        $rows = $this->parser->parse($csv);
        if ($rows === []) {
            throw new DomainException('The CSV has a header but no data rows.');
        }
        if (count($rows) > self::MAX_ROWS) {
            throw new DomainException('Import is limited to ' . self::MAX_ROWS . ' rows. Split the file.');
        }
        $this->parser->assertHeaders($rows[0], self::REQUIRED[$type]);

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors  = [];
        foreach ($rows as $i => $row) {
            $line = $i + 2;
            try {
                $result = match ($type) {
                    'products'  => $this->importProduct($row),
                    'customers' => $this->importCustomer($row),
                    'suppliers' => $this->importSupplier($row),
                    'imeis'     => $this->importImei($row),
                    'serials'   => $this->importSerial($row),
                    'stock'     => $this->importStock($row),
                    'inbound'   => $this->importInbound($row),
                    'inbound_imeis' => $this->importInboundImei($row),
                    'sales'     => $this->importSale($row),
                    default     => throw new DomainException('Unknown import type.'),
                };
                if ($result === 'created') {
                    $created++;
                } elseif ($result === 'updated') {
                    $updated++;
                } else {
                    $skipped++;
                }
            } catch (\Throwable $e) {
                $errors[] = ['row' => $line, 'message' => $e->getMessage()];
            }
        }

        $this->audit->log('import.ran', 'import', null, null, [
            'type'    => $type,
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
            'errors'  => count($errors),
        ]);

        return compact('type', 'created', 'updated', 'skipped', 'errors');
    }

    /**
     * @param array<string, string> $row
     */
    private function importProduct(array $row): string
    {
        $sku = trim($row['sku'] ?? '');
        $name = trim($row['name'] ?? '');
        if ($sku === '' || $name === '') {
            throw new DomainException('SKU and name are required.');
        }
        $existing = $this->products->findBySku($sku);
        $payload = [
            'sku'                => $sku,
            'name'               => $name,
            'brand'              => $row['brand'] ?? '',
            'category'           => $row['category'] ?? 'Phone',
            'track_mode'         => $row['track_mode'] ?? '',
            'min_selling_price'  => $row['min_selling_price'] ?? 0,
            'default_cost_price' => $row['default_cost_price'] ?? $row['cost_price'] ?? 0,
        ];
        if (array_key_exists('warranty_days', $row) && $row['warranty_days'] !== '') {
            $payload['warranty_days'] = (int) $row['warranty_days'];
        }
        if (array_key_exists('low_stock_threshold', $row) && $row['low_stock_threshold'] !== '') {
            $payload['low_stock_threshold'] = max(0, (int) $row['low_stock_threshold']);
        }
        $saved = $this->products->save($existing ? (int) $existing['id'] : null, $payload);
        $productId = (int) $saved['id'];
        $color = trim($row['color'] ?? $row['colour'] ?? '');
        $storage = trim($row['storage'] ?? '');
        if ($color !== '' || $storage !== '') {
            $variant = [
                'color'   => $color,
                'storage' => $storage,
            ];
            if (array_key_exists('variant_min', $row) && $row['variant_min'] !== '') {
                $variant['min_selling_price'] = $row['variant_min'];
            }
            $this->products->addVariant($productId, $variant);
        }

        return $existing ? 'updated' : 'created';
    }

    /**
     * @param array<string, string> $row
     */
    private function importCustomer(array $row): string
    {
        $phone = trim($row['phone'] ?? '');
        $name  = trim($row['name'] ?? '');
        if ($phone === '' || $name === '') {
            throw new DomainException('Customer name and phone are required.');
        }
        $branchId = $this->branchId($row['branch_code'] ?? '');
        $existing = $this->customers->findByPhone($phone);
        $saved = $this->customers->save($existing ? (int) $existing['id'] : null, [
            'name'      => $name,
            'phone'     => $phone,
            'email'     => $row['email'] ?? '',
            'address'   => $row['address'] ?? '',
            'branch_id' => $branchId,
        ]);
        $this->openingBalance('customer', (int) $saved['id'], $row['opening_balance'] ?? '', $branchId, 'Opening customer balance imported');

        return $existing ? 'updated' : 'created';
    }

    /**
     * @param array<string, string> $row
     */
    private function importSupplier(array $row): string
    {
        $name = trim($row['name'] ?? '');
        if ($name === '') {
            throw new DomainException('Supplier name is required.');
        }
        $phone = trim($row['phone'] ?? '');
        $existing = $this->suppliers->findByName($name, $phone);
        $saved = $this->suppliers->save($existing ? (int) $existing['id'] : null, [
            'name'           => $name,
            'phone'          => $phone,
            'email'          => $row['email'] ?? '',
            'address'        => $row['address'] ?? '',
            'contact_person' => $row['contact_person'] ?? '',
        ]);
        $branchId = $this->context->defaultBranchId();
        $this->openingBalance('supplier', (int) $saved['id'], $row['opening_balance'] ?? '', $branchId, 'Opening supplier balance imported');

        return $existing ? 'updated' : 'created';
    }

    /**
     * @param array<string, string> $row
     */
    private function importImei(array $row): string
    {
        $imei = trim($row['imei'] ?? '');
        try {
            $this->imeis->getByImei($imei);

            return 'skipped';
        } catch (DomainException) {
            // new device
        }
        $product = $this->products->findBySku(trim($row['sku'] ?? ''));
        if (!$product) {
            throw new DomainException('Unknown product SKU. Import products first.');
        }
        $branchId = $this->branchId($row['branch_code'] ?? '', true);
        $status = strtolower(trim($row['status'] ?? 'available')) ?: 'available';
        if (!in_array($status, ['available', 'faulty'], true)) {
            throw new DomainException('IMEI import only accepts available or faulty. Sold devices go in the sales file.');
        }
        $rawCost = trim((string) ($row['cost_price'] ?? ''));
        $cost = $rawCost !== '' ? $rawCost : ((int) $product['default_cost_price']) / 100;
        $color   = trim($row['color'] ?? $row['colour'] ?? '');
        $storage = trim($row['storage'] ?? '');
        $variantId = $this->products->resolveVariantId((int) $product['id'], $color, $storage);
        $registered = $this->imeis->register([
            'imei'          => $imei,
            'product_id'    => (int) $product['id'],
            'variant_id'    => $variantId,
            'branch_id'     => $branchId,
            'serial_number' => trim($row['serial_number'] ?? ''),
            'cost_price'    => Money::fromMajor($cost)->minor(),
            'source_type'   => 'import',
            'notes'         => 'Imported opening stock',
        ]);
        if ($status === 'faulty') {
            $this->imeis->applyEvent((int) $registered['id'], 'mark_faulty', 'import', (int) $registered['id'], $branchId, 'Imported as faulty');
        }

        return 'created';
    }

    /**
     * @param array<string, string> $row
     */
    private function importSerial(array $row): string
    {
        $serial = trim($row['serial_number'] ?? '');
        if ($serial === '') {
            throw new DomainException('Serial number is required.');
        }
        try {
            $this->imeis->getByImei($serial);

            return 'skipped';
        } catch (DomainException) {
            // new unit
        }
        $product = $this->products->findBySku(trim($row['sku'] ?? ''));
        if (!$product) {
            throw new DomainException('Unknown product SKU. Import products first.');
        }
        if ($this->products->trackMode($product) === 'imei') {
            throw new DomainException('This SKU is a phone (IMEI tracked). Use the IMEIs import instead.');
        }
        if ($this->products->trackMode($product) === 'quantity') {
            throw new DomainException('This SKU is quantity-tracked. Use the stock import instead.');
        }
        $branchId = $this->branchId($row['branch_code'] ?? '', true);
        $color   = trim($row['color'] ?? $row['colour'] ?? '');
        $storage = trim($row['storage'] ?? '');
        $variantId = $this->products->resolveVariantId((int) $product['id'], $color, $storage);
        $rawCost = trim((string) ($row['cost_price'] ?? ''));
        $cost = $rawCost !== '' ? $rawCost : ((int) $product['default_cost_price']) / 100;
        $this->imeis->register([
            'imei'          => $serial,
            'serial_number' => $serial,
            'product_id'    => (int) $product['id'],
            'variant_id'    => $variantId,
            'branch_id'     => $branchId,
            'cost_price'    => Money::fromMajor($cost)->minor(),
            'source_type'   => 'import',
            'notes'         => 'Imported serialized unit',
        ]);

        return 'created';
    }

    /**
     * @param array<string, string> $row
     */
    private function importStock(array $row): string
    {
        $product = $this->products->findBySku(trim($row['sku'] ?? ''));
        if (!$product) {
            throw new DomainException('Unknown product SKU. Import products first.');
        }
        if ($this->products->trackMode($product) !== 'quantity') {
            throw new DomainException('This SKU is unit-tracked (IMEI/serial). Use IMEIs or serials import.');
        }
        $branchId = $this->branchId($row['branch_code'] ?? '', true);
        $qty = max(0, (int) ($row['quantity'] ?? 0));
        if ($qty <= 0) {
            throw new DomainException('Quantity must be greater than zero.');
        }
        $color   = trim($row['color'] ?? $row['colour'] ?? '');
        $storage = trim($row['storage'] ?? '');
        $variantId = $this->products->resolveVariantId((int) $product['id'], $color, $storage);
        $this->stock->adjust($branchId, (int) $product['id'], $variantId, $qty, 'CSV import');

        return 'created';
    }

    /**
     * @param array<string, string> $row
     */
    private function importInbound(array $row): string
    {
        $supplierName = trim($row['supplier_name'] ?? '');
        $poInvoice = trim($row['po_invoice'] ?? '');
        $sku = trim($row['sku'] ?? '');
        $qty = max(1, (int) ($row['quantity'] ?? 1));
        if ($supplierName === '' || $poInvoice === '' || $sku === '') {
            throw new DomainException('supplier_name, po_invoice, and sku are required.');
        }
        $supplier = $this->suppliers->findByName($supplierName, '');
        if (!$supplier) {
            $supplier = $this->suppliers->save(null, ['name' => $supplierName]);
        }
        $product = $this->products->findBySku($sku);
        if (!$product) {
            throw new DomainException('Unknown product SKU. Import products first.');
        }
        $branchId = $this->branchId($row['branch_code'] ?? '', true);
        $color   = trim($row['color'] ?? $row['colour'] ?? '');
        $storage = trim($row['storage'] ?? '');
        $variantId = $this->products->resolveVariantId((int) $product['id'], $color, $storage);
        $rawCost = trim((string) ($row['cost_price'] ?? ''));
        $cost = $rawCost !== '' ? $rawCost : ((int) $product['default_cost_price']) / 100;

        global $wpdb;
        $purchaseTable = $this->db->table('purchases');
        $existingId = (int) $wpdb->get_var(
            $wpdb->prepare("SELECT id FROM {$purchaseTable} WHERE invoice_number = %s LIMIT 1", $poInvoice)
        );
        if (!$existingId) {
            $this->purchases->create([
                'supplier_id'      => (int) $supplier['id'],
                'branch_id'        => $branchId,
                'invoice_number'   => $poInvoice,
                'expected_arrival' => trim($row['expected_arrival'] ?? '') ?: null,
                'notes'            => trim($row['notes'] ?? '') ?: 'Imported inbound manifest',
                'items'            => [[
                    'product_id'  => (int) $product['id'],
                    'variant_id'  => $variantId,
                    'cost_price'  => $cost,
                    'quantity'    => $qty,
                ]],
            ]);

            return 'created';
        }

        $purchase = $this->purchases->get($existingId);
        if (!in_array($purchase['status'], ['ordered', 'draft', 'inspecting'], true)) {
            throw new DomainException('Purchase ' . $poInvoice . ' is already received and cannot accept inbound lines.');
        }
        $matched = false;
        foreach ($purchase['items'] as $item) {
            if ((int) $item['product_id'] === (int) $product['id']
                && (int) ($item['variant_id'] ?? 0) === (int) ($variantId ?? 0)) {
                $this->db->update('purchase_items', [
                    'quantity'   => (int) $item['quantity'] + $qty,
                    'cost_price' => Money::fromMajor($cost)->minor(),
                ], ['id' => (int) $item['id']]);
                $matched = true;
                break;
            }
        }
        if (!$matched) {
            $this->db->insert('purchase_items', [
                'purchase_id' => $existingId,
                'product_id'  => (int) $product['id'],
                'variant_id'  => $variantId,
                'cost_price'  => Money::fromMajor($cost)->minor(),
                'quantity'    => $qty,
                'received_qty'=> 0,
            ]);
        }
        if (!empty($row['expected_arrival'])) {
            $this->db->update('purchases', [
                'expected_arrival' => sanitize_text_field($row['expected_arrival']),
                'updated_at'       => $this->db->now(),
            ], ['id' => $existingId]);
        }

        return 'updated';
    }

    /**
     * @param array<string, string> $row
     */
    private function importInboundImei(array $row): string
    {
        $imei = trim($row['imei'] ?? '');
        if ($imei === '') {
            throw new DomainException('imei is required for inbound unit manifest.');
        }
        try {
            $this->imeis->getByImei($imei);

            return 'skipped';
        } catch (DomainException) {
            // new unit
        }

        $this->importInbound(array_merge($row, ['quantity' => '1']));
        $poInvoice = trim($row['po_invoice'] ?? '');
        global $wpdb;
        $purchaseId = (int) $wpdb->get_var(
            $wpdb->prepare('SELECT id FROM ' . $this->db->table('purchases') . ' WHERE invoice_number = %s LIMIT 1', $poInvoice)
        );
        if (!$purchaseId) {
            throw new DomainException('Purchase order was not created for ' . $poInvoice);
        }
        $product = $this->products->findBySku(trim($row['sku'] ?? ''));
        if (!$product) {
            throw new DomainException('Unknown product SKU.');
        }
        $color   = trim($row['color'] ?? $row['colour'] ?? '');
        $storage = trim($row['storage'] ?? '');
        $variantId = $this->products->resolveVariantId((int) $product['id'], $color, $storage);

        $this->purchases->preRegisterImeis($purchaseId, [[
            'imei'          => $imei,
            'serial_number' => trim($row['serial_number'] ?? ''),
            'product_id'    => (int) $product['id'],
            'variant_id'    => $variantId,
        ]]);

        return 'created';
    }

    /**
     * @param array<string, string> $row
     */
    private function importSale(array $row): string
    {
        $invoice = strtoupper(trim($row['invoice_number'] ?? ''));
        if ($invoice !== '' && $this->sales->invoiceExists($invoice)) {
            return 'skipped';
        }
        $imeiDigits = trim($row['imei'] ?? '');
        $branchId = $this->branchId($row['branch_code'] ?? '', true);
        try {
            $imei = $this->imeis->getByImei($imeiDigits);
        } catch (DomainException) {
            $sku = trim($row['sku'] ?? '');
            if ($sku === '') {
                throw new DomainException('Unknown IMEI. Add sku so opening stock can be created, then sold.');
            }
            $this->importImei([
                'imei'          => $imeiDigits,
                'sku'           => $sku,
                'branch_code'   => $row['branch_code'] ?? '',
                'cost_price'    => $row['cost_price'] ?? '0',
                'status'        => 'available',
                'color'         => $row['color'] ?? $row['colour'] ?? '',
                'storage'       => $row['storage'] ?? '',
                'serial_number' => $row['serial_number'] ?? '',
            ]);
            $imei = $this->imeis->getByImei($imeiDigits);
        }
        if ((string) $imei['status'] !== ImeiStatus::Available->value) {
            throw new DomainException('IMEI ' . $imei['imei'] . ' is ' . $imei['status'] . ', not in stock.');
        }
        if ((int) $imei['branch_id'] !== $branchId) {
            throw new DomainException('IMEI belongs to another branch. Do not move stock via import.');
        }

        $customerId = null;
        $phone = trim($row['customer_phone'] ?? '');
        if ($phone !== '') {
            $customer = $this->customers->findByPhone($phone);
            if (!$customer) {
                $customer = $this->customers->save(null, [
                    'name'      => $row['customer_name'] ?? ('Imported ' . $phone),
                    'phone'     => $phone,
                    'branch_id' => $branchId,
                ]);
            }
            $customerId = (int) $customer['id'];
        }

        $this->sales->create([
            'imported'        => true,
            'invoice_number'  => $invoice,
            'branch_id'       => $branchId,
            'customer_id'     => $customerId,
            'sale_type'       => (new WholesalePolicy())->normalize((string) ($row['sale_type'] ?? 'retail')),
            'payment_method'  => ($row['payment_method'] ?? '') !== '' ? $row['payment_method'] : 'cash',
            'paid_amount'     => ($row['paid_amount'] ?? '') !== '' ? $row['paid_amount'] : ($row['selling_price'] ?? 0),
            'posted_at'       => $row['sale_date'] ?? '',
            'items'           => [[
                'imei'          => $imei['imei'],
                'selling_price' => $row['selling_price'],
            ]],
        ]);

        return 'created';
    }

    private function openingBalance(string $partyType, int $partyId, string $raw, ?int $branchId, string $label): void
    {
        $raw = trim($raw);
        if ($raw === '' || $raw === '0') {
            return;
        }
        $amount = Money::fromMajor($raw);
        if ($amount->isZero() || $amount->isNegative()) {
            return;
        }
        if ($this->ledger->hasReference($partyType, $partyId, 'opening_balance')) {
            return;
        }
        $this->ledger->post($partyType, $partyId, 'debit', $amount, 'opening_balance', $partyId, $label, $branchId);
    }

    private function branchId(string $code, bool $required = false): ?int
    {
        $code = trim($code);
        if ($code === '') {
            if ($required) {
                throw new DomainException('Branch code is required.');
            }

            return $this->context->defaultBranchId();
        }
        $branch = $this->branches->findByCode($code);
        if (!$branch) {
            throw new DomainException('Unknown branch code: ' . $code);
        }
        $this->context->assertBranchAccess((int) $branch['id']);

        return (int) $branch['id'];
    }

    private function assertType(string $type): string
    {
        $type = sanitize_key($type);
        if (!in_array($type, self::TYPES, true)) {
            throw new DomainException('Import type must be products, customers, suppliers, imeis, serials, stock, inbound, inbound_imeis, or sales.');
        }

        return $type;
    }
}
