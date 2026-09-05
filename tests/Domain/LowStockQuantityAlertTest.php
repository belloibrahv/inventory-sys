<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\LowStockPolicy;
use PHPUnit\Framework\TestCase;

final class LowStockQuantityAlertTest extends TestCase
{
    public function test_quantity_accessory_at_three_with_threshold_five_is_low(): void
    {
        $policy = new LowStockPolicy();
        $this->assertTrue($policy->isLow(3, 5));
    }

    public function test_quantity_accessory_at_zero_with_threshold_five_is_low(): void
    {
        $policy = new LowStockPolicy();
        $this->assertTrue($policy->isLow(0, 5));
    }

    public function test_quantity_accessory_above_threshold_is_not_low(): void
    {
        $policy = new LowStockPolicy();
        $this->assertFalse($policy->isLow(6, 5));
    }
}
