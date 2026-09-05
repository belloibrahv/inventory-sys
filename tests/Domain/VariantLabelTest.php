<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\Money;
use Atoms\Domain\VariantLabel;
use PHPUnit\Framework\TestCase;

final class VariantLabelTest extends TestCase
{
    public function test_colour_and_storage_make_the_name_staff_see(): void
    {
        $v = new VariantLabel();
        $this->assertSame('Black / 128GB', $v->format(['color' => 'Black', 'storage' => '128GB']));
        $this->assertSame('Gold / 64GB', $v->format(['variant_name' => 'Gold / 64GB', 'color' => 'Gold']));
        $this->assertSame('', $v->format(null));
    }

    public function test_variant_minimum_beats_the_product_floor(): void
    {
        $v = new VariantLabel();
        $product = ['min_selling_price' => 28000000];
        $this->assertTrue($v->minimum($product, ['min_selling_price' => 45000000])->equals(new Money(45000000)));
        $this->assertTrue($v->minimum($product, ['min_selling_price' => 0])->equals(new Money(28000000)));
        $this->assertTrue($v->minimum($product, null)->equals(new Money(28000000)));
    }
}
