<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use PHPUnit\Framework\TestCase;

/** POS quantity sale line shape used by SaleService::create(). */
final class SaleQuantityLineTest extends TestCase
{
    public function test_quantity_sale_line_requires_product_id_and_quantity(): void
    {
        $line = [
            'product_id'    => 12,
            'quantity'      => 3,
            'selling_price' => 2500,
        ];
        $this->assertSame(12, $line['product_id']);
        $this->assertSame(3, $line['quantity']);
        $this->assertGreaterThan(0, $line['selling_price']);
    }

    public function test_mixed_sale_payload_supports_imei_and_quantity_lines(): void
    {
        $payload = [
            'branch_id'      => 1,
            'customer_id'    => 2,
            'payment_method' => 'cash',
            'paid_amount'    => 285000,
            'items'          => [
                ['imei' => '352094081234567', 'selling_price' => 280000],
                ['product_id' => 5, 'quantity' => 2, 'selling_price' => 2500],
            ],
        ];
        $this->assertCount(2, $payload['items']);
        $this->assertArrayHasKey('imei', $payload['items'][0]);
        $this->assertArrayHasKey('product_id', $payload['items'][1]);
        $this->assertSame(2, $payload['items'][1]['quantity']);
    }
}
