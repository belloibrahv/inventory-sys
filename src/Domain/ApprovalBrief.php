<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class ApprovalBrief
{
    public function label(string $type): string
    {
        return match ($type) {
            'price_override'   => 'Sell below minimum',
            'expense'          => 'Expense over threshold',
            'stock_adjustment' => 'Stock count variance',
            'price_bulk'       => 'Catalog price reduction',
            default            => ucfirst(str_replace('_', ' ', $type)),
        };
    }

    /**
     * @param array<string, mixed> $payload
     */
    public function summary(string $type, array $payload): string
    {
        return match ($type) {
            'price_override'   => $this->price($payload),
            'expense'          => $this->expense($payload),
            'stock_adjustment' => $this->stock($payload),
            'price_bulk'       => $this->priceBulk($payload),
            default            => '',
        };
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function price(array $payload): string
    {
        $parts = [];
        foreach ($payload['items'] ?? [] as $item) {
            if (!is_array($item)) {
                continue;
            }
            $imei  = (string) ($item['imei'] ?? '');
            $price = $this->naira($item['selling_price'] ?? 0);
            $label = trim((string) ($item['variant_label'] ?? ''));
            $name  = trim((string) ($item['product_name'] ?? ''));
            $bit   = $imei;
            if ($name !== '') {
                $bit .= ' · ' . $name;
            }
            if ($label !== '') {
                $bit .= ' · ' . $label;
            }
            $parts[] = trim($bit . ' at ' . $price);
        }

        return $parts !== [] ? implode('; ', $parts) : 'Below-minimum sale';
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function expense(array $payload): string
    {
        $cat = (string) ($payload['category'] ?? 'expense');
        $amt = $this->naira($payload['amount'] ?? 0);
        $vendor = trim((string) ($payload['vendor'] ?? ''));

        return trim($cat . ' · ' . $amt . ($vendor !== '' ? ' · ' . $vendor : ''));
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function stock(array $payload): string
    {
        $sum = $payload['summary'] ?? [];
        if (!is_array($sum)) {
            $sum = [];
        }
        $missing = (int) ($sum['missing'] ?? 0);
        $extra   = (int) ($sum['unknown'] ?? 0) + (int) ($sum['wrong_branch'] ?? 0) + (int) ($sum['unexpected_status'] ?? 0);
        $reason  = trim((string) ($payload['reason'] ?? ''));
        $line    = $missing . ' missing · ' . $extra . ' extra';
        $missingLines = $payload['missing_lines'] ?? [];
        if (is_array($missingLines) && $missingLines !== []) {
            $bits = [];
            foreach (array_slice($missingLines, 0, 3) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $name = trim((string) ($row['product_name'] ?? ''));
                $variant = trim((string) ($row['variant_label'] ?? ''));
                $imei = trim((string) ($row['imei'] ?? ''));
                $bit = $name !== '' ? $name : $imei;
                if ($variant !== '') {
                    $bit .= ' · ' . $variant;
                } elseif ($imei !== '' && $name === '') {
                    $bit = $imei;
                }
                if ($bit !== '') {
                    $bits[] = $bit;
                }
            }
            if ($bits !== []) {
                $line .= ' · ' . implode('; ', $bits);
            }
        }

        return $reason !== '' ? $line . '. ' . $reason : $line;
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function priceBulk(array $payload): string
    {
        $preview = is_array($payload['preview'] ?? null) ? $payload['preview'] : [];
        $updated = (int) ($preview['updated'] ?? 0);
        $variants = (int) ($preview['variants_updated'] ?? 0);
        $field = (string) ($preview['field'] ?? 'current');
        $reason = trim((string) ($preview['reason'] ?? ''));
        $line = $updated . ' product(s)';
        if ($variants > 0) {
            $line .= ' · ' . $variants . ' variant(s)';
        }
        $line .= ' · ' . $field . ' price';
        $changes = $preview['changes'] ?? [];
        if (is_array($changes) && $changes !== []) {
            $bits = [];
            foreach (array_slice($changes, 0, 3) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $name = trim((string) ($row['name'] ?? ''));
                if ($name === '') {
                    continue;
                }
                $bits[] = $name . ' ' . $this->naira(((int) ($row['from'] ?? 0)) / 100) . '→' . $this->naira(((int) ($row['to'] ?? 0)) / 100);
            }
            if ($bits !== []) {
                $line .= ' · ' . implode('; ', $bits);
            }
        }

        return $reason !== '' ? $line . '. ' . $reason : $line;
    }

    private function naira(mixed $major): string
    {
        return '₦' . number_format((float) $major, 2);
    }
}
