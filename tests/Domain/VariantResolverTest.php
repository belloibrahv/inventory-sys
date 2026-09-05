<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\DomainException;
use Atoms\Domain\VariantResolver;
use PHPUnit\Framework\TestCase;

final class VariantResolverTest extends TestCase
{
    public function test_sole_variant_when_columns_blank(): void
    {
        $r = new VariantResolver();
        $id = $r->resolve([['id' => 9, 'color' => 'Black', 'storage' => '128GB', 'is_active' => 1]]);
        $this->assertSame(9, $id);
    }

    public function test_multiple_variants_require_colour_storage(): void
    {
        $this->expectException(DomainException::class);
        (new VariantResolver())->resolve([
            ['id' => 1, 'color' => 'Black', 'storage' => '128GB'],
            ['id' => 2, 'color' => 'Blue', 'storage' => '256GB'],
        ]);
    }

    public function test_match_by_colour_and_storage(): void
    {
        $id = (new VariantResolver())->resolve([
            ['id' => 1, 'color' => 'Black', 'storage' => '128GB'],
            ['id' => 2, 'color' => 'Blue', 'storage' => '256GB'],
        ], 'Blue', '256GB');
        $this->assertSame(2, $id);
    }
}
