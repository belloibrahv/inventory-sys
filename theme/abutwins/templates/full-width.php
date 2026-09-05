<?php
/**
 * Template Name: Full width
 * Template Post Type: page, post
 *
 * Theme header and footer with a full-bleed content column for Elementor.
 *
 * @package Abutwins
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

get_header();
while (have_posts()) {
    the_post();
    echo '<article class="abutwins-full">';
    the_content();
    echo '</article>';
}
get_footer();
