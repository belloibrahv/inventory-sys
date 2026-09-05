<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\DomainException;
use Atoms\Domain\ImeiValidator;
use Atoms\Domain\Money;
use Atoms\Domain\SwapCalculator;
use Atoms\Domain\WarrantyPolicy;
use PHPUnit\Framework\TestCase;

final class PublicApiServiceTest extends TestCase
{
    public function test_imei_validator_rejects_malformed_imei(): void
    {
        $v = new ImeiValidator();
        $this->expectException(DomainException::class);
        $v->assertValid('12345');
    }

    public function test_imei_validator_accepts_valid_imei(): void
    {
        $v = new ImeiValidator();
        $this->assertSame('352094081234567', $v->assertValid('352094081234567'));
        $this->assertTrue($v->isValid('352094081234567'));
        $this->assertFalse($v->isValid('12345'));
    }

    public function test_swap_estimator_calculates_sensible_ranges(): void
    {
        $baseKobo = 20000000; // ₦200,000

        $pristineMult = 0.75;
        $pristineVal = (int) round($baseKobo * $pristineMult);
        $this->assertSame(15000000, $pristineVal);
        $this->assertSame('₦150,000.00', (new Money($pristineVal))->format());

        $brokenMult = 0.25;
        $brokenVal = (int) round($baseKobo * $brokenMult);
        $this->assertSame(5000000, $brokenVal);
        $this->assertSame('₦50,000.00', (new Money($brokenVal))->format());
    }

    public function test_warranty_policy_calculations(): void
    {
        $policy = new WarrantyPolicy();
        $this->assertTrue($policy->covers('2026-01-01 12:00:00', 365, '2026-06-01 12:00:00'));
        $this->assertFalse($policy->covers('2026-01-01 12:00:00', 365, '2027-06-01 12:00:00'));
    }
}
