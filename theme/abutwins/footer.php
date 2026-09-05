<?php
declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}
?>
</main>
<?php if (!abutwins_location('footer')) : ?>
  <?php get_template_part('template-parts/footer'); ?>
<?php endif; ?>
<?php wp_footer(); ?>
</body>
</html>
