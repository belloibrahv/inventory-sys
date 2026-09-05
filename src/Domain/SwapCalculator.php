<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class SwapCalculator
{
    /**
     * Positive difference = customer pays. Negative = store credit / refund.
     */
    public function difference(Money $incomingValue, Money $outgoingPrice): Money
    {
        return $outgoingPrice->subtract($incomingValue);
    }
}
