<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\HomeDashboardPolicy;
use PHPUnit\Framework\TestCase;

final class HomeDashboardPolicyTest extends TestCase
{
    public function test_normalize_rejects_unknown_widgets_and_keeps_order(): void
    {
        $p = new HomeDashboardPolicy();
        $layout = $p->normalize([
            'cashier' => ['sales_today', 'bogus', 'cash_collected', 'cash_collected'],
        ]);
        $this->assertSame(['sales_today', 'cash_collected'], $layout['cashier']);
    }

    public function test_normalize_falls_back_to_defaults_when_empty(): void
    {
        $p = new HomeDashboardPolicy();
        $layout = $p->normalize(['manager' => []]);
        $this->assertSame($p->defaults()['manager'], $layout['manager']);
    }

    public function test_resolve_persona_maps_roles(): void
    {
        $p = new HomeDashboardPolicy();
        $this->assertSame('engineer', $p->resolvePersona(['atoms_engineer']));
        $this->assertSame('cashier', $p->resolvePersona(['atoms_cashier']));
        $this->assertSame('owner', $p->resolvePersona(['administrator']));
        $this->assertSame('manager', $p->resolvePersona(['atoms_branch_manager']));
    }
}
