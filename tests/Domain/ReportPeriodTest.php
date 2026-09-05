<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\CsvExporter;
use Atoms\Domain\ImeiStatus;
use Atoms\Domain\ImeiStatusMachine;
use Atoms\Domain\ReportPeriod;
use PHPUnit\Framework\TestCase;

final class ReportPeriodTest extends TestCase
{
    public function test_presets_use_local_calendar_days(): void
    {
        $now    = strtotime('2026-08-28 15:00:00');
        $period = new ReportPeriod();

        $this->assertSame(
            ['from' => '2026-08-28', 'to' => '2026-08-28', 'preset' => 'today'],
            $period->range('today', null, null, $now)
        );
        $this->assertSame('2026-08-24', $period->range('week', null, null, $now)['from']);
        $this->assertSame('2026-08-01', $period->range('month', null, null, $now)['from']);
        $this->assertSame('2026-01-01', $period->range('year', null, null, $now)['from']);
        $this->assertSame('2026-08-28', $period->range('week', null, null, $now)['to']);
    }

    public function test_custom_range_swaps_inverted_dates(): void
    {
        $range = (new ReportPeriod())->range('custom', '2026-08-20', '2026-08-10', strtotime('2026-08-28'));
        $this->assertSame('2026-08-10', $range['from']);
        $this->assertSame('2026-08-20', $range['to']);
        $this->assertSame('custom', $range['preset']);
    }

    public function test_csv_quotes_commas_and_keeps_naira_decimals(): void
    {
        $csv = (new CsvExporter())->toString(
            ['Invoice', 'Customer', 'Total'],
            [['INV-1', 'Adebayo, Lagos', '280000.00']]
        );
        $this->assertStringContainsString('Invoice,Customer,Total', $csv);
        $this->assertStringContainsString('"Adebayo, Lagos"', $csv);
        $this->assertStringContainsString('280000.00', $csv);
    }

    public function test_supplier_return_disposes_available_or_faulty_only(): void
    {
        $machine = new ImeiStatusMachine();
        $this->assertSame(ImeiStatus::Disposed, $machine->apply(ImeiStatus::Available, 'supplier_return'));
        $this->assertSame(ImeiStatus::Disposed, $machine->apply(ImeiStatus::Faulty, 'supplier_return'));
        $this->assertFalse($machine->canTransition(ImeiStatus::Sold, 'supplier_return'));
        $this->assertFalse($machine->canTransition(ImeiStatus::Reserved, 'supplier_return'));
    }
}
