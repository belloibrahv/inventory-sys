<?php
declare(strict_types=1);

namespace Atoms\Install;

use Atoms\Database\Migrator;
use Atoms\Roles\Capabilities;

final class Activator
{
    public static function activate(): void
    {
        (new Migrator())->migrate();
        (new Capabilities())->install();
        (new Seeder())->seedIfEmpty();

        update_option('atoms_flush_rewrite', '1');
    }
}
