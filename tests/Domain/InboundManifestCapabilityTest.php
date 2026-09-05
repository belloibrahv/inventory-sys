<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Roles\Capabilities;
use Atoms\Services\ImportService;
use PHPUnit\Framework\TestCase;

final class InboundManifestCapabilityTest extends TestCase
{
    public function test_inbound_coordinator_role_exists_with_manifest_cap(): void
    {
        $caps = new Capabilities();
        $this->assertArrayHasKey('atoms_inbound_coordinator', Capabilities::ROLES);
        $this->assertContains('atoms_manage_inbound', $caps->map()['atoms_inbound_coordinator']);
    }

    public function test_admin_caps_include_manage_inbound(): void
    {
        $this->assertContains('atoms_manage_inbound', (new Capabilities())->allCaps());
    }

    public function test_import_inbound_catalog_only_lists_manifest_types(): void
    {
        $ids = array_column((new ImportService())->inboundCatalog(), 'id');
        $this->assertSame(['inbound', 'inbound_imeis'], $ids);
    }
}
