<?php
declare(strict_types=1);

namespace Atoms\Install;

final class Deactivator
{
    public static function deactivate(): void
    {
        wp_clear_scheduled_hook('atoms_daily');
        flush_rewrite_rules();
    }
}
