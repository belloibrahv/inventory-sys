<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\DomainException;
use Atoms\Domain\PriceBulkUpdate;
use PHPUnit\Framework\TestCase;

final class PriceBulkUpdateTest extends TestCase
{
    public function test_set_replaces_floor(): void
    {
        $p = new PriceBulkUpdate();
        $this->assertSame(35000000, $p->nextMinor(28000000, 'set', 350000));
    }

    public function test_percent_raises_and_lowers(): void
    {
        $p = new PriceBulkUpdate();
        $this->assertSame(30800000, $p->nextMinor(28000000, 'percent', 10));
        $this->assertSame(25200000, $p->nextMinor(28000000, 'percent', -10));
    }

    public function test_amount_adds_naira_and_never_goes_negative(): void
    {
        $p = new PriceBulkUpdate();
        $this->assertSame(29000000, $p->nextMinor(28000000, 'amount', 10000));
        $this->assertSame(0, $p->nextMinor(50000, 'amount', -1000));
    }

    public function test_rejects_unknown_mode(): void
    {
        $this->expectException(DomainException::class);
        (new PriceBulkUpdate())->normalizeMode('pack');
    }
}
