<?php
declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}
?>
<article <?php post_class('abutwins-article'); ?>>
  <?php if (!is_front_page()) : ?>
    <header class="abutwins-article-head">
      <?php the_title('<h1>', '</h1>'); ?>
    </header>
  <?php endif; ?>
  <div class="abutwins-prose">
    <?php the_content(); ?>
  </div>
</article>
