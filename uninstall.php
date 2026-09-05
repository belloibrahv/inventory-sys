<?php
/**
 * Uninstall keeps operational data. Nothing financial or inventory-related is deleted.
 * Archives are the only allowed form of removal. See product principle 4.
 *
 * @package Atoms
 */

declare(strict_types=1);

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('atoms_flush_rewrite');
