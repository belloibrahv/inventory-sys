<?php
declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

$shop = abutwins_shop_identity();
$logo = abutwins_logo_url();
?>
<header class="abutwins-header" role="banner">
  <div class="abutwins-shell abutwins-header-inner">
    <a class="abutwins-logo" href="<?php echo esc_url(home_url('/')); ?>">
      <?php if ($logo !== '') : ?>
        <img src="<?php echo esc_url($logo); ?>" alt="" width="48" height="48">
      <?php endif; ?>
      <span class="abutwins-logo-word"><?php echo esc_html($shop['company'] !== '' ? $shop['company'] : 'Abu Twins'); ?></span>
    </a>
    <nav class="abutwins-nav" aria-label="<?php esc_attr_e('Primary', 'abutwins'); ?>">
      <?php
      wp_nav_menu([
          'theme_location' => 'primary',
          'container'      => false,
          'fallback_cb'    => 'abutwins_fallback_menu',
      ]);
      ?>
    </nav>
  </div>
</header>

