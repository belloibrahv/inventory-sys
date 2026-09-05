<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class LedgerMath
{
    public function apply(Money $balance, string $entryType, Money $amount): Money
    {
        return match ($entryType) {
            'debit'  => $balance->add($amount),
            'credit' => $balance->subtract($amount),
            default  => throw new DomainException('Ledger entry must be debit or credit.'),
        };
    }

    /**
     * Customer purchases increase what they owe (debit). Payments reduce it (credit).
     */
    public function customerPurchase(Money $balance, Money $amount): Money
    {
        return $this->apply($balance, 'debit', $amount);
    }

    public function customerPayment(Money $balance, Money $amount): Money
    {
        return $this->apply($balance, 'credit', $amount);
    }
}
