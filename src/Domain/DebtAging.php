<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class DebtAging
{
    public function bucket(int $days): string
    {
        $days = max(0, $days);
        if ($days <= 30) {
            return '0-30';
        }
        if ($days <= 60) {
            return '31-60';
        }
        if ($days <= 90) {
            return '61-90';
        }

        return '90+';
    }

    /**
     * @param list<array{days: int, amount: int}> $rows
     * @return array<string, int>
     */
    public function totals(array $rows): array
    {
        $out = ['0-30' => 0, '31-60' => 0, '61-90' => 0, '90+' => 0];
        foreach ($rows as $row) {
            $out[$this->bucket((int) $row['days'])] += (int) $row['amount'];
        }

        return $out;
    }
}
