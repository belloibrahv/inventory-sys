<?php
declare(strict_types=1);

namespace Atoms\Admin;

final class Menu
{
    public function register(): void
    {
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_enqueue_scripts', [$this, 'assets']);
        add_action('admin_head', [$this, 'favicon'], 1);
        add_action('admin_head', [$this, 'adminMenuIconCss'], 20);
        add_action('login_head', [$this, 'favicon'], 1);
        add_action('wp_head', [$this, 'favicon'], 1);
        add_filter('get_site_icon_url', [$this, 'siteIconUrl'], 10, 2);
        add_action('admin_init', [$this, 'maybeRedirect']);
        add_action('in_admin_header', static function (): void {
            if (isset($_GET['page']) && $_GET['page'] === 'atoms') {
                remove_all_actions('admin_notices');
                remove_all_actions('all_admin_notices');
            }
        });
        add_filter('admin_body_class', [$this, 'bodyClass']);
    }

    public function bodyClass(string $classes): string
    {
        if (isset($_GET['page']) && $_GET['page'] === 'atoms') {
            $classes .= ' atoms-app-body';
        }
        return $classes;
    }

    public function menu(): void
    {
        add_menu_page(
            'Abu Twins Invent',
            'Abu Twins Invent',
            'atoms_access',
            'atoms',
            [$this, 'render'],
            // WP admin menus expect ~20px icons; a 512px mark renders full-size and covers the sidebar.
            ATOMS_URL . 'assets/img/abutwins-icon-20.png',
            2
        );
    }

    public function favicon(): void
    {
        $base = ATOMS_URL . 'assets/img/';
        echo '<link rel="icon" href="' . esc_url($base . 'favicon.ico') . '?v=' . rawurlencode(ATOMS_VERSION) . '" sizes="any">' . "\n";
        echo '<link rel="icon" type="image/png" href="' . esc_url($base . 'favicon-32.png') . '?v=' . rawurlencode(ATOMS_VERSION) . '" sizes="32x32">' . "\n";
        echo '<link rel="apple-touch-icon" href="' . esc_url($base . 'apple-touch-icon.png') . '?v=' . rawurlencode(ATOMS_VERSION) . '">' . "\n";
    }

    /**
     * Constrain the plugin menu icon on every wp-admin screen (not only page=atoms).
     * WordPress does not set max-width on .wp-menu-image img, so large PNGs blow up.
     */
    public function adminMenuIconCss(): void
    {
        echo '<style id="atoms-admin-menu-icon">'
            . '#adminmenu #toplevel_page_atoms .wp-menu-image img,'
            . '#adminmenu #toplevel_page_atoms div.wp-menu-image img{'
            . 'width:20px!important;height:20px!important;max-width:20px!important;max-height:20px!important;'
            . 'padding:7px 0 0!important;object-fit:contain;box-sizing:content-box;'
            . '}'
            . '</style>' . "\n";
    }

    public function siteIconUrl($url, $size)
    {
        $size = (int) $size;
        if ($size > 0 && $size <= 32) {
            return ATOMS_URL . 'assets/img/favicon-32.png';
        }
        if ($size > 32 && $size <= 48) {
            return ATOMS_URL . 'assets/img/abutwins-icon-48.png';
        }
        if ($size > 48 && $size <= 180) {
            return ATOMS_URL . 'assets/img/apple-touch-icon.png';
        }
        if ($size > 180 && $size <= 192) {
            return ATOMS_URL . 'assets/img/abutwins-icon-192.png';
        }

        return ATOMS_URL . 'assets/img/abutwins-icon-512.png';
    }

    public function render(): void
    {
        include ATOMS_PATH . 'templates/admin-app.php';
    }

    public function assets(string $hook): void
    {
        if (!str_contains($hook, 'atoms')) {
            return;
        }

        $settings = (new \Atoms\Services\SettingsService())->get();

        wp_enqueue_style(
            'atoms-fonts',
            'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;600&display=swap',
            [],
            null
        );
        wp_enqueue_style(
            'atoms-material-symbols',
            'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200',
            [],
            null
        );
        wp_enqueue_style('atoms', ATOMS_URL . 'assets/css/atoms.css', ['atoms-fonts', 'atoms-material-symbols'], ATOMS_VERSION);

        wp_enqueue_script(
            'atoms-chartjs',
            'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js',
            [],
            '4.4.2',
            true
        );

        if (!empty($settings['google_maps_key'])) {
            wp_enqueue_script(
                'atoms-google-maps',
                'https://maps.googleapis.com/maps/api/js?key=' . esc_attr($settings['google_maps_key']) . '&libraries=places',
                [],
                null,
                true
            );
        }

        wp_enqueue_script(
            'html5-qrcode',
            'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
            [],
            '2.3.8',
            true
        );

        wp_enqueue_script(
            'atoms-scanner',
            ATOMS_URL . 'assets/js/atoms-scanner.js',
            ['html5-qrcode'],
            ATOMS_VERSION,
            true
        );

        wp_enqueue_script('atoms', ATOMS_URL . 'assets/js/atoms.js', ['atoms-chartjs', 'atoms-scanner'], ATOMS_VERSION, true);
        $boot = [
            'root'  => esc_url_raw(rest_url('atoms/v1/')),
            'nonce' => wp_create_nonce('wp_rest'),
            'home'  => admin_url('admin.php?page=atoms'),
            'pwa'   => false,
            'sw'    => home_url('/atoms-app/sw.js'),
            'app'   => home_url('/atoms-app/'),
            'google_maps_key' => $settings['google_maps_key'] ?? '',
            'product' => 'Abu Twins Invent',
        ];
        wp_localize_script('atoms', 'ABUTWINS', $boot);
        // Backward-compatible alias for cached pages.
        wp_localize_script('atoms', 'ATOMS', $boot);
    }

    public function maybeRedirect(): void
    {
        if (!is_admin() || !current_user_can('atoms_access') || current_user_can('manage_options')) {
            return;
        }
        global $pagenow;
        if ($pagenow === 'index.php') {
            wp_safe_redirect(admin_url('admin.php?page=atoms'));
            exit;
        }
    }
}
