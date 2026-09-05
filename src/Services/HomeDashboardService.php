<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\HomeDashboardPolicy;

final class HomeDashboardService
{
    private const META = 'atoms_home_prefs';

    public function __construct(private readonly HomeDashboardPolicy $policy = new HomeDashboardPolicy())
    {
    }

    /**
     * @param array<int, string> $roles
     * @param array<string, mixed> $settings
     * @return array<string, mixed>
     */
    public function forUser(int $userId, array $roles, array $settings): array
    {
        $persona     = $this->policy->resolvePersona($roles);
        $manifest    = $this->policy->manifest(is_array($settings['home_kpis'] ?? null) ? $settings['home_kpis'] : null);
        $storeKpis   = $manifest['layout'][$persona] ?? $manifest['defaults'][$persona] ?? [];
        $storeTrends = ($settings['home_show_trends'] ?? true) !== false;
        $prefs       = $this->getPrefs($userId);
        $hasKpiOverride = is_array($prefs['kpis'] ?? null) && $prefs['kpis'] !== [];
        $hasOverride    = $hasKpiOverride
            || (array_key_exists('show_trends', $prefs) && $prefs['show_trends'] !== null
                && (bool) $prefs['show_trends'] !== $storeTrends);

        $effectiveKpis = $hasKpiOverride
            ? $this->policy->normalize([$persona => $prefs['kpis']])[$persona]
            : $storeKpis;

        $showTrends = array_key_exists('show_trends', $prefs) && $prefs['show_trends'] !== null
            ? (bool) $prefs['show_trends']
            : $storeTrends;

        $queueTab = (string) ($prefs['queue_tab'] ?? '');
        if (!in_array($queueTab, ['sales', 'money', 'stock', 'ops'], true)) {
            $queueTab = null;
        }

        return [
            'persona'           => $persona,
            'persona_label'     => $this->policy->personaLabel($persona),
            'effective_kpis'    => $effectiveKpis,
            'store_kpis'        => $storeKpis,
            'show_trends'       => $showTrends,
            'store_show_trends' => $storeTrends,
            'has_override'      => $hasOverride,
            'has_kpi_override'  => $hasKpiOverride,
            'queue_tab'         => $queueTab,
            'widgets'           => $manifest['widgets'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function forCurrentUser(): array
    {
        $user = wp_get_current_user();
        if (!$user || !$user->ID) {
            return [];
        }

        return $this->forUser((int) $user->ID, (array) $user->roles, (new SettingsService())->expose());
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function save(int $userId, array $data): array
    {
        $user = get_userdata($userId);
        if (!$user) {
            return [];
        }

        $prefs   = $this->getPrefs($userId);
        $persona = $this->policy->resolvePersona((array) $user->roles);

        if (array_key_exists('kpis', $data)) {
            if ($data['kpis'] === null || $data['kpis'] === []) {
                unset($prefs['kpis']);
            } elseif (is_array($data['kpis'])) {
                $prefs['kpis'] = $this->policy->normalize([$persona => $data['kpis']])[$persona];
            }
        }

        if (array_key_exists('show_trends', $data)) {
            if ($data['show_trends'] === null) {
                unset($prefs['show_trends']);
            } else {
                $prefs['show_trends'] = !empty($data['show_trends']);
            }
        }

        if (array_key_exists('queue_tab', $data)) {
            $tab = sanitize_key((string) $data['queue_tab']);
            if (in_array($tab, ['sales', 'money', 'stock', 'ops'], true)) {
                $prefs['queue_tab'] = $tab;
            }
        }

        $this->writePrefs($userId, $prefs);

        return $this->forUser($userId, (array) $user->roles, (new SettingsService())->expose());
    }

    /**
     * @return array<string, mixed>
     */
    public function reset(int $userId): array
    {
        delete_user_meta($userId, self::META);
        $user = get_userdata($userId);
        if (!$user) {
            return [];
        }

        return $this->forUser($userId, (array) $user->roles, (new SettingsService())->expose());
    }

    /**
     * @return array<string, mixed>
     */
    private function getPrefs(int $userId): array
    {
        $raw = get_user_meta($userId, self::META, true);

        return is_array($raw) ? $raw : [];
    }

    /**
     * @param array<string, mixed> $prefs
     */
    private function writePrefs(int $userId, array $prefs): void
    {
        if ($prefs === []) {
            delete_user_meta($userId, self::META);

            return;
        }
        update_user_meta($userId, self::META, $prefs);
    }
}
