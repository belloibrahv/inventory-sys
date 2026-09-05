<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class ImeiValidator
{
    public function normalize(string $imei): string
    {
        return preg_replace('/\D+/', '', $imei) ?? '';
    }

    public function assertValid(string $imei): string
    {
        $digits = $this->normalize($imei);
        $len    = strlen($digits);

        if ($len < 14 || $len > 16) {
            throw new DomainException('IMEI must be 14 to 16 digits.');
        }

        return $digits;
    }

    public function isValid(string $imei): bool
    {
        try {
            $this->assertValid($imei);

            return true;
        } catch (DomainException) {
            return false;
        }
    }
}
