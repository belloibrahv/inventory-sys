<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\AutomationRules;
use Atoms\Domain\Money;
use Atoms\Support\Db;

final class AutomationService
{
    public const LAST_OPTION = 'atoms_automation_last';
    public const CRON_HOOK = 'atoms_hourly';

    /**
     * Keys reported in {@see run()} counts — hourly cron must keep this set stable.
     *
     * @return list<string>
     */
    public static function countKeyNames(): array
    {
        return [
            'low_stock',
            'overdue_debts',
            'pending_approvals',
            'stuck_transfers',
            'stuck_repairs',
            'return_escalation',
            'price_schedules',
            'daily_digest',
        ];
    }

    public function __construct(
        private readonly Db $db = new Db(),
        private readonly SettingsService $settings = new SettingsService(),
        private readonly NotifyService $notify = new NotifyService(),
        private readonly ReportService $reports = new ReportService(),
        private readonly AuditLogger $audit = new AuditLogger(),
        private readonly AutomationRules $rules = new AutomationRules()
    ) {
    }

    /**
     * Cron entry: skip when staff turned automation off.
     *
     * @return array<string, mixed>
     */
    public function runFromCron(): array
    {
        $ops = $this->settings->get();
        if (empty($ops['automation_enabled'])) {
            return ['skipped' => true, 'reason' => 'disabled'];
        }

        return $this->run();
    }

    /**
     * @return array<string, mixed>
     */
    public function run(): array
    {
        $ops = $this->settings->get();
        $rules = $this->rules;
        $counts = [
            'low_stock'          => $this->notify->scanLowStock(),
            'overdue_debts'      => $this->notify->scanOverdueDebts($rules->clampDays((int) ($ops['debt_days'] ?? 7))),
            'pending_approvals'  => $this->notify->scanPendingApprovals(2),
            'stuck_transfers'    => $this->notify->scanStuckTransfers($rules->clampHours((int) ($ops['transfer_hours'] ?? 24))),
            'stuck_repairs'      => $this->notify->scanStuckRepairs($rules->clampDays((int) ($ops['repair_days'] ?? 3))),
            'return_escalation'  => $this->notify->scanReturnEscalation($rules->clampDays((int) ($ops['return_days'] ?? 2))),
            'price_schedules'    => (new PricingService())->activateDueSchedules(),
            'daily_digest'       => 0,
        ];
        if (!empty($ops['digest_enabled'])) {
            $counts['daily_digest'] = $this->digest($counts);
        }

        $result = [
            'ran_at' => $this->db->now(),
            'counts' => $counts,
            'alerts' => array_sum($counts),
        ];
        update_option(self::LAST_OPTION, $result);
        $this->audit->log('automation.ran', 'automation', null, null, $counts);

        return $result;
    }

    /**
     * @return array<string, mixed>
     */
    public function status(): array
    {
        $last = get_option(self::LAST_OPTION, null);

        return [
            'enabled'        => !empty($this->settings->get()['automation_enabled']),
            'next_hourly'    => wp_next_scheduled(AutomationService::CRON_HOOK) ?: null,
            'last'           => is_array($last) ? $last : null,
        ];
    }

    /**
     * @param array<string, int> $counts
     */
    private function digest(array $counts): int
    {
        $today = $this->db->today();
        $key   = $this->rules->digestKey($today);
        if ($this->notify->notifiedToday('daily_digest', 'digest', $key)) {
            return 0;
        }

        $sales   = $this->reports->sales($today, $today);
        global $wpdb;
        $pending = (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . $this->db->table('approvals') . " WHERE status = 'pending'");
        $alerts  = array_sum($counts);
        $body    = $this->rules->digestBody([
            'invoices' => (int) $sales['invoices'],
            'net'      => (new Money((int) $sales['net']))->format(),
            'pending'  => $pending,
            'alerts'   => $alerts,
        ]);
        $this->notify->push(
            'daily_digest',
            'Abu Twins Invent daily digest',
            $body,
            ['reference_type' => 'digest', 'reference_id' => $key]
        );

        return 1;
    }
}
