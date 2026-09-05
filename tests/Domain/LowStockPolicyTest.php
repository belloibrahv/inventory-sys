<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\LowStockPolicy;
use PHPUnit\Framework\TestCase;

final class LowStockPolicyTest extends TestCase
{
    public function test_threshold_zero_never_alerts(): void
    {
        $p = new LowStockPolicy();
        $this->assertFalse($p->isLow(0, 0));
        $this->assertFalse($p->isLow(1, 0));
    }

    public function test_at_or_below_threshold_alerts(): void
    {
        $p = new LowStockPolicy();
        $this->assertTrue($p->isLow(2, 2));
        $this->assertTrue($p->isLow(0, 2));
        $this->assertFalse($p->isLow(3, 2));
    }
}
