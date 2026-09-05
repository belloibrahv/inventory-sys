<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\RateLimit;
use Atoms\Domain\ShopIdentity;
use Atoms\Domain\WarrantyPolicy;
use PHPUnit\Framework\TestCase;

final class WarrantyPolicyTest extends TestCase
{
    public function test_cover_includes_the_expiry_day(): void
    {
        $p = new WarrantyPolicy();
        $this->assertTrue($p->covers('2025-01-01 10:00:00', 365, '2026-01-01'));
        $this->assertFalse($p->covers('2025-01-01 10:00:00', 365, '2026-01-02'));
        $this->assertSame('2026-01-01', $p->expiresOn('2025-01-01', 365));
    }

    public function test_zero_days_means_no_warranty(): void
    {
        $p = new WarrantyPolicy();
        $this->assertNull($p->expiresOn('2026-08-01', 0));
        $this->assertFalse($p->covers('2026-08-01', 0, '2026-08-01'));
    }

    public function test_shop_identity_does_not_hardcode_a_client(): void
    {
        $id = new ShopIdentity();
        $this->assertSame('Abu Twins Softskills Investment', $id->of([])['wordmark']);
        $this->assertSame('North Shop', $id->of(['company' => 'North Shop'])['wordmark']);
        $this->assertSame('north', $id->of([
            'company'         => 'North Shop Limited',
            'wordmark'        => 'north',
            'wordmark_accent' => 'Retail',
            'tagline'         => 'PHONES',
        ])['wordmark']);
        $this->assertSame('Retail', $id->of([
            'company'         => 'North Shop Limited',
            'wordmark'        => 'north',
            'wordmark_accent' => 'Retail',
        ])['accent']);
    }

    public function test_rate_limit_blocks_after_the_window_fills(): void
    {
        $r = new RateLimit(3, 60);
        $this->assertTrue($r->allow(0));
        $this->assertTrue($r->allow(2));
        $this->assertFalse($r->allow(3));
        $this->assertSame(60, $r->window());
    }
}
