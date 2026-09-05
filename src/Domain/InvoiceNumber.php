<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class InvoiceNumber
{
    public static function next(string $prefix, string $branchCode, int $year, int $sequence): string
    {
        $branch = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $branchCode) ?: 'GEN');

        return sprintf('%s-%s-%d-%05d', strtoupper($prefix), $branch, $year, $sequence);
    }
}
