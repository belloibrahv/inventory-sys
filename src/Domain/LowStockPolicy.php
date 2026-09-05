<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * Alert when available IMEIs at a branch hit the product threshold.
 */
final class LowStockPolicy
{
    public function isLow(int $qty, int $threshold): bool
    {
        return $threshold > 0 && $qty <= $threshold;
    }
}
