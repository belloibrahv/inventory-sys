<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Services\UserService;
use PHPUnit\Framework\TestCase;

final class UserServiceRolesTest extends TestCase
{
    public function test_role_options_lists_atoms_roles(): void
    {
        $opts = (new UserService())->roleOptions();
        $ids  = array_column($opts, 'id');

        $this->assertContains('atoms_branch_manager', $ids);
        $this->assertContains('atoms_sales_officer', $ids);
        $this->assertNotContains('administrator', $ids);
    }
}
