<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\VariantLabel;
use Atoms\Support\Db;

/**
 * Adds read-only context to ledger rows (invoice numbers, device/variant summaries).
 */
final class LedgerEnricher
{
    public function __construct(private readonly Db $db = new Db())
    {
    }

    /**
     * @param list<array<string, mixed>> $entries
     * @return list<array<string, mixed>>
     */
    public function customerEntries(array $entries): array
    {
        if ($entries === []) {
            return [];
        }

        global $wpdb;
        $saleIds     = [];
        $paymentIds  = [];
        foreach ($entries as $entry) {
            $ref = (string) ($entry['reference_type'] ?? '');
            $id  = (int) ($entry['reference_id'] ?? 0);
            if ($id <= 0) {
                continue;
            }
            if (in_array($ref, ['sale', 'sale_void', 'payment'], true)) {
                $saleIds[$id] = $id;
            }
            if ($ref === 'payment') {
                $paymentIds[$id] = $id;
            }
        }

        $payments = [];
        if ($paymentIds !== []) {
            $table = $this->db->table('payments');
            $in    = implode(',', array_map('intval', array_values($paymentIds)));
            foreach ($wpdb->get_results("SELECT id, sale_id FROM {$table} WHERE id IN ({$in})", ARRAY_A) ?: [] as $row) {
                $payments[(int) $row['id']] = $row;
                if (!empty($row['sale_id'])) {
                    $saleIds[(int) $row['sale_id']] = (int) $row['sale_id'];
                }
            }
        }

        $sales = $this->saleSummaries(array_values($saleIds));

        foreach ($entries as &$entry) {
            $entry['context'] = $this->customerContext($entry, $sales, $payments);
        }
        unset($entry);

        return $entries;
    }

    /**
     * @param list<array<string, mixed>> $entries
     * @return list<array<string, mixed>>
     */
    public function supplierEntries(array $entries): array
    {
        if ($entries === []) {
            return [];
        }

        global $wpdb;
        $purchaseIds = [];
        $imeiIds     = [];
        foreach ($entries as $entry) {
            $ref = (string) ($entry['reference_type'] ?? '');
            $id  = (int) ($entry['reference_id'] ?? 0);
            if ($id <= 0) {
                continue;
            }
            if ($ref === 'purchase') {
                $purchaseIds[$id] = $id;
            }
            if ($ref === 'supplier_return') {
                $imeiIds[$id] = $id;
            }
        }

        $purchases = $this->purchaseSummaries(array_values($purchaseIds));
        $returns   = $this->returnSummaries(array_values($imeiIds));

        foreach ($entries as &$entry) {
            $entry['context'] = $this->supplierContext($entry, $purchases, $returns);
        }
        unset($entry);

        return $entries;
    }

    /**
     * @param list<int> $saleIds
     * @return array<int, array{invoice_number: string, device_summary: string}>
     */
    private function saleSummaries(array $saleIds): array
    {
        if ($saleIds === []) {
            return [];
        }

        global $wpdb;
        $sales    = $this->db->table('sales');
        $items    = $this->db->table('sale_items');
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $in       = implode(',', array_map('intval', $saleIds));
        $rows     = $wpdb->get_results("SELECT id, invoice_number FROM {$sales} WHERE id IN ({$in})", ARRAY_A) ?: [];
        $labels   = new VariantLabel();
        $out      = [];
        foreach ($rows as $row) {
            $saleId = (int) $row['id'];
            $devices = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT i.imei, p.name AS product_name, v.color, v.storage, v.variant_name
                     FROM {$items} si
                     INNER JOIN {$imeis} i ON i.id = si.imei_id
                     INNER JOIN {$products} p ON p.id = si.product_id
                     LEFT JOIN {$variants} v ON v.id = si.variant_id
                     WHERE si.sale_id = %d
                     ORDER BY si.id ASC",
                    $saleId
                ),
                ARRAY_A
            ) ?: [];
            $bits = [];
            foreach ($devices as $device) {
                $label = $labels->format($device);
                $name  = (string) ($device['product_name'] ?? '');
                $bits[] = trim($device['imei'] . ($name !== '' ? ' · ' . $name : '') . ($label !== '' ? ' · ' . $label : ''));
            }
            $out[$saleId] = [
                'invoice_number' => (string) ($row['invoice_number'] ?? ''),
                'device_summary' => implode('; ', $bits),
            ];
        }

        return $out;
    }

    /**
     * @param list<int> $purchaseIds
     * @return array<int, array{invoice_number: string, variant_summary: string}>
     */
    private function purchaseSummaries(array $purchaseIds): array
    {
        if ($purchaseIds === []) {
            return [];
        }

        global $wpdb;
        $purchases = $this->db->table('purchases');
        $items     = $this->db->table('purchase_items');
        $products  = $this->db->table('products');
        $variants  = $this->db->table('product_variants');
        $in        = implode(',', array_map('intval', $purchaseIds));
        $rows      = $wpdb->get_results("SELECT id, invoice_number FROM {$purchases} WHERE id IN ({$in})", ARRAY_A) ?: [];
        $labels    = new VariantLabel();
        $out       = [];
        foreach ($rows as $row) {
            $purchaseId = (int) $row['id'];
            $lines      = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT pi.quantity, p.name AS product_name, v.color, v.storage, v.variant_name
                     FROM {$items} pi
                     INNER JOIN {$products} p ON p.id = pi.product_id
                     LEFT JOIN {$variants} v ON v.id = pi.variant_id
                     WHERE pi.purchase_id = %d
                     ORDER BY pi.id ASC",
                    $purchaseId
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
            $out[$purchaseId] = [
                'invoice_number'  => (string) ($row['invoice_number'] ?? ''),
                'variant_summary' => implode('; ', $bits),
            ];
        }

        return $out;
    }

    /**
     * @param list<int> $imeiIds
     * @return array<int, array{imei: string, variant_summary: string}>
     */
    private function returnSummaries(array $imeiIds): array
    {
        if ($imeiIds === []) {
            return [];
        }

        global $wpdb;
        $imeis    = $this->db->table('imeis');
        $products = $this->db->table('products');
        $variants = $this->db->table('product_variants');
        $in       = implode(',', array_map('intval', $imeiIds));
        $rows     = $wpdb->get_results(
            "SELECT i.id, i.imei, p.name AS product_name, v.color, v.storage, v.variant_name
             FROM {$imeis} i
             INNER JOIN {$products} p ON p.id = i.product_id
             LEFT JOIN {$variants} v ON v.id = i.variant_id
             WHERE i.id IN ({$in})",
            ARRAY_A
        ) ?: [];
        $labels = new VariantLabel();
        $out    = [];
        foreach ($rows as $row) {
            $id    = (int) $row['id'];
            $label = $labels->format($row);
            $name  = (string) ($row['product_name'] ?? '');
            $out[$id] = [
                'imei'             => (string) ($row['imei'] ?? ''),
                'variant_summary'  => trim($name . ($label !== '' ? ' · ' . $label : '')),
            ];
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $entry
     * @param array<int, array{invoice_number: string, device_summary: string}> $sales
     * @param array<int, array<string, mixed>> $payments
     * @return array<string, mixed>|null
     */
    private function customerContext(array $entry, array $sales, array $payments): ?array
    {
        $ref = (string) ($entry['reference_type'] ?? '');
        $id  = (int) ($entry['reference_id'] ?? 0);
        if ($id <= 0) {
            return null;
        }

        return match ($ref) {
            'sale', 'sale_void' => $sales[$id] ?? null,
            'payment'           => isset($payments[$id])
                ? ($sales[(int) ($payments[$id]['sale_id'] ?? 0)] ?? null)
                : ($sales[$id] ?? null),
            default             => null,
        };
    }

    /**
     * @param array<string, mixed> $entry
     * @param array<int, array{invoice_number: string, variant_summary: string}> $purchases
     * @param array<int, array{imei: string, variant_summary: string}> $returns
     * @return array<string, mixed>|null
     */
    private function supplierContext(array $entry, array $purchases, array $returns): ?array
    {
        $ref = (string) ($entry['reference_type'] ?? '');
        $id  = (int) ($entry['reference_id'] ?? 0);
        if ($id <= 0) {
            return null;
        }

        return match ($ref) {
            'purchase'        => $purchases[$id] ?? null,
            'supplier_return' => $returns[$id] ?? null,
            default           => null,
        };
    }
}
