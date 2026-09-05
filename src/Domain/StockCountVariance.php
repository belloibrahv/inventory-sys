<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class StockCountVariance
{
    public const MATCH = 'match';
    public const MISSING = 'missing';
    public const WRONG_BRANCH = 'wrong_branch';
    public const UNKNOWN = 'unknown';
    public const UNEXPECTED_STATUS = 'unexpected_status';

    public function classify(?array $imei, int $countBranchId, bool $onSnapshot): string
    {
        if ($imei === null) {
            return self::UNKNOWN;
        }
        if ((int) $imei['branch_id'] !== $countBranchId) {
            return self::WRONG_BRANCH;
        }
        if ($onSnapshot) {
            return self::MATCH;
        }

        return self::UNEXPECTED_STATUS;
    }

    public function classifyQuantity(int $expectedQty, int $countedQty): string
    {
        if ($countedQty === $expectedQty) {
            return self::MATCH;
        }
        if ($countedQty < $expectedQty) {
            return self::MISSING;
        }

        return self::UNEXPECTED_STATUS;
    }

    /**
     * @param list<array{variance: string}> $lines
     * @return array<string, int>
     */
    public function summary(array $lines): array
    {
        $out = [
            self::MATCH              => 0,
            self::MISSING            => 0,
            self::WRONG_BRANCH       => 0,
            self::UNKNOWN            => 0,
            self::UNEXPECTED_STATUS  => 0,
        ];
        foreach ($lines as $line) {
            $key = (string) ($line['variance'] ?? '');
            if (isset($out[$key])) {
                $out[$key]++;
            }
        }

        return $out;
    }

    /**
     * @param array<string, int> $summary
     */
    public function needsApproval(array $summary): bool
    {
        return ($summary[self::MISSING] ?? 0) > 0
            || ($summary[self::WRONG_BRANCH] ?? 0) > 0
            || ($summary[self::UNKNOWN] ?? 0) > 0;
    }

    public function canDispose(string $status): bool
    {
        return in_array($status, [ImeiStatus::Available->value, ImeiStatus::Faulty->value], true);
    }
}
