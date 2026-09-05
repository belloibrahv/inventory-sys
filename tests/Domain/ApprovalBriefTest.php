<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\ApprovalBrief;
use Atoms\Domain\ApprovalGate;
use PHPUnit\Framework\TestCase;

final class ApprovalBriefTest extends TestCase
{
    public function test_labels_are_business_language(): void
    {
        $b = new ApprovalBrief();
        $this->assertSame('Sell below minimum', $b->label('price_override'));
        $this->assertSame('Expense over threshold', $b->label('expense'));
        $this->assertSame('Stock count variance', $b->label('stock_adjustment'));
    }

    public function test_price_override_names_the_imei_and_price(): void
    {
        $b = new ApprovalBrief();
        $this->assertSame(
            '350000000000001 · Samsung A36 · Black 128GB at ₦1,000.00',
            $b->summary('price_override', ['items' => [[
                'imei'           => '350000000000001',
                'product_name'   => 'Samsung A36',
                'variant_label'  => 'Black 128GB',
                'selling_price'  => 1000,
            ]]])
        );
    }

    public function test_expense_names_category_amount_and_vendor(): void
    {
        $b = new ApprovalBrief();
        $this->assertSame(
            'rent · ₦50,000.00 · Landlord',
            $b->summary('expense', ['category' => 'rent', 'amount' => 50000, 'vendor' => 'Landlord'])
        );
    }

    public function test_stock_summary_counts_missing_devices(): void
    {
        $b = new ApprovalBrief();
        $this->assertSame(
            '1 missing · 0 extra · Samsung A36 · Black 128GB. Vault gap',
            $b->summary('stock_adjustment', [
                'reason'  => 'Vault gap',
                'summary' => ['missing' => 1, 'unknown' => 0, 'wrong_branch' => 0, 'unexpected_status' => 0],
                'missing_lines' => [[
                    'imei'          => '350000000000001',
                    'product_name'  => 'Samsung A36',
                    'variant_label' => 'Black 128GB',
                ]],
            ])
        );
    }

    public function test_auditor_cannot_approve_a_below_min_sale(): void
    {
        $g = new ApprovalGate();
        $this->assertFalse($g->canReview('price_override', false, true));
        $this->assertFalse($g->canReview('expense', false, true));
        $this->assertTrue($g->canReview('stock_adjustment', false, true));
        $this->assertTrue($g->canReview('price_override', true, false));
        $this->assertTrue($g->canReview('stock_adjustment', true, false));
    }
}
