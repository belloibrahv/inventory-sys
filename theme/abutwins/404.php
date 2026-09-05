<?php
declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

get_header();

if (!abutwins_location('single')) {
    ?>
    <section class="abutwins-empty">
      <p class="abutwins-kicker"><?php esc_html_e('404', 'abutwins'); ?></p>
      <h1><?php esc_html_e('That page is not in the catalog.', 'abutwins'); ?></h1>
      <p><?php esc_html_e('Check the address, or go back to the storefront.', 'abutwins'); ?></p>
      <p><a class="abutwins-btn" href="<?php echo esc_url(home_url('/')); ?>"><?php esc_html_e('Back home', 'abutwins'); ?></a></p>
    </section>
    <?php
}

get_footer();
