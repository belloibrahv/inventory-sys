<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\DebtAging;
use Atoms\Domain\DomainException;
use Atoms\Domain\WhatsAppLink;
use PHPUnit\Framework\TestCase;

final class Phase3Test extends TestCase
{
    public function test_nigerian_local_numbers_become_wa_me_links(): void
    {
        $w = new WhatsAppLink();
        $this->assertSame('2348031234567', $w->digits('0803 123 4567'));
        $this->assertSame(
            'https://wa.me/2348031234567?text=' . rawurlencode("Sale posted\nINV-1"),
            $w->chatUrl('08031234567', "Sale posted\nINV-1")
        );
    }

    public function test_whatsapp_requires_a_destination(): void
    {
        $this->expectException(DomainException::class);
        (new WhatsAppLink())->chatUrl('', 'hello');
    }

    public function test_receivable_aging_buckets(): void
    {
        $aging = new DebtAging();
        $this->assertSame('0-30', $aging->bucket(0));
        $this->assertSame('0-30', $aging->bucket(30));
        $this->assertSame('31-60', $aging->bucket(31));
        $this->assertSame('61-90', $aging->bucket(90));
        $this->assertSame('90+', $aging->bucket(91));

        $totals = $aging->totals([
            ['days' => 10, 'amount' => 100],
            ['days' => 45, 'amount' => 40],
            ['days' => 100, 'amount' => 50],
        ]);
        $this->assertSame(100, $totals['0-30']);
        $this->assertSame(40, $totals['31-60']);
        $this->assertSame(0, $totals['61-90']);
        $this->assertSame(50, $totals['90+']);
    }
}
