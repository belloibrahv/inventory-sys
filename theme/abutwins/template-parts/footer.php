<?php
declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

$shop = abutwins_shop_identity();
?>
<footer class="abutwins-footer" role="contentinfo">
  <div class="abutwins-shell abutwins-footer-inner">
    <div>
      <strong><?php echo esc_html($shop['company']); ?></strong>
      <?php if ($shop['tagline'] !== '') : ?>
        <p><?php echo esc_html($shop['tagline']); ?></p>
      <?php endif; ?>
    </div>
    <nav aria-label="<?php esc_attr_e('Footer', 'abutwins'); ?>">
      <?php
      wp_nav_menu([
          'theme_location' => 'footer',
          'container'      => false,
          'fallback_cb'    => '__return_empty_string',
      ]);
      ?>
    </nav>
    <?php if (is_active_sidebar('footer-1')) : ?>
      <div class="abutwins-footer-widgets"><?php dynamic_sidebar('footer-1'); ?></div>
    <?php endif; ?>
  </div>
  <p class="abutwins-legal"><?php echo esc_html(sprintf(__('© %s %s', 'abutwins'), gmdate('Y'), $shop['company'])); ?></p>
</footer>
