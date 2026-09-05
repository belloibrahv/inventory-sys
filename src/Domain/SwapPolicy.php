<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class SwapPolicy
{
    public function __construct(private readonly SalePricing $pricing = new SalePricing())
    {
    }

    public function assertOutgoingPrice(Money $outgoingPrice, Money $minimum, bool $managerApproved): void
    {
        if ($this->pricing->requiresApproval($outgoingPrice, $minimum) && !$managerApproved) {
            throw new DomainException('Outgoing price is below the minimum. A manager must complete this swap or raise the price.');
        }
    }

    public function explain(Money $difference): string
    {
        if ($difference->isZero()) {
            return 'Even swap — nothing to collect.';
        }
        if ($difference->isNegative()) {
            return 'Store credit ' . (new Money(abs($difference->minor())))->format();
        }

        return 'Customer pays ' . $difference->format();
    }
}
