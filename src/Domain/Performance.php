<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class Performance
{
    public function profit(int $revenue, int $cost): int
    {
        return $revenue - $cost;
    }

    /**
     * Share of invoice totals actually collected, 0–100.
     */
    public function collectionRate(int $collected, int $revenue): float
    {
        if ($revenue <= 0) {
            return 0.0;
        }

        return round(($collected / $revenue) * 100, 1);
    }
}
