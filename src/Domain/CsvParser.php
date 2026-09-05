<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class CsvParser
{
    /**
     * @var array<string, string>
     */
    private const ALIASES = [
        'min_price'      => 'min_selling_price',
        'cost'           => 'cost_price',
        'default_cost'   => 'default_cost_price',
        'branch'         => 'branch_code',
        'phone_number'   => 'phone',
        'invoice'        => 'invoice_number',
        'date'           => 'sale_date',
        'price'          => 'selling_price',
        'paid'           => 'paid_amount',
        'opening'        => 'opening_balance',
        'sku_code'       => 'sku',
        'product'        => 'sku',
        'status_code'    => 'status',
        'warranty'       => 'warranty_days',
    ];

    /**
     * @return list<array<string, string>>
     */
    public function parse(string $csv): array
    {
        $csv = preg_replace('/^\xEF\xBB\xBF/', '', $csv) ?? $csv;
        $csv = str_replace(["\r\n", "\r"], "\n", $csv);
        if (trim($csv) === '') {
            throw new DomainException('The file is empty.');
        }

        $fh = fopen('php://temp', 'r+');
        if ($fh === false) {
            throw new DomainException('Could not read the CSV file.');
        }
        fwrite($fh, $csv);
        rewind($fh);

        $header = fgetcsv($fh);
        if ($header === false || $header === [null] || $header === []) {
            fclose($fh);
            throw new DomainException('The CSV has no header row.');
        }
        $keys = array_map(fn($h) => $this->header((string) $h), $header);
        if (in_array('', $keys, true) && count(array_filter($keys)) === 0) {
            fclose($fh);
            throw new DomainException('The CSV has no header row.');
        }

        $rows = [];
        while (($cols = fgetcsv($fh)) !== false) {
            if ($cols === [null] || $this->isBlank($cols)) {
                continue;
            }
            $row = [];
            foreach ($keys as $i => $key) {
                if ($key === '') {
                    continue;
                }
                $row[$key] = trim((string) ($cols[$i] ?? ''));
            }
            if ($this->isBlank(array_values($row))) {
                continue;
            }
            $rows[] = $row;
        }
        fclose($fh);

        return $rows;
    }

    /**
     * @param list<string> $required
     * @param array<string, string> $first
     */
    public function assertHeaders(array $first, array $required): void
    {
        $missing = [];
        foreach ($required as $key) {
            if (!array_key_exists($key, $first)) {
                $missing[] = $key;
            }
        }
        if ($missing !== []) {
            throw new DomainException('CSV is missing columns: ' . implode(', ', $missing) . '.');
        }
    }

    public function header(string $raw): string
    {
        $key = strtolower(trim($raw));
        $key = str_replace([' ', '-'], '_', $key);
        $key = preg_replace('/[^a-z0-9_]/', '', $key) ?? $key;

        return self::ALIASES[$key] ?? $key;
    }

    /**
     * @param list<string|null> $cols
     */
    private function isBlank(array $cols): bool
    {
        foreach ($cols as $col) {
            if (trim((string) $col) !== '') {
                return false;
            }
        }

        return true;
    }
}
