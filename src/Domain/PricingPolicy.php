<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * Rules for when catalog price changes need CEO/Director approval.
 */
final class PricingPolicy
{
    /** Default: reductions of 10% or more of the current field require approval. */
    public const DEFAULT_REDUCTION_APPROVAL_PCT = 10.0;

    public function clampReductionPct(float $pct): float
    {
        if ($pct < 0) {
            return 0.0;
        }
        if ($pct > 100) {
            return 100.0;
        }

        return round($pct, 2);
    }

    /**
     * True when the drop from $fromMinor to $toMinor is at/above the threshold.
     */
    public function requiresApproval(int $fromMinor, int $toMinor, float $thresholdPct): bool
    {
        if ($toMinor >= $fromMinor || $fromMinor <= 0) {
            return false;
        }
        $thresholdPct = $this->clampReductionPct($thresholdPct);
        if ($thresholdPct <= 0) {
            return false;
        }
        $dropPct = (($fromMinor - $toMinor) / $fromMinor) * 100;

        return $dropPct + 0.00001 >= $thresholdPct;
    }

    /**
     * Selling below the product minimum always needs a sale-time override;
     * for catalog governance, flag when current/market is set below min.
     */
    public function belowMinimum(int $proposedMinor, int $minMinor): bool
    {
        return $minMinor > 0 && $proposedMinor > 0 && $proposedMinor < $minMinor;
    }
}
