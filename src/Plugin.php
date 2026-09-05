<?php
declare(strict_types=1);

namespace Atoms;

use Atoms\Admin\Menu;
use Atoms\Admin\Pwa;
use Atoms\Database\Migrator;
use Atoms\Integrations\Elementor\ElementorExtension;
use Atoms\Integrations\Shortcodes\ShortcodesHandler;
use Atoms\Rest\Router;
use Atoms\Roles\Capabilities;
use Atoms\Services\AutomationService;

final class Plugin
{
    private static ?self $instance = null;

    public static function instance(): self
    {
        if (!self::$instance) {
            self::$instance = new self();
        }

        return self::$instance;
    }

    public function boot(): void
    {
        load_plugin_textdomain('atoms', false, dirname(plugin_basename(ATOMS_FILE)) . '/languages');

        (new Migrator())->maybeMigrate();
        (new Capabilities())->install();
        (new Menu())->register();
        (new Pwa())->register();
        (new Router())->register();
        (new ElementorExtension())->register();
        (new ShortcodesHandler())->register();

        add_action(AutomationService::CRON_HOOK, static function (): void {
            (new AutomationService())->runFromCron();
        });
        if (!wp_next_scheduled(AutomationService::CRON_HOOK)) {
            wp_schedule_event(time() + 60, 'hourly', AutomationService::CRON_HOOK);
        }
        $daily = wp_next_scheduled('atoms_daily');
        if ($daily) {
            wp_unschedule_event($daily, 'atoms_daily');
        }

        if (get_option('atoms_flush_rewrite') === '1') {
            flush_rewrite_rules();
            delete_option('atoms_flush_rewrite');
        }

        add_filter('show_admin_bar', static function ($show) {
            if ((string) get_query_var('atoms_app') === '1') {
                return false;
            }
            if (isset($_GET['page']) && is_string($_GET['page']) && str_starts_with($_GET['page'], 'atoms')) {
                return false;
            }
            return $show;
        });
    }
}
