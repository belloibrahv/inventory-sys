<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\HomeDashboardPolicy;
use Atoms\Services\HomeDashboardService;
use PHPUnit\Framework\TestCase;

final class HomeDashboardServiceTest extends TestCase
{
    public function test_for_user_uses_store_layout_without_override(): void
    {
        if (!function_exists('get_user_meta')) {
            $this->markTestSkipped('WordPress not loaded.');
        }

        $svc = new HomeDashboardService();
        $settings = [
            'home_kpis' => (new HomeDashboardPolicy())->defaults(),
            'home_show_trends' => true,
        ];
        $home = $svc->forUser(1, ['atoms_cashier'], $settings);
        $this->assertSame('cashier', $home['persona']);
        $this->assertFalse($home['has_override']);
        $this->assertSame($settings['home_kpis']['cashier'], $home['effective_kpis']);
    }
}
