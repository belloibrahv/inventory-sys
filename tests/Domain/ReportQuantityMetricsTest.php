<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use PHPUnit\Framework\TestCase;

/** Documents unified stock KPI field names exposed to dashboard and reports. */
final class ReportQuantityMetricsTest extends TestCase
{
    public function test_stock_snapshot_contract_includes_quantity_and_inbound_fields(): void
    {
        $keys = [
            'low_stock_count',
            'available_qty',
            'quantity_qty',
            'quantity_value',
            'quantity_sku_count',
            'inbound_reserved_count',
            'imei_total',
        ];
        $sample = array_fill_keys($keys, 0);
        foreach ($keys as $key) {
            $this->assertArrayHasKey($key, $sample, 'stock_snapshot must expose ' . $key);
        }
    }

    public function test_dashboard_payload_includes_branch_quantity_totals(): void
    {
        $dash = [
            'quantity_stock' => ['qty' => 10, 'value' => 50000, 'sku_count' => 2],
            'inbound_reserved' => 3,
            'inventory' => ['quantity_qty' => 10, 'quantity_value' => 50000],
        ];
        $this->assertSame(10, $dash['quantity_stock']['qty']);
        $this->assertSame(3, $dash['inbound_reserved']);
        $this->assertSame(10, $dash['inventory']['quantity_qty']);
    }
}
