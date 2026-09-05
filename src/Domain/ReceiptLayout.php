<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * Printable receipt fields. Colours live in the print template; this is the copy.
 */
final class ReceiptLayout
{
    /**
     * @param array<string, mixed> $sale
     * @param array{company: string, wordmark: string, accent: string, tagline: string} $identity
     * @param array<string, mixed> $branch
     * @return array<string, mixed>
     */
    public function document(array $sale, array $identity, array $branch = []): array
    {
        $lines = [];
        foreach ($sale['items'] ?? [] as $it) {
            $variant = trim((string) ($it['variant_label'] ?? ''));
            if ($variant === '' && !empty($it['color']) && !empty($it['storage'])) {
                $variant = trim((string) $it['color']) . ' / ' . trim((string) $it['storage']);
            }
            $lines[] = [
                'imei'     => (string) ($it['imei'] ?? ''),
                'serial'   => (string) ($it['serial_number'] ?? ''),
                'product'  => (string) ($it['product_name'] ?? ''),
                'variant'  => $variant,
                'price'    => (int) ($it['selling_price'] ?? 0),
                'warranty' => $this->warrantyLabel($it),
            ];
        }
        $phone = trim((string) ($branch['phone'] ?? ''));
        $addr  = trim((string) ($branch['address'] ?? ''));
        $line  = $addr;
        if ($phone !== '') {
            $line = $line === '' ? $phone : $line . ' · ' . $phone;
        }

        return [
            'company'         => (string) ($identity['company'] ?? 'Abu Twins Softskills Investment'),
            'wordmark'        => (string) ($identity['wordmark'] ?? 'Abu Twins Softskills Investment'),
            'accent'          => (string) ($identity['accent'] ?? ''),
            'tagline'         => (string) ($identity['tagline'] ?? ''),
            'branch_name'     => (string) ($branch['name'] ?? ($sale['branch']['name'] ?? '')),
            'branch_line'     => $line,
            'invoice'         => (string) ($sale['invoice_number'] ?? ''),
            'posted_at'       => (string) ($sale['posted_at'] ?? ''),
            'sale_type'       => (new WholesalePolicy())->label((string) ($sale['sale_type'] ?? 'retail')),
            'customer'        => (string) ($sale['customer']['name'] ?? 'Walk-in'),
            'customer_phone'  => (string) ($sale['customer']['phone'] ?? ''),
            'seller'          => (string) ($sale['salesperson']['name'] ?? ''),
            'lines'           => $lines,
            'subtotal'        => (int) ($sale['subtotal'] ?? 0),
            'discount'        => (int) ($sale['discount'] ?? 0),
            'total'           => (int) ($sale['total'] ?? 0),
            'paid'            => (int) ($sale['paid_amount'] ?? 0),
            'due'             => (int) ($sale['due_amount'] ?? 0),
            'footer'          => 'Posted records are never edited. Corrections are new events.',
        ];
    }

    /**
     * @param array<string, mixed> $item
     */
    public function warrantyLabel(array $item): string
    {
        if (!empty($item['in_warranty']) && !empty($item['warranty_expires'])) {
            return 'Until ' . (string) $item['warranty_expires'];
        }
        if (!empty($item['warranty_expires'])) {
            return 'Expired ' . (string) $item['warranty_expires'];
        }

        return 'None';
    }
}
