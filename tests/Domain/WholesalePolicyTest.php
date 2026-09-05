<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\WholesalePolicy;
use PHPUnit\Framework\TestCase;

final class WholesalePolicyTest extends TestCase
{
    public function test_wholesale_requires_customer_retail_does_not(): void
    {
        $p = new WholesalePolicy();
        $this->assertTrue($p->requiresCustomer('wholesale'));
        $this->assertFalse($p->requiresCustomer('retail'));
        $this->assertFalse($p->requiresCustomer('bulk'));
    }

    public function test_normalize_and_label(): void
    {
        $p = new WholesalePolicy();
        $this->assertSame('wholesale', $p->normalize('Wholesale'));
        $this->assertSame('retail', $p->normalize(''));
        $this->assertSame('Retail', $p->label('retail'));
        $this->assertSame('Wholesale', $p->label('wholesale'));
    }
}
