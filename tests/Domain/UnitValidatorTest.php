<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\DomainException;
use Atoms\Domain\UnitValidator;
use PHPUnit\Framework\TestCase;

final class UnitValidatorTest extends TestCase
{
    public function test_imei_mode_requires_valid_digits(): void
    {
        $v = new UnitValidator();
        $this->assertSame('356938035643809', $v->assertUnitCode('356938035643809', 'imei'));
        $this->expectException(DomainException::class);
        $v->assertUnitCode('ABC', 'imei');
    }

    public function test_serial_mode_accepts_alphanumeric_codes(): void
    {
        $v = new UnitValidator();
        $this->assertSame('SN-ABC-123', $v->assertUnitCode('sn-abc-123', 'serial'));
    }

    public function test_quantity_mode_rejects_unit_scan(): void
    {
        $v = new UnitValidator();
        $this->expectException(DomainException::class);
        $v->assertUnitCode('12345', 'quantity');
    }
}
