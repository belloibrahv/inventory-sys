<?php
/**
 * Template Name: Elementor Canvas
 * Template Post Type: page, post
 *
 * Blank canvas — Elementor owns the entire viewport (no theme header/footer).
 *
 * @package Abutwins
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
  <meta charset="<?php bloginfo('charset'); ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <?php wp_head(); ?>
</head>
<body <?php body_class('abutwins-canvas'); ?>>
<?php wp_body_open(); ?>
<?php
while (have_posts()) {
    the_post();
    the_content();
}
?>
<?php wp_footer(); ?>
</body>
</html>
