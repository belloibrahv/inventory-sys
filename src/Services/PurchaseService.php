<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\InvoiceNumber;
use Atoms\Domain\Money;
use Atoms\Domain\VariantLabel;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class PurchaseService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly AuditLogger $audit = new AuditLogger(),
        private readonly ImeiService $imeis = new ImeiService(),
        private readonly BranchService $branches = new BranchService(),
        private readonly LedgerService $ledger = new LedgerService(),
        private readonly ProductService $products = new ProductService(),
        private readonly StockService $stock = new StockService()
    ) {
    }

    /**
     * @param array<string, mixed> $data
     */
    public function create(array $data): array
    {
        $branch = $this->branches->get((int) $data['branch_id']);
        $this->context->assertBranchAccess((int) $branch['id']);

        return $this->db->transaction(function () use ($data, $branch) {
            $seq   = $this->db->nextSequence('PO-' . $branch['code'] . '-' . $this->db->year());
            $inv   = InvoiceNumber::next('PO', (string) $branch['code'], (int) $this->db->year(), $seq);
            $supplied = trim((string) ($data['invoice_number'] ?? ''));
            $id    = $this->db->insert('purchases', [
                'supplier_id'      => (int) $data['supplier_id'],
                'branch_id'        => (int) $data['branch_id'],
                'invoice_number'   => $supplied !== '' ? sanitize_text_field($supplied) : $inv,
                'purchase_date'    => sanitize_text_field((string) ($data['purchase_date'] ?? $this->db->today())),
                'expected_arrival' => !empty($data['expected_arrival']) ? sanitize_text_field((string) $data['expected_arrival']) : null,
                'status'           => 'ordered',
                'notes'            => sanitize_textarea_field((string) ($data['notes'] ?? '')),
                'created_by'       => $this->context->userId(),
                'created_at'       => $this->db->now(),
                'updated_at'       => $this->db->now(),
            ]);

            foreach ($data['items'] ?? [] as $item) {
                $variantId = !empty($item['variant_id'])
                    ? (int) $item['variant_id']
                    : $this->products->soleActiveVariantId((int) $item['product_id']);
                $this->db->insert('purchase_items', [
                    'purchase_id' => $id,
                    'product_id'  => (int) $item['product_id'],
                    'variant_id'  => $variantId,
                    'cost_price'  => Money::fromMajor($item['cost_price'] ?? 0)->minor(),
                    'quantity'    => (int) $item['quantity'],
                    'received_qty'=> 0,
                ]);
            }

            $this->audit->log('purchase.created', 'purchase', $id, null, $data, (int) $data['branch_id']);

            return $this->get($id);
        });
    }

    public function receive(int $id): array
    {
        $purchase = $this->get($id);
        if (!in_array($purchase['status'], ['ordered', 'draft'], true)) {
            throw new DomainException('This purchase cannot be received in its current status.');
        }

        $this->db->update('purchases', [
            'status'     => 'inspecting',
            'updated_at' => $this->db->now(),
        ], ['id' => $id]);

        $this->confirmInboundReserved($id, (int) $purchase['branch_id']);

        $this->audit->log('purchase.received', 'purchase', $id, ['status' => $purchase['status']], ['status' => 'inspecting'], (int) $purchase['branch_id']);

        return $this->get($id);
    }

    /**
     * Pre-register IMEIs/serials on a PO before physical arrival (status: reserved).
     *
     * @param list<array<string, mixed>> $imeis
     */
    public function preRegisterImeis(int $purchaseId, array $imeis): array
    {
        $purchase = $this->get($purchaseId);
        if (!in_array($purchase['status'], ['ordered', 'inspecting', 'draft'], true)) {
            throw new DomainException('Inbound units can only be pre-registered while the order is open.');
        }
        if ($imeis === []) {
            throw new DomainException('No units were provided.');
        }

        return $this->db->transaction(function () use ($purchase, $imeis, $purchaseId) {
            $items = $purchase['items'];
            foreach ($imeis as $row) {
                $index = $this->matchItemIndex($items, (int) $row['product_id'], isset($row['variant_id']) ? (int) $row['variant_id'] : null);
                $item  = $items[$index];
                $product = $this->products->get((int) $item['product_id']);
                $mode = $this->products->trackMode($product);
                if ($mode === 'quantity') {
                    throw new DomainException('Quantity lines use receive-quantity, not IMEI pre-registration.');
                }
                if ((int) $item['received_qty'] >= (int) $item['quantity']) {
                    throw new DomainException('Purchase line is already fully registered for ' . ($product['name'] ?? ''));
                }

                $this->imeis->register([
                    'imei'           => $row['imei'],
                    'serial_number'  => $row['serial_number'] ?? '',
                    'product_id'     => (int) $row['product_id'],
                    'variant_id'     => !empty($row['variant_id']) ? (int) $row['variant_id'] : ($item['variant_id'] ?? null),
                    'branch_id'      => (int) $purchase['branch_id'],
                    'source_type'    => 'purchase',
                    'source_id'      => $purchaseId,
                    'cost_price'     => $item['cost_price'],
                    'condition_grade'=> sanitize_text_field((string) ($row['condition_grade'] ?? 'new')) ?: 'new',
                    'status'         => 'reserved',
                    'notes'          => 'Pre-registered on inbound manifest',
                ]);
            }

            $this->audit->log('purchase.inbound_preregistered', 'purchase', $purchaseId, null, ['count' => count($imeis)], (int) $purchase['branch_id']);

            return $this->get($purchaseId);
        });
    }

    /**
     * Register IMEIs against a received purchase. Quantity must match remaining expected units.
     *
     * @param list<array<string, mixed>> $imeis
     */
    public function registerImeis(int $purchaseId, array $imeis): array
    {
        $purchase = $this->get($purchaseId);
        if (!in_array($purchase['status'], ['inspecting', 'received', 'ordered'], true)) {
            throw new DomainException('IMEIs can only be registered during inspection.');
        }

        return $this->db->transaction(function () use ($purchase, $imeis, $purchaseId) {
            $items = $purchase['items'];
            foreach ($imeis as $row) {
                $index = $this->matchItemIndex($items, (int) $row['product_id'], isset($row['variant_id']) ? (int) $row['variant_id'] : null);
                $this->registerOrConfirmImei($purchase, $purchaseId, $row, $items, $index);
            }

            $fresh    = $this->get($purchaseId);
            $complete = true;
            foreach ($fresh['items'] as $item) {
                if ((int) $item['received_qty'] < (int) $item['quantity']) {
                    $complete = false;
                    break;
                }
            }

            if ($complete) {
                if (($purchase['status'] ?? '') !== 'completed') {
                    $this->finalizePurchase($purchase, $fresh, $purchaseId);
                }
            } else {
                $this->db->update('purchases', [
                    'status'     => 'inspecting',
                    'updated_at' => $this->db->now(),
                ], ['id' => $purchaseId]);
            }

            $this->audit->log('purchase.imeis_registered', 'purchase', $purchaseId, null, ['count' => count($imeis)], (int) $purchase['branch_id']);

            return $this->get($purchaseId);
        });
    }

    /**
     * Receive quantity-tracked lines against a purchase (accessories, cables, etc.).
     *
     * @param list<array{item_id?: int, product_id?: int, variant_id?: int, quantity?: int}> $lines
     */
    public function receiveQuantity(int $purchaseId, array $lines): array
    {
        $purchase = $this->get($purchaseId);
        if (!in_array($purchase['status'], ['ordered', 'inspecting', 'received'], true)) {
            throw new DomainException('Quantity stock can only be received while the order is open.');
        }
        if ($lines === []) {
            throw new DomainException('No quantity lines were provided.');
        }

        return $this->db->transaction(function () use ($purchase, $lines, $purchaseId) {
            $items = $purchase['items'];
            foreach ($lines as $line) {
                $qty = max(1, (int) ($line['quantity'] ?? 0));
                if (!empty($line['item_id'])) {
                    $index = $this->itemIndexById($items, (int) $line['item_id']);
                } else {
                    $index = $this->matchItemIndex(
                        $items,
                        (int) ($line['product_id'] ?? 0),
                        isset($line['variant_id']) ? (int) $line['variant_id'] : null
                    );
                }
                $item = $items[$index];
                $product = $this->products->get((int) $item['product_id']);
                if ($this->products->trackMode($product) !== 'quantity') {
                    throw new DomainException('Line is not quantity-tracked: ' . ($product['name'] ?? ''));
                }
                $remaining = (int) $item['quantity'] - (int) $item['received_qty'];
                if ($qty > $remaining) {
                    throw new DomainException('Cannot receive more than ordered for ' . ($product['name'] ?? ''));
                }

                $variantId = !empty($item['variant_id']) ? (int) $item['variant_id'] : null;
                $this->stock->adjust(
                    (int) $purchase['branch_id'],
                    (int) $item['product_id'],
                    $variantId,
                    $qty,
                    'PO ' . ($purchase['invoice_number'] ?? $purchaseId)
                );

                $items[$index]['received_qty'] = (int) $item['received_qty'] + $qty;
                $this->db->update('purchase_items', [
                    'received_qty' => $items[$index]['received_qty'],
                ], ['id' => (int) $item['id']]);
            }

            $fresh    = $this->get($purchaseId);
            $complete = true;
            foreach ($fresh['items'] as $item) {
                if ((int) $item['received_qty'] < (int) $item['quantity']) {
                    $complete = false;
                    break;
                }
            }

            if ($complete) {
                $this->finalizePurchase($purchase, $fresh, $purchaseId);
            } elseif ($purchase['status'] === 'ordered') {
                $this->db->update('purchases', [
                    'status'     => 'inspecting',
                    'updated_at' => $this->db->now(),
                ], ['id' => $purchaseId]);
            } else {
                $this->db->update('purchases', [
                    'updated_at' => $this->db->now(),
                ], ['id' => $purchaseId]);
            }

            $this->audit->log('purchase.quantity_received', 'purchase', $purchaseId, null, ['lines' => count($lines)], (int) $purchase['branch_id']);

            return $this->get($purchaseId);
        });
    }

    /**
     * @param list<array<string, mixed>> $items
     */
    private function itemIndexById(array $items, int $itemId): int
    {
        foreach ($items as $index => $item) {
            if ((int) ($item['id'] ?? 0) === $itemId) {
                return $index;
            }
        }

        throw new DomainException('Purchase line not found.');
    }

    public function get(int $id): array
    {
        $row = $this->db->find('purchases', $id);
        if (!$row) {
            throw new DomainException('Purchase not found.');
        }
        global $wpdb;
        $row['items'] = $wpdb->get_results(
            $wpdb->prepare(
                'SELECT pi.*, p.name AS product_name, p.track_mode, v.color, v.storage, v.variant_name
                 FROM ' . $this->db->table('purchase_items') . ' pi
                 INNER JOIN ' . $this->db->table('products') . ' p ON p.id = pi.product_id
                 LEFT JOIN ' . $this->db->table('product_variants') . ' v ON v.id = pi.variant_id
                 WHERE pi.purchase_id = %d',
                $id
            ),
            ARRAY_A
        ) ?: [];
        $labels = new VariantLabel();
        foreach ($row['items'] as &$item) {
            $item['variant_label'] = $labels->format($item);
        }
        unset($item);

        $row['inbound_reserved'] = (int) $wpdb->get_var(
            $wpdb->prepare(
                'SELECT COUNT(*) FROM ' . $this->db->table('imeis') . ' WHERE source_type = %s AND source_id = %d AND status = %s',
                'purchase',
                $id,
                'reserved'
            )
        );

        return $row;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function list(?int $branchId = null): array
    {
        global $wpdb;
        $purchases = $this->db->table('purchases');
        $suppliers = $this->db->table('suppliers');
        $items     = $this->db->table('purchase_items');
        $where     = '1=1';
        $params    = [];
        if ($branchId) {
            $where    .= ' AND p.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT p.*, s.name AS supplier_name,
                       (SELECT COALESCE(SUM(quantity), 0) FROM {$items} WHERE purchase_id = p.id) AS units,
                       (SELECT COALESCE(SUM(received_qty), 0) FROM {$items} WHERE purchase_id = p.id) AS received
                FROM {$purchases} p
                INNER JOIN {$suppliers} s ON s.id = p.supplier_id
                WHERE {$where}
                ORDER BY p.id DESC
                LIMIT 100";

        return $params
            ? ($wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [])
            : ($wpdb->get_results($sql, ARRAY_A) ?: []);
    }

    /**
     * Recently completed purchases for dashboard and analytics.
     *
     * @return list<array<string, mixed>>
     */
    public function recentLines(?int $branchId = null, int $days = 14): array
    {
        global $wpdb;
        $purchases = $this->db->table('purchases');
        $suppliers = $this->db->table('suppliers');
        $items     = $this->db->table('purchase_items');
        $products  = $this->db->table('products');
        $variants  = $this->db->table('product_variants');
        $where     = "p.status = 'completed' AND p.posted_at >= DATE_SUB(NOW(), INTERVAL %d DAY)";
        $params    = [max(1, $days)];
        if ($branchId) {
            $where   .= ' AND p.branch_id = %d';
            $params[] = $branchId;
        }
        $sql = "SELECT p.id, p.invoice_number, p.branch_id, p.supplier_id, p.status, p.posted_at,
                       s.name AS supplier_name,
                       pi.quantity, pi.received_qty,
                       pr.name AS product_name, v.color, v.storage, v.variant_name,
                       (SELECT COALESCE(SUM(cost_price * quantity), 0) FROM {$items} WHERE purchase_id = p.id) AS total,
                       (SELECT COALESCE(SUM(quantity), 0) FROM {$items} WHERE purchase_id = p.id) AS units,
                       DATEDIFF(NOW(), p.posted_at) AS days
                FROM {$purchases} p
                INNER JOIN {$suppliers} s ON s.id = p.supplier_id
                INNER JOIN (
                    SELECT purchase_id, MIN(id) AS first_item_id
                    FROM {$items}
                    GROUP BY purchase_id
                ) fx ON fx.purchase_id = p.id
                INNER JOIN {$items} pi ON pi.id = fx.first_item_id
                INNER JOIN {$products} pr ON pr.id = pi.product_id
                LEFT JOIN {$variants} v ON v.id = pi.variant_id
                WHERE {$where}
                ORDER BY p.posted_at DESC
                LIMIT 30";
        $rows   = $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [];
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $label = $labels->format($row);
            $name  = (string) ($row['product_name'] ?? '');
            $units = (int) ($row['units'] ?? 0);
            $row['variant_label'] = $label;
            $row['item_summary']  = trim(
                $name . ($label !== '' ? ' · ' . $label : '') . ($units > 1 ? ' · ' . $units . ' units' : '')
            );
        }
        unset($row);

        return $rows;
    }

    /**
     * Purchases awaiting IMEI registration or completion.
     *
     * @return list<array<string, mixed>>
     */
    public function openLines(?int $branchId = null): array
    {
        global $wpdb;
        $purchases = $this->db->table('purchases');
        $suppliers = $this->db->table('suppliers');
        $items     = $this->db->table('purchase_items');
        $products  = $this->db->table('products');
        $variants  = $this->db->table('product_variants');
        $where     = "p.status IN ('ordered', 'inspecting')";
        if ($branchId) {
            $where   .= ' AND p.branch_id = %d';
            $params   = [$branchId];
        } else {
            $params = [];
        }
        $sql = "SELECT p.id, p.invoice_number, p.branch_id, p.supplier_id, p.status, p.created_at,
                       s.name AS supplier_name,
                       pi.quantity, pi.received_qty,
                       pr.name AS product_name, v.color, v.storage, v.variant_name,
                       (SELECT COALESCE(SUM(cost_price * quantity), 0) FROM {$items} WHERE purchase_id = p.id) AS total,
                       (SELECT COALESCE(SUM(quantity), 0) FROM {$items} WHERE purchase_id = p.id) AS units,
                       (SELECT COALESCE(SUM(received_qty), 0) FROM {$items} WHERE purchase_id = p.id) AS received,
                       DATEDIFF(NOW(), p.created_at) AS days
                FROM {$purchases} p
                INNER JOIN {$suppliers} s ON s.id = p.supplier_id
                INNER JOIN (
                    SELECT purchase_id, MIN(id) AS first_item_id
                    FROM {$items}
                    GROUP BY purchase_id
                ) fx ON fx.purchase_id = p.id
                INNER JOIN {$items} pi ON pi.id = fx.first_item_id
                INNER JOIN {$products} pr ON pr.id = pi.product_id
                LEFT JOIN {$variants} v ON v.id = pi.variant_id
                WHERE {$where}
                ORDER BY p.created_at ASC
                LIMIT 30";
        $rows = $params !== []
            ? ($wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A) ?: [])
            : ($wpdb->get_results($sql, ARRAY_A) ?: []);
        $labels = new VariantLabel();
        foreach ($rows as &$row) {
            $label    = $labels->format($row);
            $name     = (string) ($row['product_name'] ?? '');
            $received = (int) ($row['received'] ?? 0);
            $units    = (int) ($row['units'] ?? 0);
            $row['variant_label'] = $label;
            $row['item_summary']  = trim(
                $name . ($label !== '' ? ' · ' . $label : '') . ' · ' . $received . '/' . $units
            );
        }
        unset($row);

        return $rows;
    }

    /**
     * @param list<array<string, mixed>> $items
     */
    private function matchItemIndex(array $items, int $productId, ?int $variantId): int
    {
        $fallback = null;
        $full     = false;
        foreach ($items as $index => $item) {
            if ((int) $item['product_id'] !== $productId) {
                continue;
            }
            if ((int) $item['received_qty'] >= (int) $item['quantity']) {
                $full = true;
                continue;
            }
            if ($variantId) {
                if ((int) ($item['variant_id'] ?? 0) === $variantId) {
                    return (int) $index;
                }
                continue;
            }
            if (empty($item['variant_id'])) {
                return (int) $index;
            }
            if ($fallback === null) {
                $fallback = (int) $index;
            }
        }
        if ($variantId === null && $fallback !== null) {
            return $fallback;
        }
        if ($full) {
            throw new DomainException('Received quantity already matches the purchase line.');
        }

        throw new DomainException('IMEI product does not match this purchase.');
    }

    private function confirmInboundReserved(int $purchaseId, int $branchId): void
    {
        global $wpdb;
        $table = $this->db->table('imeis');
        $rows  = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT id FROM {$table} WHERE source_type = 'purchase' AND source_id = %d AND status = 'reserved'",
                $purchaseId
            ),
            ARRAY_A
        ) ?: [];
        foreach ($rows as $row) {
            $imei = $this->imeis->getById((int) $row['id']);
            $this->imeis->applyEvent(
                (int) $row['id'],
                'confirm_inbound',
                'purchase',
                $purchaseId,
                $branchId,
                'Physical receipt confirmed'
            );
            $this->incrementReceivedQty(
                $purchaseId,
                (int) $imei['product_id'],
                !empty($imei['variant_id']) ? (int) $imei['variant_id'] : null
            );
        }

        if ($rows !== []) {
            $fresh  = $this->get($purchaseId);
            $before = $this->db->find('purchases', $purchaseId) ?: $fresh;
            $this->maybeCompletePurchase($before, $fresh, $purchaseId);
        }
    }

    private function incrementReceivedQty(int $purchaseId, int $productId, ?int $variantId): void
    {
        $purchase = $this->get($purchaseId);
        $index    = $this->matchItemIndex($purchase['items'], $productId, $variantId);
        $item     = $purchase['items'][$index];
        if ((int) $item['received_qty'] >= (int) $item['quantity']) {
            return;
        }
        $this->db->update('purchase_items', [
            'received_qty' => (int) $item['received_qty'] + 1,
        ], ['id' => (int) $item['id']]);
    }

    /**
     * @param array<string, mixed> $before
     * @param array<string, mixed> $fresh
     */
    private function maybeCompletePurchase(array $before, array $fresh, int $purchaseId): void
    {
        foreach ($fresh['items'] as $item) {
            if ((int) $item['received_qty'] < (int) $item['quantity']) {
                return;
            }
        }
        if (($before['status'] ?? '') !== 'completed') {
            $this->finalizePurchase($before, $fresh, $purchaseId);
        }
    }

    /**
     * @param array<string, mixed> $before
     * @param array<string, mixed> $fresh
     */
    private function finalizePurchase(array $before, array $fresh, int $purchaseId): void
    {
        $this->db->update('purchases', [
            'status'     => 'completed',
            'posted_at'  => $this->db->now(),
            'updated_at' => $this->db->now(),
        ], ['id' => $purchaseId]);

        if (($before['status'] ?? '') !== 'completed') {
            $this->postPurchaseLedger($fresh, $purchaseId, (int) $before['supplier_id'], (int) $before['branch_id']);
            (new NotifyService())->scanLowStock();
        }
    }

    /**
     * @param list<array<string, mixed>> $items
     */
    private function registerOrConfirmImei(array $purchase, int $purchaseId, array $row, array &$items, int $index): void
    {
        $item    = $items[$index];
        $product = $this->products->get((int) $item['product_id']);
        if ($this->products->trackMode($product) === 'quantity') {
            throw new DomainException('Use receive-quantity for accessory lines.');
        }

        $imeiDigits = trim((string) ($row['imei'] ?? ''));
        $confirmed  = false;
        try {
            $existing = $this->imeis->getByImei($imeiDigits);
            if ((string) ($existing['source_type'] ?? '') === 'purchase'
                && (int) ($existing['source_id'] ?? 0) === $purchaseId) {
                if ((string) ($existing['status'] ?? '') === 'reserved') {
                    $this->imeis->applyEvent(
                        (int) $existing['id'],
                        'confirm_inbound',
                        'purchase',
                        $purchaseId,
                        (int) $purchase['branch_id'],
                        'Received on PO'
                    );
                    $this->incrementReceivedQty(
                        $purchaseId,
                        (int) $existing['product_id'],
                        !empty($existing['variant_id']) ? (int) $existing['variant_id'] : null
                    );
                }
                $confirmed = true;
            } else {
                throw new DomainException('IMEI ' . $imeiDigits . ' is already registered.');
            }
        } catch (DomainException $e) {
            if (!str_contains($e->getMessage(), 'not found')) {
                throw $e;
            }
            $this->imeis->register([
                'imei'           => $row['imei'],
                'serial_number'  => $row['serial_number'] ?? '',
                'product_id'     => (int) $row['product_id'],
                'variant_id'     => !empty($row['variant_id']) ? (int) $row['variant_id'] : ($item['variant_id'] ?? null),
                'branch_id'      => (int) $purchase['branch_id'],
                'source_type'    => 'purchase',
                'source_id'      => $purchaseId,
                'cost_price'     => $item['cost_price'],
                'condition_grade'=> sanitize_text_field((string) ($row['condition_grade'] ?? 'new')) ?: 'new',
            ]);
        }

        if (!$confirmed) {
            $items[$index]['received_qty'] = (int) $item['received_qty'] + 1;
            $this->db->update('purchase_items', [
                'received_qty' => $items[$index]['received_qty'],
            ], ['id' => (int) $item['id']]);
        }
    }

    /**
     * @param array<string, mixed> $purchase
     */
    private function postPurchaseLedger(array $purchase, int $purchaseId, int $supplierId, int $branchId): void
    {
        $total = 0;
        foreach ($purchase['items'] as $line) {
            $total += (int) $line['cost_price'] * (int) $line['quantity'];
        }
        if ($total <= 0) {
            return;
        }
        $this->ledger->post(
            'supplier',
            $supplierId,
            'debit',
            new Money($total),
            'purchase',
            $purchaseId,
            'Purchase ' . ($purchase['invoice_number'] ?? $purchaseId),
            $branchId
        );
    }
}
