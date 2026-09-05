<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class AutomationRules
{
    public const JOBS = [
        'low_stock',
        'overdue_debts',
        'pending_approvals',
        'stuck_transfers',
        'stuck_repairs',
        'return_escalation',
        'daily_digest',
    ];

    public function clampDays(int $days, int $min = 0, int $max = 90): int
    {
        return max($min, min($max, $days));
    }

    public function clampHours(int $hours, int $min = 0, int $max = 168): int
    {
        return max($min, min($max, $hours));
    }

    public function digestKey(string $ymd): int
    {
        return (int) str_replace('-', '', $ymd);
    }

    /**
     * @param array{invoices?: int, net?: string, pending?: int, alerts?: int} $stats
     */
    public function digestBody(array $stats): string
    {
        return sprintf(
            'Today: %d invoice(s), net %s. %d approval(s) waiting. Automation posted %d alert(s).',
            (int) ($stats['invoices'] ?? 0),
            (string) ($stats['net'] ?? '₦0.00'),
            (int) ($stats['pending'] ?? 0),
            (int) ($stats['alerts'] ?? 0)
        );
    }
}
