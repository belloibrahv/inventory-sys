<?php
declare(strict_types=1);

namespace Atoms\Admin;

final class Pwa
{
    public function register(): void
    {
        add_action('init', [$this, 'rewrites']);
        add_filter('query_vars', [$this, 'vars']);
        add_action('template_redirect', [$this, 'render'], 0);
        add_filter('redirect_canonical', [$this, 'skipCanonical'], 10, 2);
    }

    /**
     * @param string|false $redirect
     * @return string|false
     */
    public function skipCanonical($redirect, $requested = '')
    {
        if ((string) get_query_var('atoms_sw') === '1' || (string) get_query_var('atoms_manifest') === '1') {
            return false;
        }

        return $redirect;
    }

    public function rewrites(): void
    {
        add_rewrite_rule('^atoms-app/?$', 'index.php?atoms_app=1', 'top');
        add_rewrite_rule('^atoms-app/manifest\\.webmanifest$', 'index.php?atoms_manifest=1', 'top');
        add_rewrite_rule('^atoms-app/sw\\.js$', 'index.php?atoms_sw=1', 'top');
    }

    /**
     * @param list<string> $vars
     * @return list<string>
     */
    public function vars(array $vars): array
    {
        $vars[] = 'atoms_app';
        $vars[] = 'atoms_manifest';
        $vars[] = 'atoms_sw';

        return $vars;
    }

    public function render(): void
    {
        if ((string) get_query_var('atoms_manifest') === '1') {
            $this->manifest();
        }
        if ((string) get_query_var('atoms_sw') === '1') {
            $this->serviceWorker();
        }
        if ((string) get_query_var('atoms_app') === '1') {
            $this->app();
        }
    }

    private function app(): void
    {
        if (!is_user_logged_in()) {
            auth_redirect();
        }
        if (!current_user_can('atoms_access')) {
            wp_die(esc_html__('You do not have access to Abu Twins Invent.', 'atoms'));
        }
        nocache_headers();
        include ATOMS_PATH . 'templates/pwa-app.php';
        exit;
    }

    private function manifest(): void
    {
        nocache_headers();
        header('Content-Type: application/manifest+json; charset=utf-8');
        $brand = (new \Atoms\Domain\ShopIdentity())->of((new \Atoms\Services\SettingsService())->get());
        echo wp_json_encode([
            'name'             => $brand['company'],
            'short_name'       => $brand['wordmark'] !== '' ? $brand['wordmark'] : 'Abu Twins Softskills Investment',
            'description'      => $brand['company'] . ' inventory and operations',
            'start_url'        => home_url('/atoms-app/'),
            'scope'            => home_url('/atoms-app/'),
            'display'          => 'standalone',
            'background_color' => '#4E4FA0',
            'theme_color'      => '#4E4FA0',
            'icons'            => [
                [
                    'src'     => ATOMS_URL . 'assets/img/icon-192.png',
                    'sizes'   => '192x192',
                    'type'    => 'image/png',
                    'purpose' => 'any',
                ],
                [
                    'src'     => ATOMS_URL . 'assets/img/icon-512.png',
                    'sizes'   => '512x512',
                    'type'    => 'image/png',
                    'purpose' => 'any maskable',
                ],
                [
                    'src'     => ATOMS_URL . 'assets/img/abutwins-icon-512.png',
                    'sizes'   => '512x512',
                    'type'    => 'image/png',
                    'purpose' => 'any',
                ],
            ],
        ]);
        exit;
    }

    private function serviceWorker(): void
    {
        header('Content-Type: application/javascript; charset=utf-8');
        header('Service-Worker-Allowed: /atoms-app/');
        $css = ATOMS_URL . 'assets/css/atoms.css?ver=' . ATOMS_VERSION;
        $js  = ATOMS_URL . 'assets/js/atoms.js?ver=' . ATOMS_VERSION;
        $home = home_url('/atoms-app/');
        echo "const CACHE='atoms-" . ATOMS_VERSION . "';\n";
        echo 'const ASSETS=' . wp_json_encode([$home, $css, $js]) . ";\n";
        echo <<<'JS'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Never cache REST mutations/lookups in SW — outbox + atoms_cache own that.
  if (url.pathname.indexOf('/wp-json/') !== -1) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match(ASSETS[0])))
  );
});
self.addEventListener('sync', (e) => {
  if (e.tag !== 'atoms-flush') return;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((c) => c.postMessage({ type: 'atoms-flush' }));
    })
  );
});
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'atoms-flush') {
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((c) => c.postMessage({ type: 'atoms-flush' }));
    });
  }
});
JS;
        exit;
    }
}
