<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\DomainException;
use Atoms\Domain\ImeiValidator;
use Atoms\Domain\InvoiceNumber;
use Atoms\Domain\ReturnTypes;
use PHPUnit\Framework\TestCase;

final class ValidatorsTest extends TestCase
{
    public function test_imei_must_be_14_to_16_digits(): void
    {
        $v = new ImeiValidator();
        $this->assertSame('356938035643809', $v->assertValid('3569 3803 5643 809'));
        $this->expectException(DomainException::class);
        $v->assertValid('12345');
    }

    public function test_invoice_numbers_are_branch_scoped_and_sequential(): void
    {
        $this->assertSame('INV-IBD-2026-00007', InvoiceNumber::next('INV', 'IBD', 2026, 7));
    }

    public function test_faulty_returns_map_to_faulty_imei_event(): void
    {
        $this->assertSame('return_faulty', ReturnTypes::imeiEvent(ReturnTypes::FAULTY));
    }
}
