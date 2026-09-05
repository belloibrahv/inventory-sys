<?php
declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

get_header();

if (!abutwins_location('archive')) {
    if (have_posts()) {
        echo '<header class="abutwins-archive-head"><h1>' . wp_kses_post(get_the_archive_title()) . '</h1></header>';
        while (have_posts()) {
            the_post();
            get_template_part('template-parts/content');
        }
        the_posts_pagination();
    } else {
        get_template_part('template-parts/content', 'none');
    }
}

get_footer();
