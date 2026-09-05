<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * Catalog price changes applied to many products at once.
 * "Bulk" means a batch of catalog rows — not a pack size (10 phones, 20 phones).
 */
final class PriceBulkUpdate
{
    public const MODES = ['set', 'percent', 'amount'];

    public const SCOPES = [
        'selected',
        'brand',
        'category',
        'track',
        'recent_inbound',
        'all',
    ];

    public const APPLY_TO = ['products', 'variants', 'both'];

    /** Which money column to change on the catalog row. */
    public const FIELDS = [
        'current', // current_selling_price — default POS sell price
        'min',     // min_selling_price — floor
        'market',  // market_price — management recommendation
        'cost',    // default_cost_price
    ];

    public function normalizeMode(string $mode): string
    {
        $mode = strtolower(trim($mode));
        if (!in_array($mode, self::MODES, true)) {
            throw new DomainException('Choose set, percent, or amount for a price update.');
        }

        return $mode;
    }

    public function normalizeScope(string $scope): string
    {
        $scope = strtolower(trim($scope));
        if (!in_array($scope, self::SCOPES, true)) {
            throw new DomainException('Choose which products this price update covers.');
        }

        return $scope;
    }

    public function normalizeApplyTo(string $applyTo): string
    {
        $applyTo = strtolower(trim($applyTo));
        if (!in_array($applyTo, self::APPLY_TO, true)) {
            throw new DomainException('Choose product prices, variant prices, or both.');
        }

        return $applyTo;
    }

    public function normalizeField(string $field): string
    {
        $field = strtolower(trim($field));
        if ($field === '' || $field === 'floor' || $field === 'min_selling_price') {
            return 'min';
        }
        if ($field === 'current_selling_price' || $field === 'selling') {
            return 'current';
        }
        if ($field === 'market_price') {
            return 'market';
        }
        if ($field === 'default_cost_price' || $field === 'cost_price') {
            return 'cost';
        }
        if (!in_array($field, self::FIELDS, true)) {
            throw new DomainException('Choose current, minimum, market, or cost price.');
        }

        return $field;
    }

    public function columnForField(string $field): string
    {
        return match ($this->normalizeField($field)) {
            'current' => 'current_selling_price',
            'market'  => 'market_price',
            'cost'    => 'default_cost_price',
            default   => 'min_selling_price',
        };
    }

    public function variantColumnForField(string $field): ?string
    {
        return match ($this->normalizeField($field)) {
            'current' => 'current_selling_price',
            'market'  => 'market_price',
            'cost'    => 'cost_price',
            'min'     => 'min_selling_price',
            default   => null,
        };
    }

    /**
     * @param int $currentMinor Current amount in kobo
     * @param float $value Naira for set/amount, percent points for percent (e.g. 10 = +10%)
     */
    public function nextMinor(int $currentMinor, string $mode, float $value): int
    {
        $mode = $this->normalizeMode($mode);
        if ($mode === 'set') {
            $next = Money::fromMajor($value)->minor();
        } elseif ($mode === 'percent') {
            $next = (int) round($currentMinor * (100 + $value) / 100);
        } else {
            $next = $currentMinor + Money::fromMajor($value)->minor();
        }

        return max(0, $next);
    }

    public function direction(int $fromMinor, int $toMinor): string
    {
        if ($toMinor > $fromMinor) {
            return 'up';
        }
        if ($toMinor < $fromMinor) {
            return 'down';
        }

        return 'none';
    }
}
