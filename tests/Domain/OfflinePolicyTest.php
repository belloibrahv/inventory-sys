<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\OfflinePolicy;
use PHPUnit\Framework\TestCase;

final class OfflinePolicyTest extends TestCase
{
    public function test_floor_mutations_queue_settings_do_not(): void
    {
        $p = new OfflinePolicy();
        $this->assertTrue($p->canQueuePost('sales'));
        $this->assertTrue($p->canQueuePost('/returns'));
        $this->assertTrue($p->canQueuePost('customers'));
        $this->assertTrue($p->canQueuePost('customers/12/payments'));
        $this->assertFalse($p->canQueuePost('customers/12/archive'));
        $this->assertFalse($p->canQueuePost('settings'));
        $this->assertFalse($p->canQueuePost('expenses'));
    }

    public function test_lookups_cache_but_mutations_do_not(): void
    {
        $p = new OfflinePolicy();
        $this->assertTrue($p->canCacheGet('imei/356938035643809'));
        $this->assertTrue($p->canCacheGet('customers?q=0803'));
        $this->assertTrue($p->canCacheGet('returns/locate?imei=356938035643809'));
        $this->assertTrue($p->canCacheGet('dashboard?branch_id=1'));
        $this->assertTrue($p->canCacheGet('sales/invoice/INV-A-2026-1'));
        $this->assertFalse($p->canCacheGet('settings'));
        $this->assertFalse($p->canCacheGet('outbox'));
    }

    public function test_queue_label_names_ops(): void
    {
        $p = new OfflinePolicy();
        $this->assertSame('Sale 356938035643809', $p->label('sales', ['items' => [['imei' => '356938035643809']]]));
        $this->assertSame('Return 356938035643809', $p->label('returns', ['items' => [['imei' => '356938035643809']]]));
        $this->assertSame('Customer Ada', $p->label('customers', ['name' => 'Ada']));
        $this->assertSame('Payment ₦5000', $p->label('customers/3/payments', ['amount' => 5000]));
    }

    public function test_manifest_exposes_sync_limits(): void
    {
        $m = (new OfflinePolicy())->manifest();
        $this->assertGreaterThan(0, $m['max_queue']);
        $this->assertGreaterThan(0, $m['max_retries']);
        $this->assertContains('products', $m['warm_gets']);
    }
}
