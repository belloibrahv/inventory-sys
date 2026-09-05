<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\ArchivePolicy;
use PHPUnit\Framework\TestCase;

final class ArchivePolicyTest extends TestCase
{
    public function test_catalog_entities_archive_sales_do_not(): void
    {
        $p = new ArchivePolicy();
        $this->assertTrue($p->canArchive('products'));
        $this->assertTrue($p->canArchive('customers'));
        $this->assertTrue($p->canArchive('suppliers'));
        $this->assertFalse($p->canArchive('sales'));
        $this->assertFalse($p->canArchive('payments'));
    }
}
