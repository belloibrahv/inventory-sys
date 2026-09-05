<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use PHPUnit\Framework\TestCase;

/**
 * Guards the sales aggregate bug where foreach ($byTypeRows as $row)
 * overwrote the totals row used for invoices/gross/collected.
 */
final class SalesTotalsShapeTest extends TestCase
{
    public function test_by_type_loop_must_not_reuse_totals_variable_name(): void
    {
        $source = file_get_contents(dirname(__DIR__, 2) . '/src/Services/ReportService.php');
        $this->assertIsString($source);
        $this->assertStringContainsString('$totals = $wpdb->get_row', $source);
        $this->assertStringContainsString('foreach ($byTypeRows as $typeRow)', $source);
        $this->assertStringNotContainsString('foreach ($byTypeRows as $row)', $source);
        $this->assertStringContainsString("si.cost_price * GREATEST(COALESCE(si.quantity, 1), 1)", $source);
    }
}
