<?php
declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Register Elementor Pro Theme Builder locations so header, footer, single,
 * archive, search, and 404 can be designed visually.
 */
add_action('elementor/theme/register_locations', static function ($manager): void {
    if (is_object($manager) && method_exists($manager, 'register_all_core_location')) {
        $manager->register_all_core_location();
    }
});

/**
 * Bridge Elementor Global Colors into public widget CSS variables.
 */
add_action('wp_enqueue_scripts', static function (): void {
    $css = ':root{--atoms-fe-primary:var(--e-global-color-primary,#4F46E5);--atoms-fe-accent:var(--e-global-color-accent,#10B981);--atoms-fe-text:var(--e-global-color-text,#0F172A);}';
    wp_add_inline_style('abutwins-theme', $css);
}, 30);

add_action('admin_notices', static function (): void {
    if (!current_user_can('install_plugins') || !is_admin()) {
        return;
    }
    $screen = function_exists('get_current_screen') ? get_current_screen() : null;
    if (!$screen || !in_array($screen->id, ['themes', 'dashboard', 'plugins'], true)) {
        return;
    }

    $missing = [];
    if (!function_exists('abutwins_plugin_active') || !abutwins_plugin_active()) {
        $missing[] = 'Abu Twins Invent — Inventory & Operations';
    }
    if (!did_action('elementor/loaded')) {
        $missing[] = 'Elementor';
    }
    if (!defined('ELEMENTOR_PRO_VERSION')) {
        $missing[] = 'Elementor Pro (Theme Builder)';
    }
    if ($missing === []) {
        return;
    }

    echo '<div class="notice notice-info"><p><strong>' . esc_html__('Abu Twins Retail', 'abutwins') . '</strong> — ';
    echo esc_html__('Recommended companions for the full storefront experience: ', 'abutwins');
    echo esc_html(implode(', ', $missing));
    echo '.</p></div>';
});
