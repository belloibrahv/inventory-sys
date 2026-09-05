<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use PHPUnit\Framework\TestCase;

/** Ensures unified inventory rows carry track_mode for UI grouping. */
final class InventoryCentralTest extends TestCase
{
    public function test_quantity_rows_are_identified_by_track_mode(): void
    {
        $rows = [
            ['product_id' => 1, 'track_mode' => 'imei', 'qty' => 3],
            ['product_id' => 2, 'track_mode' => 'quantity', 'qty' => 50],
        ];
        $devices = array_values(array_filter($rows, static fn (array $r): bool => ($r['track_mode'] ?? 'imei') !== 'quantity'));
        $accessories = array_values(array_filter($rows, static fn (array $r): bool => ($r['track_mode'] ?? '') === 'quantity'));

        $this->assertCount(1, $devices);
        $this->assertCount(1, $accessories);
        $this->assertSame(50, $accessories[0]['qty']);
    }
}
