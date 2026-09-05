<?php
declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

get_header();

if (!abutwins_location('single')) {
    if (have_posts()) {
        while (have_posts()) {
            the_post();
            get_template_part('template-parts/content', get_post_type());
        }
    } else {
        get_template_part('template-parts/content', 'none');
    }
}

get_footer();
