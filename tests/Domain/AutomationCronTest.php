<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Services\AutomationService;
use PHPUnit\Framework\TestCase;

final class AutomationCronTest extends TestCase
{
    public function test_hourly_cron_hook_name(): void
    {
        $this->assertSame('atoms_hourly', AutomationService::CRON_HOOK);
    }

    public function test_run_counts_include_low_stock_scan(): void
    {
        $this->assertContains('low_stock', AutomationService::countKeyNames());
    }

    public function test_count_key_names_match_run_contract(): void
    {
        $this->assertSame(
            [
                'low_stock',
                'overdue_debts',
                'pending_approvals',
                'stuck_transfers',
                'stuck_repairs',
                'return_escalation',
                'price_schedules',
                'daily_digest',
            ],
            AutomationService::countKeyNames()
        );
    }
}
