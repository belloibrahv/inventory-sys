<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class AuditDiff
{
    /**
     * @return array<string, mixed>|string|null
     */
    public function decode(mixed $value): mixed
    {
        if (!is_string($value) || $value === '') {
            return $value;
        }
        $json = json_decode($value, true);

        return json_last_error() === JSON_ERROR_NONE ? $json : $value;
    }

    public function summarize(mixed $old, mixed $new): string
    {
        $old = $this->decode($old);
        $new = $this->decode($new);

        if (!is_array($old) && is_array($new)) {
            $created = $this->createdLabel($new);
            if ($created !== '') {
                return $created;
            }

            return 'Created';
        }

        if (is_array($old) && is_array($new)) {
            $parts = [];
            foreach ($this->changed($old, $new) as $line) {
                $parts[] = $line;
                if (count($parts) >= 4) {
                    break;
                }
            }

            return $parts !== [] ? implode('; ', $parts) : 'Updated';
        }

        return '';
    }

    /**
     * @param array<string, mixed> $old
     * @param array<string, mixed> $new
     * @return list<string>
     */
    public function changed(array $old, array $new): array
    {
        $skip = [
            'created_at', 'updated_at', 'posted_at', 'received_at', 'completed_at',
            'items', 'ledger', 'balance', 'balance_formatted', 'notes',
        ];
        $out = [];
        foreach ($new as $key => $value) {
            if (in_array((string) $key, $skip, true) || is_array($value)) {
                continue;
            }
            $before = $old[$key] ?? null;
            if (is_array($before) || (string) $before === (string) $value) {
                continue;
            }
            $out[] = $key . ': ' . $this->short($before) . ' → ' . $this->short($value);
        }

        return $out;
    }

    private function short(mixed $value): string
    {
        if ($value === null || $value === '') {
            return '—';
        }
        $text = is_scalar($value) ? (string) $value : '';
        if (strlen($text) > 40) {
            return substr($text, 0, 37) . '…';
        }

        return $text;
    }

    /**
     * @param array<string, mixed> $new
     */
    private function createdLabel(array $new): string
    {
        if (!empty($new['devices']) && is_string($new['devices'])) {
            $ref = (string) ($new['invoice'] ?? $new['invoice_number'] ?? $new['ticket'] ?? $new['ticket_number'] ?? '');

            return $ref !== '' ? 'Created ' . $ref . ' · ' . $new['devices'] : 'Created · ' . $new['devices'];
        }

        if (!empty($new['incoming']) && !empty($new['outgoing']) && !is_array($new['incoming']) && !is_array($new['outgoing'])) {
            $ref   = (string) ($new['invoice'] ?? $new['invoice_number'] ?? '');
            $trade = $this->swapBrief($new);

            return $ref !== '' ? 'Created ' . $ref . ' · ' . $trade : 'Created · ' . $trade;
        }

        $device = $this->deviceBrief($new);
        if ($device !== '') {
            foreach (['invoice', 'invoice_number', 'ticket', 'ticket_number'] as $key) {
                if (!empty($new[$key]) && !is_array($new[$key])) {
                    return 'Created ' . (string) $new[$key] . ' · ' . $device;
                }
            }
            if ($device === (string) ($new['imei'] ?? '')) {
                return 'Created ' . $device;
            }

            return 'Created · ' . $device;
        }

        foreach (['invoice', 'invoice_number', 'ticket', 'ticket_number', 'imei'] as $key) {
            if (!empty($new[$key]) && !is_array($new[$key])) {
                return 'Created ' . (string) $new[$key];
            }
        }

        return '';
    }

    /**
     * @param array<string, mixed> $data
     */
    private function deviceBrief(array $data): string
    {
        if (empty($data['imei']) || is_array($data['imei'])) {
            return '';
        }
        $parts = array_filter([
            (string) $data['imei'],
            (string) ($data['product_name'] ?? ''),
            (string) ($data['variant_label'] ?? ''),
        ], static fn(string $part): bool => $part !== '');

        return implode(' · ', $parts);
    }

    /**
     * @param array<string, mixed> $data
     */
    private function swapBrief(array $data): string
    {
        $in = trim(((string) ($data['incoming_product'] ?? '')) . (!empty($data['incoming_variant']) ? ' · ' . $data['incoming_variant'] : ''));
        $out = trim(((string) ($data['outgoing_product'] ?? '')) . (!empty($data['outgoing_variant']) ? ' · ' . $data['outgoing_variant'] : ''));

        return sprintf(
            'In %s%s · Out %s%s',
            (string) $data['incoming'],
            $in !== '' ? ' (' . $in . ')' : '',
            (string) $data['outgoing'],
            $out !== '' ? ' (' . $out . ')' : ''
        );
    }
}
