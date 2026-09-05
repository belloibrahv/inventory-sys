<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\LowStockPolicy;
use PHPUnit\Framework\TestCase;

final class CatalogLowStockFlagTest extends TestCase
{
    public function test_at_threshold_is_flagged_low_for_catalog(): void
    {
        $policy = new LowStockPolicy();
        $this->assertTrue($policy->isLow(5, 5));
    }

    public function test_above_threshold_is_not_low_for_catalog(): void
    {
        $policy = new LowStockPolicy();
        $this->assertFalse($policy->isLow(6, 5));
    }

    public function test_catalog_item_shape_includes_is_low_stock(): void
    {
        $item = [
            'id'           => 1,
            'name'         => 'USB-C Cable',
            'total_stock'  => 3,
            'is_low_stock' => true,
            'variants'     => [
                ['label' => 'Standard', 'in_stock' => 3, 'is_low_stock' => true],
            ],
        ];
        $this->assertTrue($item['is_low_stock']);
        $this->assertTrue($item['variants'][0]['is_low_stock']);
    }
}
