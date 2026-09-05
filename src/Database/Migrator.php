<?php
declare(strict_types=1);

namespace Atoms\Database;

final class Migrator
{
    public function maybeMigrate(): void
    {
        $installed = get_option('atoms_db_version', '');
        if ($installed === Schema::version()) {
            return;
        }

        $this->migrate();
    }

    public function migrate(): void
    {
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        foreach (Schema::tables() as $sql) {
            dbDelta($sql);
        }

        $this->applyAlterMigrations();

        update_option('atoms_db_version', Schema::version());
        update_option('atoms_flush_rewrite', '1');
    }

    private function applyAlterMigrations(): void
    {
        global $wpdb;
        $saleItems = $wpdb->prefix . 'atoms_sale_items';
        $imeiCol = $wpdb->get_row("SHOW COLUMNS FROM {$saleItems} LIKE 'imei_id'", ARRAY_A);
        if (is_array($imeiCol) && strtoupper((string) ($imeiCol['Null'] ?? '')) === 'NO') {
            $wpdb->query("ALTER TABLE {$saleItems} MODIFY imei_id bigint(20) unsigned NULL");
        }

        $products = $wpdb->prefix . 'atoms_products';
        $variants = $wpdb->prefix . 'atoms_product_variants';
        $this->ensureColumn($products, 'current_selling_price', 'bigint(20) NOT NULL DEFAULT 0 AFTER min_selling_price');
        $this->ensureColumn($products, 'market_price', 'bigint(20) NOT NULL DEFAULT 0 AFTER current_selling_price');
        $this->ensureColumn($variants, 'current_selling_price', 'bigint(20) NULL AFTER min_selling_price');
        $this->ensureColumn($variants, 'market_price', 'bigint(20) NULL AFTER current_selling_price');

        // Backfill current selling price from floor when never set.
        $wpdb->query("UPDATE {$products} SET current_selling_price = min_selling_price WHERE current_selling_price = 0 AND min_selling_price > 0");
        $wpdb->query("UPDATE {$variants} SET current_selling_price = min_selling_price WHERE (current_selling_price IS NULL OR current_selling_price = 0) AND min_selling_price IS NOT NULL AND min_selling_price > 0");
    }

    private function ensureColumn(string $table, string $column, string $definition): void
    {
        global $wpdb;
        $exists = $wpdb->get_row("SHOW COLUMNS FROM {$table} LIKE '{$column}'", ARRAY_A);
        if (is_array($exists)) {
            return;
        }
        $wpdb->query("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
    }
}
