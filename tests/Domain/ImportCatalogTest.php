<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Services\ImportService;
use PHPUnit\Framework\TestCase;

final class ImportCatalogTest extends TestCase
{
    public function test_catalog_includes_inbound_inbound_imeis_and_stock(): void
    {
        $ids = array_column((new ImportService())->catalog(), 'id');
        $this->assertContains('inbound', $ids);
        $this->assertContains('inbound_imeis', $ids);
        $this->assertContains('stock', $ids);
    }

    public function test_inbound_requires_po_manifest_columns(): void
    {
        $required = (new \ReflectionClass(ImportService::class))->getConstant('REQUIRED');
        $this->assertSame(
            ['supplier_name', 'branch_code', 'po_invoice', 'sku', 'quantity'],
            $required['inbound']
        );
    }

    public function test_inbound_imeis_requires_manifest_columns(): void
    {
        $required = (new \ReflectionClass(ImportService::class))->getConstant('REQUIRED');
        $this->assertSame(
            ['supplier_name', 'branch_code', 'po_invoice', 'sku', 'imei'],
            $required['inbound_imeis']
        );
    }
}
