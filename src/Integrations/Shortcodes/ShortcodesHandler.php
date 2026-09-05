<?php
declare(strict_types=1);

namespace Atoms\Integrations\Shortcodes;

use Atoms\Domain\Money;
use Atoms\Services\PublicApiService;
use Atoms\Services\SettingsService;

final class ShortcodesHandler
{
    public function register(): void
    {
        add_shortcode('atoms_stock_lookup', [$this, 'stockLookup']);
        add_shortcode('atoms_warranty_check', [$this, 'warrantyCheck']);
        add_shortcode('atoms_trade_in_calculator', [$this, 'tradeInCalculator']);
        add_shortcode('atoms_branch_showcase', [$this, 'branchShowcase']);
        add_shortcode('atoms_pos_portal', [$this, 'posPortal']);
        // Public aliases without legacy product branding.
        add_shortcode('abutwins_stock_lookup', [$this, 'stockLookup']);
        add_shortcode('abutwins_warranty_check', [$this, 'warrantyCheck']);
        add_shortcode('abutwins_trade_in_calculator', [$this, 'tradeInCalculator']);
        add_shortcode('abutwins_branch_showcase', [$this, 'branchShowcase']);
        add_shortcode('abutwins_pos_portal', [$this, 'posPortal']);

        add_action('wp_enqueue_scripts', [$this, 'enqueueAssets']);
    }

    public function enqueueAssets(): void
    {
        wp_register_style(
            'atoms-google-fonts',
            'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;600&display=swap',
            [],
            null
        );
        wp_register_style(
            'atoms-material-symbols',
            'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200',
            [],
            null
        );
        wp_register_style(
            'atoms-frontend',
            ATOMS_URL . 'assets/css/atoms-frontend.css',
            ['atoms-google-fonts', 'atoms-material-symbols'],
            ATOMS_VERSION
        );

        wp_register_script(
            'atoms-frontend',
            ATOMS_URL . 'assets/js/atoms-frontend.js',
            [],
            ATOMS_VERSION,
            true
        );

        wp_localize_script('atoms-frontend', 'ABUTWINS_FRONTEND', [
            'root'     => esc_url_raw(rest_url('atoms/v1/public/')),
            'nonce'    => wp_create_nonce('wp_rest'),
            'settings' => (new SettingsService())->expose(),
            'product'  => 'Abu Twins Invent',
        ]);
        wp_localize_script('atoms-frontend', 'ATOMS_FRONTEND', [
            'root'     => esc_url_raw(rest_url('atoms/v1/public/')),
            'nonce'    => wp_create_nonce('wp_rest'),
            'settings' => (new SettingsService())->expose(),
            'product'  => 'Abu Twins Invent',
        ]);
    }

    private function ensureAssets(): void
    {
        wp_enqueue_style('atoms-frontend');
        wp_enqueue_script('atoms-frontend');
    }

    /**
     * [atoms_stock_lookup branch="" brand="" show_price="yes"]
     *
     * @param array<string, mixed>|string $atts
     */
    public function stockLookup($atts = []): string
    {
        $this->ensureAssets();
        $a = shortcode_atts([
            'title'       => 'Search Available Devices & Stock',
            'subtitle'    => 'Real-time inventory lookup across our retail branches',
            'branch'      => '',
            'brand'       => '',
            'show_price'  => 'yes',
            'cta_text'    => 'Inquire on WhatsApp',
            'theme'       => 'light',
        ], (array) $atts, 'atoms_stock_lookup');

        $branchesData = (new PublicApiService())->branches();
        $branches = $branchesData['items'] ?? [];

        $branchOpts = '<option value="">All Store Branches</option>';
        foreach ($branches as $b) {
            $branchOpts .= sprintf(
                '<option value="%d">%s</option>',
                (int) $b['id'],
                esc_html($b['name'])
            );
        }

        return '
        <div class="atoms-fe-widget atoms-stock-lookup" data-theme="' . esc_attr($a['theme']) . '">
            <div class="atoms-fe-header">
                <div class="atoms-fe-badge"><span class="material-symbols-outlined">inventory_2</span> Live Stock Checker</div>
                <h3 class="atoms-fe-title">' . esc_html($a['title']) . '</h3>
                <p class="atoms-fe-sub">' . esc_html($a['subtitle']) . '</p>
            </div>
            <form class="atoms-fe-search-bar js-stock-form">
                <div class="atoms-fe-input-wrap">
                    <span class="material-symbols-outlined atoms-fe-icon">search</span>
                    <input type="text" class="atoms-fe-input js-stock-query" placeholder="Search iPhone, Samsung, MacBook, Storage…" />
                </div>
                <div class="atoms-fe-select-wrap">
                    <select class="atoms-fe-select js-stock-branch">' . $branchOpts . '</select>
                </div>
                <button type="submit" class="atoms-fe-btn primary">
                    <span class="material-symbols-outlined">search</span> Check Availability
                </button>
            </form>
            <div class="atoms-fe-results js-stock-results" data-show-price="' . esc_attr($a['show_price']) . '" data-cta="' . esc_attr($a['cta_text']) . '">
                <div class="atoms-fe-loading-state" style="display:none;">
                    <div class="atoms-fe-spinner"></div> Searching real-time inventory…
                </div>
                <div class="atoms-fe-catalog-grid js-stock-grid"></div>
            </div>
        </div>';
    }

    /**
     * [atoms_warranty_check]
     *
     * @param array<string, mixed>|string $atts
     */
    public function warrantyCheck($atts = []): string
    {
        $this->ensureAssets();
        $a = shortcode_atts([
            'title'    => 'Official IMEI & Warranty Verification',
            'subtitle' => 'Enter your 15-digit IMEI or Serial Number to check warranty status and device authenticity',
            'theme'    => 'light',
        ], (array) $atts, 'atoms_warranty_check');

        return '
        <div class="atoms-fe-widget atoms-warranty-widget" data-theme="' . esc_attr($a['theme']) . '">
            <div class="atoms-fe-header">
                <div class="atoms-fe-badge"><span class="material-symbols-outlined">verified_user</span> Official Verification</div>
                <h3 class="atoms-fe-title">' . esc_html($a['title']) . '</h3>
                <p class="atoms-fe-sub">' . esc_html($a['subtitle']) . '</p>
            </div>
            <form class="atoms-fe-search-bar js-warranty-form">
                <div class="atoms-fe-input-wrap">
                    <span class="material-symbols-outlined atoms-fe-icon">smartphone</span>
                    <input type="text" class="atoms-fe-input js-warranty-imei" maxlength="18" placeholder="Enter 15-digit IMEI (e.g. 352094081234567)" required />
                </div>
                <button type="submit" class="atoms-fe-btn primary">
                    <span class="material-symbols-outlined">shield</span> Check Status
                </button>
            </form>
            <div class="atoms-fe-warranty-result js-warranty-result" style="display:none;"></div>
            <div class="atoms-fe-help-text">
                <span class="material-symbols-outlined">info</span>
                <span>Dial <strong>*#06#</strong> on your phone to find your IMEI number.</span>
            </div>
        </div>';
    }

    /**
     * [atoms_trade_in_calculator]
     *
     * @param array<string, mixed>|string $atts
     */
    public function tradeInCalculator($atts = []): string
    {
        $this->ensureAssets();
        $a = shortcode_atts([
            'title'    => 'Device Trade-In / Swap Value Calculator',
            'subtitle' => 'Get an instant valuation estimate for your phone and upgrade in store today',
            'theme'    => 'light',
        ], (array) $atts, 'atoms_trade_in_calculator');

        return '
        <div class="atoms-fe-widget atoms-swap-widget" data-theme="' . esc_attr($a['theme']) . '">
            <div class="atoms-fe-header">
                <div class="atoms-fe-badge"><span class="material-symbols-outlined">swap_horiz</span> Instant Trade-In Valuation</div>
                <h3 class="atoms-fe-title">' . esc_html($a['title']) . '</h3>
                <p class="atoms-fe-sub">' . esc_html($a['subtitle']) . '</p>
            </div>
            <form class="atoms-fe-swap-form js-swap-form">
                <div class="atoms-fe-grid-2">
                    <div class="atoms-fe-field">
                        <label class="atoms-fe-label">Brand</label>
                        <select class="atoms-fe-select js-swap-brand" required>
                            <option value="Apple">Apple iPhone</option>
                            <option value="Samsung">Samsung Galaxy</option>
                            <option value="Google">Google Pixel</option>
                            <option value="Xiaomi">Xiaomi / Redmi</option>
                            <option value="Other">Other Brand</option>
                        </select>
                    </div>
                    <div class="atoms-fe-field">
                        <label class="atoms-fe-label">Model</label>
                        <input type="text" class="atoms-fe-input js-swap-model" placeholder="e.g. iPhone 14 Pro Max / S23 Ultra" required />
                    </div>
                </div>
                <div class="atoms-fe-grid-2">
                    <div class="atoms-fe-field">
                        <label class="atoms-fe-label">Storage Capacity</label>
                        <select class="atoms-fe-select js-swap-storage">
                            <option value="64GB">64 GB</option>
                            <option value="128GB" selected>128 GB</option>
                            <option value="256GB">256 GB</option>
                            <option value="512GB">512 GB</option>
                            <option value="1TB">1 TB</option>
                        </select>
                    </div>
                    <div class="atoms-fe-field">
                        <label class="atoms-fe-label">Physical & Functional Condition</label>
                        <select class="atoms-fe-select js-swap-condition">
                            <option value="pristine">Pristine / Flawless (No scratches, 90%+ battery)</option>
                            <option value="good" selected>Good Condition (Minor normal use, 80%+ battery)</option>
                            <option value="fair">Fair / Used (Visible scratches, worn battery)</option>
                            <option value="broken">Cracked / Faulty (Cracked glass or defective parts)</option>
                        </select>
                    </div>
                </div>
                <div class="atoms-fe-checkboxes">
                    <label class="atoms-fe-checkbox"><input type="checkbox" class="js-swap-box"> Original Box Included</label>
                    <label class="atoms-fe-checkbox"><input type="checkbox" class="js-swap-charger"> Original Charger Included</label>
                </div>
                <button type="submit" class="atoms-fe-btn primary" style="width:100%;">
                    <span class="material-symbols-outlined">calculate</span> Calculate Estimated Trade-In Value
                </button>
            </form>
            <div class="atoms-fe-swap-result js-swap-result" style="display:none;"></div>
        </div>';
    }

    /**
     * [atoms_branch_showcase]
     *
     * @param array<string, mixed>|string $atts
     */
    public function branchShowcase($atts = []): string
    {
        $this->ensureAssets();
        $a = shortcode_atts([
            'title'    => 'Our Retail Store Locations',
            'subtitle' => 'Visit any of our walk-in retail stores or chat with our branch representatives',
            'columns'  => '3',
            'theme'    => 'light',
        ], (array) $atts, 'atoms_branch_showcase');

        $branchesData = (new PublicApiService())->branches();
        $branches = $branchesData['items'] ?? [];

        $cards = '';
        foreach ($branches as $b) {
            $waBtn = !empty($b['whatsapp'])
                ? '<a href="' . esc_url($b['whatsapp']) . '" target="_blank" rel="noopener" class="atoms-fe-btn accent sm"><span class="material-symbols-outlined">chat</span> Chat on WhatsApp</a>'
                : '';

            $cards .= '
            <div class="atoms-fe-branch-card">
                <div class="atoms-fe-branch-header">
                    <span class="material-symbols-outlined atoms-fe-branch-icon">storefront</span>
                    <div>
                        <h4 class="atoms-fe-branch-name">' . esc_html($b['name']) . '</h4>
                        <span class="atoms-fe-branch-badge"><span class="atoms-fe-dot"></span> Open Today</span>
                    </div>
                </div>
                <div class="atoms-fe-branch-body">
                    <p class="atoms-fe-branch-detail"><span class="material-symbols-outlined">location_on</span> ' . esc_html($b['address']) . '</p>
                    <p class="atoms-fe-branch-detail"><span class="material-symbols-outlined">call</span> ' . esc_html($b['phone']) . '</p>
                </div>
                <div class="atoms-fe-branch-actions">
                    ' . $waBtn . '
                </div>
            </div>';
        }

        return '
        <div class="atoms-fe-widget atoms-branch-showcase" data-theme="' . esc_attr($a['theme']) . '">
            <div class="atoms-fe-header">
                <div class="atoms-fe-badge"><span class="material-symbols-outlined">pin_drop</span> Store Network</div>
                <h3 class="atoms-fe-title">' . esc_html($a['title']) . '</h3>
                <p class="atoms-fe-sub">' . esc_html($a['subtitle']) . '</p>
            </div>
            <div class="atoms-fe-branches-grid cols-' . esc_attr($a['columns']) . '">
                ' . $cards . '
            </div>
        </div>';
    }

    /**
     * [atoms_pos_portal]
     *
     * @param array<string, mixed>|string $atts
     */
    public function posPortal($atts = []): string
    {
        if (!current_user_can('atoms_access')) {
            return '<div class="atoms-fe-alert warn">Please log in with an authorized staff account to access the operations portal.</div>';
        }

        $appUrl = admin_url('admin.php?page=atoms');
        return '
        <div class="atoms-fe-portal-container" style="min-height: 800px; width:100%; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 10px 25px rgba(0,0,0,0.08);">
            <iframe src="' . esc_url($appUrl) . '" style="width:100%; height:900px; border:none;" title="Staff portal"></iframe>
        </div>';
    }
}
