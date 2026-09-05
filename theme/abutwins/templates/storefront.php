<?php
/**
 * Template Name: Storefront
 *
 * Brand-first public layout using inventory shortcodes until rebuilt in Elementor.
 *
 * @package Abutwins
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

$shop = abutwins_shop_identity();
$logo = abutwins_logo_url();
$company = $shop['company'] !== '' ? $shop['company'] : __('Abu Twins Softskills Investment', 'abutwins');

get_header();
?>
<article class="abutwins-storefront">
  <section class="abutwins-hero" aria-label="<?php echo esc_attr($company); ?>">
    <div class="abutwins-shell abutwins-hero-inner">
      <div class="abutwins-hero-copy">
        <p class="abutwins-hero-brand">
          <span><?php esc_html_e('Abu Twins', 'abutwins'); ?></span>
          <?php echo esc_html($company); ?>
        </p>
        <h1><?php esc_html_e('Phones, accessories, and honest after-sales — live from inventory.', 'abutwins'); ?></h1>
        <p class="abutwins-hero-lead"><?php esc_html_e('Search stock, check warranty, and find a branch. Staff operations stay in Invent; this page is the public storefront.', 'abutwins'); ?></p>
        <div class="abutwins-hero-actions">
          <a class="abutwins-btn" href="#abutwins-tools"><?php esc_html_e('Check stock', 'abutwins'); ?></a>
          <a class="abutwins-btn abutwins-btn-ghost" href="#abutwins-tools"><?php esc_html_e('Warranty lookup', 'abutwins'); ?></a>
        </div>
      </div>
      <?php if ($logo !== '') : ?>
        <div class="abutwins-hero-mark" aria-hidden="true">
          <img src="<?php echo esc_url($logo); ?>" alt="" width="280" height="280" decoding="async">
        </div>
      <?php endif; ?>
    </div>
  </section>

  <section class="abutwins-tools" id="abutwins-tools">
    <div class="abutwins-shell">
      <div class="abutwins-tools-head">
        <h2><?php esc_html_e('Store tools', 'abutwins'); ?></h2>
        <p><?php esc_html_e('Live lookups powered by Abu Twins Invent — stock, warranty, trade-in, and branches.', 'abutwins'); ?></p>
      </div>
      <div class="abutwins-storefront-widgets">
        <?php if (abutwins_plugin_active()) : ?>
          <?php echo do_shortcode('[abutwins_stock_lookup theme="brand"]'); ?>
          <?php echo do_shortcode('[abutwins_warranty_check theme="light"]'); ?>
          <?php echo do_shortcode('[abutwins_trade_in_calculator theme="light"]'); ?>
          <?php echo do_shortcode('[abutwins_branch_showcase theme="light"]'); ?>
        <?php else : ?>
          <p><?php esc_html_e('Activate the Abu Twins Invent plugin to show live stock, warranty, trade-in, and branch widgets.', 'abutwins'); ?></p>
        <?php endif; ?>
      </div>
    </div>
  </section>
</article>
<?php
get_footer();
