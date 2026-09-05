<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\DebtReminder;
use Atoms\Domain\DomainException;
use Atoms\Domain\SaleVoidPolicy;
use PHPUnit\Framework\TestCase;

final class SaleVoidPolicyTest extends TestCase
{
    public function test_completed_sold_sale_may_be_voided(): void
    {
        $p = new SaleVoidPolicy();
        $p->assert('completed', false, ['350000000000001' => 'sold']);
        $this->addToAssertionCount(1);
    }

    public function test_returned_invoice_cannot_be_voided(): void
    {
        $this->expectException(DomainException::class);
        $this->expectExceptionMessage('already has a return');
        (new SaleVoidPolicy())->assert('completed', true, ['350000000000001' => 'sold']);
    }

    public function test_cannot_void_if_device_already_moved(): void
    {
        $this->expectException(DomainException::class);
        $this->expectExceptionMessage('no longer sold');
        (new SaleVoidPolicy())->assert('completed', false, ['350000000000001' => 'faulty']);
    }

    public function test_quantity_only_sale_may_be_voided(): void
    {
        (new SaleVoidPolicy())->assert('completed', false, [], true);
        $this->addToAssertionCount(1);
    }

    public function test_debt_reminder_does_not_ask_to_edit_an_invoice(): void
    {
        $text = (new DebtReminder())->text('Ada', 'Abu Twins Softskills Investment', '₦50,000.00');
        $this->assertStringContainsString('Ada', $text);
        $this->assertStringContainsString('₦50,000.00', $text);
        $this->assertStringContainsString('does not change any posted invoice', $text);
    }
}
