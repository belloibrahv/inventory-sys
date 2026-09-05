<?php
declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

get_header();

if (!abutwins_location('single')) {
    while (have_posts()) {
        the_post();
        get_template_part('template-parts/content', 'page');
    }
}

get_footer();
