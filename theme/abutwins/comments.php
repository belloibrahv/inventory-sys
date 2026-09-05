<?php
/**
 * The template for displaying comments.
 *
 * @package Abutwins
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

if (post_password_required()) {
    return;
}
?>
<div id="comments" class="abutwins-comments">
  <?php if (have_comments()) : ?>
    <h2 class="abutwins-comments-title">
      <?php
      $count = (int) get_comments_number();
      echo esc_html(sprintf(
          _n('%s comment', '%s comments', $count, 'abutwins'),
          number_format_i18n($count)
      ));
      ?>
    </h2>
    <ol class="abutwins-comment-list">
      <?php
      wp_list_comments([
          'style'      => 'ol',
          'short_ping' => true,
      ]);
      ?>
    </ol>
    <?php the_comments_navigation(); ?>
  <?php endif; ?>

  <?php if (!comments_open() && get_comments_number() && post_type_supports(get_post_type(), 'comments')) : ?>
    <p class="abutwins-no-comments"><?php esc_html_e('Comments are closed.', 'abutwins'); ?></p>
  <?php endif; ?>

  <?php comment_form(); ?>
</div>
