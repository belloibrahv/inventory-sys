<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\AutomationRules;
use PHPUnit\Framework\TestCase;

final class AutomationRulesTest extends TestCase
{
    public function test_thresholds_are_clamped(): void
    {
        $r = new AutomationRules();
        $this->assertSame(0, $r->clampDays(-3));
        $this->assertSame(90, $r->clampDays(400));
        $this->assertSame(24, $r->clampHours(24));
        $this->assertSame(168, $r->clampHours(999));
    }

    public function test_digest_key_is_stable_per_calendar_day(): void
    {
        $r = new AutomationRules();
        $this->assertSame(20260828, $r->digestKey('2026-08-28'));
        $this->assertNotSame($r->digestKey('2026-08-28'), $r->digestKey('2026-08-29'));
    }

    public function test_digest_body_is_readable_without_opening_excel(): void
    {
        $body = (new AutomationRules())->digestBody([
            'invoices' => 4,
            'net'      => '₦280,000.00',
            'pending'  => 1,
            'alerts'   => 3,
        ]);
        $this->assertStringContainsString('4 invoice(s)', $body);
        $this->assertStringContainsString('₦280,000.00', $body);
        $this->assertStringContainsString('1 approval(s)', $body);
        $this->assertStringContainsString('3 alert(s)', $body);
    }
}
