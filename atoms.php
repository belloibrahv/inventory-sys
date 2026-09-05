<?php
/**
 * Plugin Name: Abu Twins Invent — Inventory & Operations
 * Plugin URI: https://abutwins.local
 * Description: Enterprise inventory, IMEI tracking, sales, returns, swaps, debts, and reporting for multi-branch phone retail. A business operating system, not a generic plugin.
 * Version: 3.39.0
 * Author: TechVaults
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: abutwins
 * Requires at least: 6.4
 * Requires PHP: 8.1
 *
 * @package Atoms
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

define('ATOMS_VERSION', '3.39.0');
define('ATOMS_DB_VERSION', '1.9.0');
define('ATOMS_FILE', __FILE__);
define('ATOMS_PATH', plugin_dir_path(__FILE__));
define('ATOMS_URL', plugin_dir_url(__FILE__));
// Public brand aliases (legacy ATOMS_* constants remain for compatibility).
define('ABUTWINS_INVENT_VERSION', ATOMS_VERSION);
define('ABUTWINS_INVENT_PATH', ATOMS_PATH);
define('ABUTWINS_INVENT_URL', ATOMS_URL);

$atoms_vendor = ATOMS_PATH . 'vendor/autoload.php';
if (is_readable($atoms_vendor)) {
    require $atoms_vendor;
} else {
    require ATOMS_PATH . 'src/Support/Autoload.php';
}

register_activation_hook(__FILE__, [Atoms\Install\Activator::class, 'activate']);
register_deactivation_hook(__FILE__, [Atoms\Install\Deactivator::class, 'deactivate']);

add_action('plugins_loaded', static function (): void {
    Atoms\Plugin::instance()->boot();
});
