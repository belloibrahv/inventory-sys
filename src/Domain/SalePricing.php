<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class SalePricing
{
    public function requiresApproval(Money $sellingPrice, Money $minimumPrice): bool
    {
        return $sellingPrice->lessThan($minimumPrice);
    }

    public function validateLine(Money $sellingPrice, Money $minimumPrice, bool $approved): void
    {
        if ($this->requiresApproval($sellingPrice, $minimumPrice) && !$approved) {
            throw new DomainException('Selling below the minimum price requires manager approval.');
        }
    }
}
