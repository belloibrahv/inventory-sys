<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class SaleVoidPolicy
{
    /**
     * Posted invoices are never edited. A void is only allowed when stock
     * is still sold and no return has already corrected the invoice.
     *
     * @param array<string, string> $imeiStatuses IMEI => status
     */
    public function assert(string $status, bool $hasReturns, array $imeiStatuses, bool $hasQuantityLines = false): void
    {
        if ($status !== 'completed') {
            throw new DomainException('Only completed sales can be voided.');
        }
        if ($hasReturns) {
            throw new DomainException('This invoice already has a return. The return is the correction — do not void it.');
        }
        if ($imeiStatuses === [] && !$hasQuantityLines) {
            throw new DomainException('Cannot void a sale with no line items.');
        }
        foreach ($imeiStatuses as $imei => $imeiStatus) {
            if ($imeiStatus !== 'sold') {
                throw new DomainException(sprintf('Cannot void — IMEI %s is no longer sold.', $imei));
            }
        }
    }
}
