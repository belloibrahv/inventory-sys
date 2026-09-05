<?php
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
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="abutwins-skip-link screen-reader-text" href="#content"><?php esc_html_e('Skip to content', 'abutwins'); ?></a>
<?php if (!abutwins_location('header')) : ?>
  <?php get_template_part('template-parts/header'); ?>
<?php endif; ?>
<main id="content" class="abutwins-main" tabindex="-1">
