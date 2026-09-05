<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class ReportPeriod
{
    public const PRESETS = ['today', 'week', 'month', 'year', 'custom'];

    /**
     * @return array{from: string, to: string, preset: string}
     */
    public function range(string $preset, ?string $from = null, ?string $to = null, ?int $now = null): array
    {
        $preset = in_array($preset, self::PRESETS, true) ? $preset : 'today';
        $ts     = $now ?? (function_exists('current_time') ? (int) current_time('timestamp') : time());
        $today  = date('Y-m-d', $ts);

        if ($preset === 'custom') {
            $from = $this->date($from) ?? $today;
            $to   = $this->date($to) ?? $today;
            if ($from > $to) {
                [$from, $to] = [$to, $from];
            }

            return ['from' => $from, 'to' => $to, 'preset' => 'custom'];
        }

        $from = match ($preset) {
            'week'  => date('Y-m-d', strtotime('monday this week', $ts) ?: $ts),
            'month' => date('Y-m-01', $ts),
            'year'  => date('Y-01-01', $ts),
            default => $today,
        };

        return ['from' => $from, 'to' => $today, 'preset' => $preset];
    }

    private function date(?string $value): ?string
    {
        if ($value === null || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return null;
        }

        return $value;
    }
}
