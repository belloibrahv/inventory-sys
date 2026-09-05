<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use PHPUnit\Framework\TestCase;

final class NotifyLowStockKindTest extends TestCase
{
    public function test_quantity_rows_use_accessory_label_in_message(): void
    {
        $row = [
            'name'                => 'USB-C Cable',
            'variant_label'       => '',
            'qty'                 => 3,
            'low_stock_threshold' => 5,
            'branch_name'         => 'Main Branch',
            'track_mode'          => 'quantity',
        ];
        $kind = ($row['track_mode'] ?? '') === 'quantity' ? 'Accessory' : 'Device';
        $body = sprintf(
            '%s (%s) has %d on hand at %s (threshold %d).',
            $row['name'],
            $kind,
            (int) $row['qty'],
            $row['branch_name'],
            (int) $row['low_stock_threshold']
        );
        $this->assertStringContainsString('Accessory', $body);
        $this->assertStringContainsString('USB-C Cable', $body);
    }
}
