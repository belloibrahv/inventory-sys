<?php
declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

add_action('after_setup_theme', static function (): void {
    load_theme_textdomain('abutwins', ABUTWINS_THEME_DIR . '/languages');

    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('automatic-feed-links');
    add_theme_support('html5', [
        'search-form',
        'comment-form',
        'comment-list',
        'gallery',
        'caption',
        'style',
        'script',
        'navigation-widgets',
    ]);
    add_theme_support('custom-logo', [
        'height'      => 64,
        'width'       => 240,
        'flex-height' => true,
        'flex-width'  => true,
    ]);
    add_theme_support('custom-background', [
        'default-color' => 'f8fafc',
    ]);
    add_theme_support('align-wide');
    add_theme_support('responsive-embeds');
    add_theme_support('editor-styles');
    add_theme_support('wp-block-styles');
    add_theme_support('elementor');
    add_theme_support('customize-selective-refresh-widgets');

    register_nav_menus([
        'primary' => __('Primary menu', 'abutwins'),
        'footer'  => __('Footer menu', 'abutwins'),
    ]);

    add_editor_style('assets/css/theme.css');
});

add_action('wp_enqueue_scripts', static function (): void {
    wp_enqueue_style(
        'abutwins-fonts',
        'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap',
        [],
        null
    );
    wp_enqueue_style(
        'abutwins-theme',
        ABUTWINS_THEME_URI . '/assets/css/theme.css',
        ['abutwins-fonts'],
        ABUTWINS_THEME_VERSION
    );

    if (is_singular() && comments_open() && get_option('thread_comments')) {
        wp_enqueue_script('comment-reply');
    }
}, 20);

add_action('wp_head', static function (): void {
    $icon = ABUTWINS_THEME_URI . '/assets/img/favicon.ico';
    $png  = ABUTWINS_THEME_URI . '/assets/img/abutwins-icon-32.png';
    $apple = ABUTWINS_THEME_URI . '/assets/img/apple-touch-icon.png';
    if (function_exists('abutwins_plugin_active') && abutwins_plugin_active() && defined('ATOMS_URL')) {
        $icon  = ATOMS_URL . 'assets/img/favicon.ico';
        $png   = ATOMS_URL . 'assets/img/favicon-32.png';
        $apple = ATOMS_URL . 'assets/img/apple-touch-icon.png';
    }
    echo '<link rel="icon" href="' . esc_url($icon) . '" sizes="any">' . "\n";
    echo '<link rel="icon" type="image/png" href="' . esc_url($png) . '" sizes="32x32">' . "\n";
    echo '<link rel="apple-touch-icon" href="' . esc_url($apple) . '">' . "\n";
}, 1);

add_filter('body_class', static function (array $classes): array {
    $classes[] = 'abutwins-theme';
    if (function_exists('abutwins_plugin_active') && abutwins_plugin_active()) {
        $classes[] = 'abutwins-has-plugin';
    }
    if (did_action('elementor/loaded')) {
        $classes[] = 'abutwins-has-elementor';
    }

    return $classes;
});

add_action('widgets_init', static function (): void {
    register_sidebar([
        'name'          => __('Footer widgets', 'abutwins'),
        'id'            => 'footer-1',
        'description'   => __('Appears in the fallback footer when no Elementor footer template is assigned.', 'abutwins'),
        'before_widget' => '<div id="%1$s" class="abutwins-footer-widget %2$s">',
        'after_widget'  => '</div>',
        'before_title'  => '<h3 class="abutwins-footer-widget-title">',
        'after_title'   => '</h3>',
    ]);
});

/**
 * Fallback primary menu when no menu is assigned.
 */
function abutwins_fallback_menu(): void
{
    echo '<ul class="menu">';
    echo '<li><a href="' . esc_url(home_url('/')) . '">' . esc_html__('Home', 'abutwins') . '</a></li>';
    if (function_exists('abutwins_plugin_active') && abutwins_plugin_active()) {
        echo '<li><a href="' . esc_url(home_url('/stock/')) . '">' . esc_html__('Stock', 'abutwins') . '</a></li>';
        echo '<li><a href="' . esc_url(home_url('/warranty/')) . '">' . esc_html__('Warranty', 'abutwins') . '</a></li>';
        echo '<li><a href="' . esc_url(home_url('/trade-in/')) . '">' . esc_html__('Trade-in', 'abutwins') . '</a></li>';
        echo '<li><a href="' . esc_url(home_url('/branches/')) . '">' . esc_html__('Branches', 'abutwins') . '</a></li>';
    }
    echo '</ul>';
}
