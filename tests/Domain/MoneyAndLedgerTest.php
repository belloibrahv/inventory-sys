<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\DomainException;
use Atoms\Domain\LedgerMath;
use Atoms\Domain\Money;
use Atoms\Domain\SalePricing;
use Atoms\Domain\SwapCalculator;
use Atoms\Domain\SwapPolicy;
use PHPUnit\Framework\TestCase;

final class MoneyAndLedgerTest extends TestCase
{
    public function test_kobo_arithmetic_avoids_float_drift(): void
    {
        $a = Money::fromMajor('120000');
        $b = Money::fromMajor('80000');
        $this->assertSame(20000000, $a->add($b)->minor());
        $this->assertSame('₦120,000.00', $a->format());
        $this->assertTrue($a->greaterThanOrEqual($b));
        $this->assertTrue($a->greaterThanOrEqual($a));
    }

    public function test_customer_payment_reduces_balance_without_editing_the_sale(): void
    {
        $math    = new LedgerMath();
        $balance = Money::fromMajor(50000);
        $after   = $math->customerPayment($balance, Money::fromMajor(30000));
        $this->assertSame(2000000, $after->minor());
    }

    public function test_selling_below_minimum_requires_approval(): void
    {
        $pricing = new SalePricing();
        $this->assertTrue($pricing->requiresApproval(Money::fromMajor(330000), Money::fromMajor(350000)));
        $this->expectException(DomainException::class);
        $pricing->validateLine(Money::fromMajor(330000), Money::fromMajor(350000), false);
    }

    public function test_swap_difference_matches_the_business_example(): void
    {
        $calc = new SwapCalculator();
        $diff = $calc->difference(Money::fromMajor(120000), Money::fromMajor(200000));
        $this->assertSame(8000000, $diff->minor());
        $this->assertSame('₦80,000.00', $diff->format());
        $policy = new SwapPolicy();
        $this->assertSame('Customer pays ₦80,000.00', $policy->explain($diff));
        $credit = $calc->difference(Money::fromMajor(200000), Money::fromMajor(120000));
        $this->assertSame('Store credit ₦80,000.00', $policy->explain($credit));
        $this->assertSame('Even swap — nothing to collect.', $policy->explain(Money::zero()));
    }

    public function test_swap_cannot_give_out_a_phone_below_minimum(): void
    {
        $policy = new SwapPolicy();
        $this->expectException(DomainException::class);
        $policy->assertOutgoingPrice(Money::fromMajor(100000), Money::fromMajor(280000), false);
    }
}
