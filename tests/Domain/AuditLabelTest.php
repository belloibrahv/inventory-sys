<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\AuditDiff;
use Atoms\Domain\AuditLabel;
use PHPUnit\Framework\TestCase;

final class AuditLabelTest extends TestCase
{
    public function test_spec_examples_use_business_words(): void
    {
        $l = new AuditLabel();
        $this->assertSame('Sale posted', $l->of('sale.created'));
        $this->assertSame('Payment added', $l->of('payment.posted'));
        $this->assertSame('Approval granted', $l->of('approval.approved'));
        $this->assertSame('Stock adjustment posted', $l->of('stock_count.posted'));
        $this->assertSame('Unknown event', $l->of('unknown.event'));
    }

    public function test_created_summary_prefers_invoice_or_imei(): void
    {
        $d = new AuditDiff();
        $this->assertSame('Created INV-BRA-2026-00001', $d->summarize(null, ['invoice' => 'INV-BRA-2026-00001', 'total' => 1]));
        $this->assertSame('Created 350000000000001', $d->summarize(null, ['imei' => '350000000000001']));
        $this->assertSame('Created', $d->summarize(null, ['amount' => 100]));
    }

    public function test_created_summary_includes_variant_devices(): void
    {
        $d = new AuditDiff();
        $this->assertSame(
            'Created INV-001 · 350000000000001 · Samsung · Black / 128GB',
            $d->summarize(null, [
                'invoice' => 'INV-001',
                'devices' => '350000000000001 · Samsung · Black / 128GB',
            ])
        );
        $this->assertSame(
            'Created RPR-001 · 350000000000001 · iPhone · Blue / 256GB',
            $d->summarize(null, [
                'ticket'        => 'RPR-001',
                'imei'          => '350000000000001',
                'product_name'  => 'iPhone',
                'variant_label' => 'Blue / 256GB',
            ])
        );
    }

    public function test_update_summary_lists_changed_scalar_fields(): void
    {
        $d = new AuditDiff();
        $this->assertSame(
            'status: received → diagnosing',
            $d->summarize(['status' => 'received', 'created_at' => 'x'], ['status' => 'diagnosing', 'created_at' => 'y'])
        );
        $this->assertSame('Updated', $d->summarize(['status' => 'open'], ['status' => 'open']));
    }

    public function test_json_strings_are_decoded_before_diff(): void
    {
        $d = new AuditDiff();
        $this->assertSame(
            'status: available → sold',
            $d->summarize('{"status":"available"}', '{"status":"sold"}')
        );
    }
}
