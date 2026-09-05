<?php
/**
 * Abu Twins Retail functions and definitions.
 *
 * @package Abutwins
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

define('ABUTWINS_THEME_VERSION', '1.2.0');
define('ABUTWINS_THEME_DIR', get_template_directory());
define('ABUTWINS_THEME_URI', get_template_directory_uri());

require_once ABUTWINS_THEME_DIR . '/inc/setup.php';
require_once ABUTWINS_THEME_DIR . '/inc/elementor.php';
require_once ABUTWINS_THEME_DIR . '/inc/plugin.php';
