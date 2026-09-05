<?php
declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

get_header();

if (!abutwins_location('search')) {
    echo '<header class="abutwins-archive-head"><h1>' . esc_html(sprintf(__('Search: %s', 'abutwins'), get_search_query())) . '</h1></header>';
    if (have_posts()) {
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
