<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * Retail and wholesale share the same minimum-price rules. Wholesale must name the buyer.
 */
final class WholesalePolicy
{
    public const RETAIL = 'retail';
    public const WHOLESALE = 'wholesale';

    public function normalize(string $type): string
    {
        $key = strtolower(trim($type));

        return $key === self::WHOLESALE ? self::WHOLESALE : self::RETAIL;
    }

    public function requiresCustomer(string $type): bool
    {
        return $this->normalize($type) === self::WHOLESALE;
    }

    public function label(string $type): string
    {
        return $this->normalize($type) === self::WHOLESALE ? 'Wholesale' : 'Retail';
    }

    /**
     * @return list<string>
     */
    public function types(): array
    {
        return [self::RETAIL, self::WHOLESALE];
    }

    /**
     * @return array{types: list<string>, requires_customer: string}
     */
    public function manifest(): array
    {
        return [
            'types'              => $this->types(),
            'requires_customer'  => self::WHOLESALE,
        ];
    }
}
