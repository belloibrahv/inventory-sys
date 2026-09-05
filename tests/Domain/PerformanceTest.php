<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\Performance;
use PHPUnit\Framework\TestCase;

final class PerformanceTest extends TestCase
{
    public function test_profit_is_revenue_minus_cost(): void
    {
        $p = new Performance();
        $this->assertSame(3000000, $p->profit(28000000, 25000000));
        $this->assertSame(-100, $p->profit(0, 100));
    }

    public function test_collection_rate_is_zero_when_nothing_was_sold(): void
    {
        $p = new Performance();
        $this->assertSame(0.0, $p->collectionRate(0, 0));
        $this->assertSame(50.0, $p->collectionRate(14000000, 28000000));
        $this->assertSame(100.0, $p->collectionRate(28000000, 28000000));
    }
}
