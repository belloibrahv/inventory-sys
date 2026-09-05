<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\AutomationRules;
use Atoms\Domain\HomeDashboardPolicy;
use Atoms\Domain\SecretBox;
use Atoms\Domain\WarrantyPolicy;

final class SettingsService
{
    public const OPTION = 'atoms_ops';

    public function __construct(private readonly ?SecretBox $secrets = null)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function get(): array
    {
        $saved = get_option(self::OPTION, []);
        if (!is_array($saved)) {
            $saved = [];
        }
        if (isset($saved['whatsapp_token']) && is_string($saved['whatsapp_token']) && $saved['whatsapp_token'] !== '') {
            $saved['whatsapp_token'] = $this->box()->open($saved['whatsapp_token']);
        }

        $merged = array_merge([
            'company'             => get_option('atoms_company_name', 'Abu Twins Softskills Investment'),
            'wordmark'            => '',
            'wordmark_accent'     => '',
            'tagline'             => '',
            'whatsapp_phone'      => '',
            'whatsapp_token'      => '',
            'whatsapp_enabled'    => false,
            'expense_threshold'   => 50000,
            'price_reduction_approval_pct' => 10,
            'low_stock_notify'    => true,
            'automation_enabled'  => true,
            'digest_enabled'      => true,
            'debt_days'           => 7,
            'repair_days'         => 3,
            'transfer_hours'      => 24,
            'return_days'         => 2,
            'warranty_days'       => 365,
            'google_maps_key'     => '',
            'pwa_url'             => home_url('/atoms-app/'),
            'home_kpis'           => (new HomeDashboardPolicy())->defaults(),
            'home_show_trends'    => true,
        ], $saved);
        $merged['last_run'] = get_option(AutomationService::LAST_OPTION, null);
        $merged['pwa_url']  = home_url('/atoms-app/');

        return $merged;
    }

    /**
     * Settings safe to send to the browser. The WhatsApp token never leaves the server.
     *
     * @return array<string, mixed>
     */
    public function expose(): array
    {
        $row = $this->get();
        $set = trim((string) ($row['whatsapp_token'] ?? '')) !== '';
        unset($row['whatsapp_token']);
        $row['whatsapp_token_set'] = $set;
        $row['home_dashboard']     = (new HomeDashboardPolicy())->manifest(is_array($row['home_kpis'] ?? null) ? $row['home_kpis'] : null);

        return $row;
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function save(array $data): array
    {
        $current = $this->get();
        $rules   = new AutomationRules();
        $cover   = new WarrantyPolicy();
        $home    = new HomeDashboardPolicy();
        $next    = [
            'company'             => sanitize_text_field((string) ($data['company'] ?? $current['company'])),
            'wordmark'            => sanitize_text_field((string) ($data['wordmark'] ?? $current['wordmark'])),
            'wordmark_accent'     => sanitize_text_field((string) ($data['wordmark_accent'] ?? $current['wordmark_accent'])),
            'tagline'             => sanitize_text_field((string) ($data['tagline'] ?? $current['tagline'])),
            'whatsapp_phone'      => sanitize_text_field((string) ($data['whatsapp_phone'] ?? $current['whatsapp_phone'])),
            'whatsapp_token'      => $this->sealToken($data, (string) ($current['whatsapp_token'] ?? '')),
            'whatsapp_enabled'    => !empty($data['whatsapp_enabled']),
            'expense_threshold'   => (float) ($data['expense_threshold'] ?? $current['expense_threshold']),
            'price_reduction_approval_pct' => (new \Atoms\Domain\PricingPolicy())->clampReductionPct(
                (float) ($data['price_reduction_approval_pct'] ?? $current['price_reduction_approval_pct'] ?? 10)
            ),
            'low_stock_notify'    => !isset($data['low_stock_notify']) || !empty($data['low_stock_notify']),
            'automation_enabled'  => !isset($data['automation_enabled']) || !empty($data['automation_enabled']),
            'digest_enabled'      => !isset($data['digest_enabled']) || !empty($data['digest_enabled']),
            'debt_days'           => $rules->clampDays((int) ($data['debt_days'] ?? $current['debt_days'] ?? 7)),
            'repair_days'         => $rules->clampDays((int) ($data['repair_days'] ?? $current['repair_days'] ?? 3)),
            'transfer_hours'      => $rules->clampHours((int) ($data['transfer_hours'] ?? $current['transfer_hours'] ?? 24)),
            'return_days'         => $rules->clampDays((int) ($data['return_days'] ?? $current['return_days'] ?? 2)),
            'warranty_days'       => $cover->clampDays((int) ($data['warranty_days'] ?? $current['warranty_days'] ?? 365)),
            'google_maps_key'     => sanitize_text_field((string) ($data['google_maps_key'] ?? $current['google_maps_key'] ?? '')),
            'pwa_url'             => home_url('/atoms-app/'),
            'home_kpis'           => $home->normalize(is_array($data['home_kpis'] ?? null) ? $data['home_kpis'] : ($current['home_kpis'] ?? null)),
            'home_show_trends'    => !isset($data['home_show_trends']) || !empty($data['home_show_trends']),
        ];
        update_option(self::OPTION, $next);
        update_option('atoms_company_name', $next['company']);
        update_option('atoms_expense_approval_threshold', $next['expense_threshold']);

        return $this->expose();
    }

    /**
     * @param array<string, mixed> $data
     */
    private function sealToken(array $data, string $currentPlain): string
    {
        if (!empty($data['whatsapp_token_clear'])) {
            return '';
        }
        $incoming = trim(sanitize_text_field((string) ($data['whatsapp_token'] ?? '')));
        if ($incoming === '' || $incoming === '********') {
            return $this->box()->seal($currentPlain);
        }

        return $this->box()->seal($incoming);
    }

    private function box(): SecretBox
    {
        return $this->secrets ?? SecretBox::fromWordPress();
    }
}
