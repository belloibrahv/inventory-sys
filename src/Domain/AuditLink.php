<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * Deep links from audit rows into the SPA — read-only navigation hints, not URLs.
 */
final class AuditLink
{
    /**
     * @param array<string, mixed> $row Hydrated audit row with entity_type, entity_id, old, new.
     * @return array<string, mixed>|null
     */
    public function for(array $row): ?array
    {
        $type = (string) ($row['entity_type'] ?? '');
        $id   = (int) ($row['entity_id'] ?? 0);
        $new  = is_array($row['new'] ?? null) ? $row['new'] : [];

        return match ($type) {
            'sale'        => $this->saleLink($new, $id),
            'repair'      => $id ? ['screen' => 'repairs', 'id' => $id] : null,
            'return'      => $id ? ['screen' => 'returns', 'id' => $id] : null,
            'transfer'    => $id ? ['screen' => 'transfers', 'id' => $id] : null,
            'stock_count' => $id ? ['screen' => 'stocktake', 'id' => $id] : null,
            'purchase'    => $id ? ['screen' => 'purchases', 'id' => $id] : null,
            'approval'    => $id ? ['screen' => 'approvals', 'id' => $id] : ['screen' => 'approvals'],
            'expense'     => $id ? ['screen' => 'expenses', 'id' => $id] : null,
            'imei'        => $this->imeiLink($new),
            default       => null,
        };
    }

    /**
     * @param array<string, mixed> $new
     * @return array<string, mixed>|null
     */
    private function saleLink(array $new, int $id): ?array
    {
        $invoice = (string) ($new['invoice'] ?? $new['invoice_number'] ?? '');
        if ($invoice !== '') {
            return ['screen' => 'invoice', 'invoice' => $invoice];
        }

        return $id ? ['screen' => 'invoice', 'sale_id' => $id] : null;
    }

    /**
     * @param array<string, mixed> $new
     * @return array<string, mixed>|null
     */
    private function imeiLink(array $new): ?array
    {
        if (!empty($new['imei']) && !is_array($new['imei'])) {
            return ['screen' => 'imei', 'imei' => (string) $new['imei']];
        }

        return null;
    }
}
