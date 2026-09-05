<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class WarrantyPolicy
{
    public function covers(string $soldAt, int $warrantyDays, string $asOf): bool
    {
        $expires = $this->expiresOn($soldAt, $warrantyDays);
        if ($expires === null) {
            return false;
        }

        return $this->day($asOf) <= $expires;
    }

    public function expiresOn(string $soldAt, int $warrantyDays): ?string
    {
        if ($warrantyDays <= 0) {
            return null;
        }
        $sold = $this->day($soldAt);
        if ($sold === '') {
            return null;
        }

        return (new \DateTimeImmutable($sold))->modify('+' . $warrantyDays . ' days')->format('Y-m-d');
    }

    public function clampDays(int $days): int
    {
        return max(0, min(3650, $days));
    }

    private function day(string $datetime): string
    {
        $datetime = trim($datetime);
        if ($datetime === '') {
            return '';
        }

        return substr($datetime, 0, 10);
    }
}
