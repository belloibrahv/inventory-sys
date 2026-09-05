<?php
declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Whether the Abu Twins Invent plugin is active.
 */
function abutwins_plugin_active(): bool
{
    return defined('ABUTWINS_INVENT_VERSION') || defined('ATOMS_VERSION') || class_exists(\Atoms\Plugin::class);
}

/**
 * Brand copy from the inventory plugin when available.
 *
 * @return array{company: string, tagline: string}
 */
function abutwins_shop_identity(): array
{
    $fallback = [
        'company' => (string) get_bloginfo('name'),
        'tagline' => (string) get_bloginfo('description'),
    ];

    if (!abutwins_plugin_active() || !class_exists(\Atoms\Domain\ShopIdentity::class)) {
        return $fallback;
    }

    try {
        $ops  = (new \Atoms\Services\SettingsService())->get();
        $shop = (new \Atoms\Domain\ShopIdentity())->of($ops);

        return [
            'company' => (string) ($shop['company'] ?? $fallback['company']),
            'tagline' => (string) ($shop['tagline'] ?? $fallback['tagline']),
        ];
    } catch (\Throwable $e) {
        return $fallback;
    }
}

function abutwins_logo_url(): string
{
    $custom = get_theme_mod('custom_logo');
    if ($custom) {
        $url = wp_get_attachment_image_url((int) $custom, 'full');
        if (is_string($url) && $url !== '') {
            return $url;
        }
    }
    if (abutwins_plugin_active() && (defined('ABUTWINS_INVENT_URL') || defined('ATOMS_URL'))) {
        $base = defined('ABUTWINS_INVENT_URL') ? ABUTWINS_INVENT_URL : ATOMS_URL;

        return $base . 'assets/img/abutwins-mark.png';
    }

    $theme_mark = ABUTWINS_THEME_URI . '/assets/img/abutwins-mark.png';
    if (is_readable(ABUTWINS_THEME_DIR . '/assets/img/abutwins-mark.png')) {
        return $theme_mark;
    }

    return '';
}

/**
 * @return bool True when Elementor already rendered this Theme Builder location.
 */
function abutwins_location(string $location): bool
{
    return function_exists('elementor_theme_do_location') && elementor_theme_do_location($location);
}
