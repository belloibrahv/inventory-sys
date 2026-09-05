<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\ReceiptLayout;
use Atoms\Domain\ShopIdentity;
use PHPUnit\Framework\TestCase;

final class ReceiptLayoutTest extends TestCase
{
    public function test_receipt_uses_shop_identity_and_serial_not_a_hardcoded_name(): void
    {
        $identity = (new ShopIdentity())->of([
            'company'         => 'North Shop Limited',
            'wordmark'        => 'north',
            'wordmark_accent' => 'Retail',
            'tagline'         => 'PHONES',
        ]);
        $doc = (new ReceiptLayout())->document(
            [
                'invoice_number' => 'INV-NS-2026-00001',
                'posted_at'      => '2026-08-28 10:00:00',
                'sale_type'      => 'wholesale',
                'total'          => 28000000,
                'paid_amount'    => 28000000,
                'due_amount'     => 0,
                'subtotal'       => 28500000,
                'discount'       => 500000,
                'customer'       => ['name' => 'Ada', 'phone' => '08030000000'],
                'salesperson'    => ['name' => 'Tunde'],
                'items'          => [[
                    'imei'            => '356938035643809',
                    'serial_number'   => 'SN-A36-1',
                    'product_name'    => 'Galaxy A36',
                    'variant_label'   => 'Black / 128GB',
                    'selling_price'   => 28000000,
                    'in_warranty'     => true,
                    'warranty_expires'=> '2027-08-28',
                ]],
            ],
            $identity,
            ['name' => 'Ibadan Main', 'address' => 'Ring Road', 'phone' => '08031111111']
        );
        $this->assertSame('north', $doc['wordmark']);
        $this->assertSame('Retail', $doc['accent']);
        $this->assertSame('INV-NS-2026-00001', $doc['invoice']);
        $this->assertSame('Wholesale', $doc['sale_type']);
        $this->assertSame(500000, $doc['discount']);
        $this->assertSame(28500000, $doc['subtotal']);
        $this->assertSame('SN-A36-1', $doc['lines'][0]['serial']);
        $this->assertSame('Black / 128GB', $doc['lines'][0]['variant']);
        $this->assertSame('Until 2027-08-28', $doc['lines'][0]['warranty']);
        $this->assertSame('Ring Road · 08031111111', $doc['branch_line']);
        $this->assertStringNotContainsString('Abu Twins', $doc['wordmark']);
        $this->assertSame(0, $doc['due']);
    }
}
