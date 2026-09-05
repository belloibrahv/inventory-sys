<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\AuditLink;
use PHPUnit\Framework\TestCase;

final class AuditLinkTest extends TestCase
{
    public function test_sale_audit_links_to_invoice(): void
    {
        $link = (new AuditLink())->for([
            'entity_type' => 'sale',
            'entity_id'   => 12,
            'new'         => ['invoice' => 'INV-BRA-2026-00001', 'devices' => '350000000000001 · Samsung'],
        ]);
        $this->assertSame('invoice', $link['screen'] ?? '');
        $this->assertSame('INV-BRA-2026-00001', $link['invoice'] ?? '');
    }

    public function test_repair_and_stock_count_link_to_desks(): void
    {
        $repair = (new AuditLink())->for(['entity_type' => 'repair', 'entity_id' => 5, 'new' => []]);
        $count  = (new AuditLink())->for(['entity_type' => 'stock_count', 'entity_id' => 9, 'new' => []]);
        $this->assertSame('repairs', $repair['screen'] ?? '');
        $this->assertSame(5, $repair['id'] ?? 0);
        $this->assertSame('stocktake', $count['screen'] ?? '');
        $this->assertSame(9, $count['id'] ?? 0);
    }

    public function test_imei_audit_links_to_scan_screen(): void
    {
        $link = (new AuditLink())->for([
            'entity_type' => 'imei',
            'entity_id'   => 3,
            'new'         => ['imei' => '350000000000001', 'status' => 'sold'],
        ]);
        $this->assertSame('imei', $link['screen'] ?? '');
        $this->assertSame('350000000000001', $link['imei'] ?? '');
    }

    public function test_approval_audit_links_to_detail_desk(): void
    {
        $link = (new AuditLink())->for(['entity_type' => 'approval', 'entity_id' => 7, 'new' => []]);
        $this->assertSame('approvals', $link['screen'] ?? '');
        $this->assertSame(7, $link['id'] ?? 0);
    }

    public function test_expense_audit_links_to_detail_desk(): void
    {
        $link = (new AuditLink())->for(['entity_type' => 'expense', 'entity_id' => 4, 'new' => []]);
        $this->assertSame('expenses', $link['screen'] ?? '');
        $this->assertSame(4, $link['id'] ?? 0);
    }
}
