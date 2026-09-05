<?php
declare(strict_types=1);

namespace Atoms\Database;

final class Schema
{
    public static function version(): string
    {
        return ATOMS_DB_VERSION;
    }

    /**
     * @return array<string, string>
     */
    public static function tables(): array
    {
        global $wpdb;
        $c   = $wpdb->get_charset_collate();
        $p   = $wpdb->prefix . 'atoms_';

        return [
            'branches' => "CREATE TABLE {$p}branches (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                name varchar(191) NOT NULL,
                code varchar(32) NOT NULL,
                address text NULL,
                phone varchar(64) NULL,
                is_active tinyint(1) NOT NULL DEFAULT 1,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY code (code)
            ) $c;",

            'user_branches' => "CREATE TABLE {$p}user_branches (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                user_id bigint(20) unsigned NOT NULL,
                branch_id bigint(20) unsigned NOT NULL,
                is_default tinyint(1) NOT NULL DEFAULT 0,
                PRIMARY KEY  (id),
                UNIQUE KEY user_branch (user_id, branch_id),
                KEY branch_id (branch_id)
            ) $c;",

            'suppliers' => "CREATE TABLE {$p}suppliers (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                name varchar(191) NOT NULL,
                contact_person varchar(191) NULL,
                phone varchar(64) NULL,
                email varchar(191) NULL,
                address text NULL,
                notes text NULL,
                is_active tinyint(1) NOT NULL DEFAULT 1,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY name (name)
            ) $c;",

            'customers' => "CREATE TABLE {$p}customers (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                name varchar(191) NOT NULL,
                phone varchar(64) NOT NULL,
                email varchar(191) NULL,
                address text NULL,
                branch_id bigint(20) unsigned NULL,
                notes text NULL,
                is_walk_in tinyint(1) NOT NULL DEFAULT 0,
                is_active tinyint(1) NOT NULL DEFAULT 1,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY phone (phone),
                KEY name (name)
            ) $c;",

            'products' => "CREATE TABLE {$p}products (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                sku varchar(64) NOT NULL,
                name varchar(191) NOT NULL,
                brand varchar(191) NULL,
                category varchar(191) NULL,
                description text NULL,
                is_serialized tinyint(1) NOT NULL DEFAULT 1,
                track_mode varchar(16) NOT NULL DEFAULT 'imei',
                min_selling_price bigint(20) NOT NULL DEFAULT 0,
                current_selling_price bigint(20) NOT NULL DEFAULT 0,
                market_price bigint(20) NOT NULL DEFAULT 0,
                default_cost_price bigint(20) NOT NULL DEFAULT 0,
                low_stock_threshold int(11) NOT NULL DEFAULT 2,
                warranty_days int(11) NOT NULL DEFAULT 365,
                is_active tinyint(1) NOT NULL DEFAULT 1,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY sku (sku),
                KEY name (name),
                KEY brand (brand)
            ) $c;",

            'product_variants' => "CREATE TABLE {$p}product_variants (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                product_id bigint(20) unsigned NOT NULL,
                sku varchar(64) NULL,
                variant_name varchar(191) NULL,
                color varchar(64) NULL,
                storage varchar(64) NULL,
                min_selling_price bigint(20) NULL,
                current_selling_price bigint(20) NULL,
                market_price bigint(20) NULL,
                cost_price bigint(20) NULL,
                is_active tinyint(1) NOT NULL DEFAULT 1,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY product_id (product_id)
            ) $c;",

            'imeis' => "CREATE TABLE {$p}imeis (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                imei varchar(64) NOT NULL,
                serial_number varchar(64) NULL,
                product_id bigint(20) unsigned NOT NULL,
                variant_id bigint(20) unsigned NULL,
                branch_id bigint(20) unsigned NOT NULL,
                status varchar(32) NOT NULL DEFAULT 'available',
                source_type varchar(32) NOT NULL,
                source_id bigint(20) unsigned NULL,
                cost_price bigint(20) NOT NULL DEFAULT 0,
                condition_grade varchar(32) NULL,
                notes text NULL,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY imei (imei),
                KEY serial_number (serial_number),
                KEY product_id (product_id),
                KEY branch_status (branch_id, status),
                KEY status (status)
            ) $c;",

            'imei_events' => "CREATE TABLE {$p}imei_events (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                imei_id bigint(20) unsigned NOT NULL,
                event_type varchar(64) NOT NULL,
                from_status varchar(32) NULL,
                to_status varchar(32) NOT NULL,
                from_branch_id bigint(20) unsigned NULL,
                to_branch_id bigint(20) unsigned NULL,
                reference_type varchar(64) NULL,
                reference_id bigint(20) unsigned NULL,
                user_id bigint(20) unsigned NULL,
                notes text NULL,
                created_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY imei_id (imei_id),
                KEY created_at (created_at),
                KEY reference (reference_type, reference_id)
            ) $c;",

            'purchases' => "CREATE TABLE {$p}purchases (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                supplier_id bigint(20) unsigned NOT NULL,
                branch_id bigint(20) unsigned NOT NULL,
                invoice_number varchar(64) NOT NULL,
                purchase_date date NOT NULL,
                expected_arrival date NULL,
                status varchar(32) NOT NULL DEFAULT 'draft',
                notes text NULL,
                created_by bigint(20) unsigned NOT NULL,
                posted_at datetime NULL,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY invoice_number (invoice_number),
                KEY supplier_id (supplier_id),
                KEY branch_id (branch_id),
                KEY status (status)
            ) $c;",

            'purchase_items' => "CREATE TABLE {$p}purchase_items (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                purchase_id bigint(20) unsigned NOT NULL,
                product_id bigint(20) unsigned NOT NULL,
                variant_id bigint(20) unsigned NULL,
                cost_price bigint(20) NOT NULL,
                quantity int(11) NOT NULL,
                received_qty int(11) NOT NULL DEFAULT 0,
                PRIMARY KEY  (id),
                KEY purchase_id (purchase_id)
            ) $c;",

            'sales' => "CREATE TABLE {$p}sales (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                invoice_number varchar(64) NOT NULL,
                customer_id bigint(20) unsigned NULL,
                branch_id bigint(20) unsigned NOT NULL,
                salesperson_id bigint(20) unsigned NOT NULL,
                sale_type varchar(32) NOT NULL DEFAULT 'retail',
                subtotal bigint(20) NOT NULL DEFAULT 0,
                discount bigint(20) NOT NULL DEFAULT 0,
                total bigint(20) NOT NULL DEFAULT 0,
                paid_amount bigint(20) NOT NULL DEFAULT 0,
                due_amount bigint(20) NOT NULL DEFAULT 0,
                payment_method varchar(32) NULL,
                status varchar(32) NOT NULL DEFAULT 'draft',
                approval_id bigint(20) unsigned NULL,
                notes text NULL,
                posted_at datetime NULL,
                voided_at datetime NULL,
                void_reason text NULL,
                created_by bigint(20) unsigned NOT NULL,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY invoice_number (invoice_number),
                KEY customer_id (customer_id),
                KEY branch_id (branch_id),
                KEY status (status),
                KEY posted_at (posted_at)
            ) $c;",

            'sale_items' => "CREATE TABLE {$p}sale_items (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                sale_id bigint(20) unsigned NOT NULL,
                product_id bigint(20) unsigned NOT NULL,
                variant_id bigint(20) unsigned NULL,
                imei_id bigint(20) unsigned NULL,
                quantity int(11) NOT NULL DEFAULT 1,
                selling_price bigint(20) NOT NULL,
                cost_price bigint(20) NOT NULL,
                min_price bigint(20) NOT NULL,
                discount bigint(20) NOT NULL DEFAULT 0,
                PRIMARY KEY  (id),
                KEY sale_id (sale_id),
                KEY imei_id (imei_id)
            ) $c;",

            'payments' => "CREATE TABLE {$p}payments (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                customer_id bigint(20) unsigned NOT NULL,
                sale_id bigint(20) unsigned NULL,
                amount bigint(20) NOT NULL,
                method varchar(32) NOT NULL,
                branch_id bigint(20) unsigned NOT NULL,
                status varchar(32) NOT NULL DEFAULT 'posted',
                reversal_of bigint(20) unsigned NULL,
                notes text NULL,
                posted_by bigint(20) unsigned NOT NULL,
                posted_at datetime NOT NULL,
                created_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY customer_id (customer_id),
                KEY sale_id (sale_id),
                KEY posted_at (posted_at)
            ) $c;",

            'ledgers' => "CREATE TABLE {$p}ledgers (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                party_type varchar(32) NOT NULL,
                party_id bigint(20) unsigned NOT NULL,
                entry_type varchar(16) NOT NULL,
                amount bigint(20) NOT NULL,
                balance_after bigint(20) NOT NULL,
                reference_type varchar(64) NOT NULL,
                reference_id bigint(20) unsigned NOT NULL,
                description varchar(255) NOT NULL,
                branch_id bigint(20) unsigned NULL,
                posted_by bigint(20) unsigned NOT NULL,
                posted_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY party (party_type, party_id),
                KEY posted_at (posted_at),
                KEY reference (reference_type, reference_id)
            ) $c;",

            'returns' => "CREATE TABLE {$p}returns (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                sale_id bigint(20) unsigned NOT NULL,
                customer_id bigint(20) unsigned NULL,
                branch_id bigint(20) unsigned NOT NULL,
                return_type varchar(32) NOT NULL,
                reason text NULL,
                resolution varchar(32) NOT NULL,
                status varchar(32) NOT NULL DEFAULT 'draft',
                inspection_notes text NULL,
                refund_amount bigint(20) NOT NULL DEFAULT 0,
                replacement_imei_id bigint(20) unsigned NULL,
                created_by bigint(20) unsigned NOT NULL,
                posted_at datetime NULL,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY sale_id (sale_id),
                KEY branch_id (branch_id),
                KEY status (status)
            ) $c;",

            'return_items' => "CREATE TABLE {$p}return_items (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                return_id bigint(20) unsigned NOT NULL,
                sale_item_id bigint(20) unsigned NOT NULL,
                imei_id bigint(20) unsigned NOT NULL,
                return_type varchar(32) NOT NULL,
                resolution varchar(32) NOT NULL,
                PRIMARY KEY  (id),
                KEY return_id (return_id),
                KEY imei_id (imei_id)
            ) $c;",

            'swaps' => "CREATE TABLE {$p}swaps (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                invoice_number varchar(64) NOT NULL,
                customer_id bigint(20) unsigned NOT NULL,
                branch_id bigint(20) unsigned NOT NULL,
                incoming_imei_id bigint(20) unsigned NOT NULL,
                outgoing_imei_id bigint(20) unsigned NOT NULL,
                incoming_value bigint(20) NOT NULL,
                outgoing_price bigint(20) NOT NULL,
                difference bigint(20) NOT NULL,
                payment_method varchar(32) NULL,
                paid_amount bigint(20) NOT NULL DEFAULT 0,
                status varchar(32) NOT NULL DEFAULT 'posted',
                notes text NULL,
                created_by bigint(20) unsigned NOT NULL,
                posted_at datetime NOT NULL,
                created_at datetime NOT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY invoice_number (invoice_number),
                KEY customer_id (customer_id),
                KEY branch_id (branch_id)
            ) $c;",

            'transfers' => "CREATE TABLE {$p}transfers (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                from_branch_id bigint(20) unsigned NOT NULL,
                to_branch_id bigint(20) unsigned NOT NULL,
                status varchar(32) NOT NULL DEFAULT 'requested',
                notes text NULL,
                requested_by bigint(20) unsigned NOT NULL,
                approved_by bigint(20) unsigned NULL,
                dispatched_by bigint(20) unsigned NULL,
                received_by bigint(20) unsigned NULL,
                requested_at datetime NOT NULL,
                approved_at datetime NULL,
                dispatched_at datetime NULL,
                received_at datetime NULL,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY from_branch_id (from_branch_id),
                KEY to_branch_id (to_branch_id),
                KEY status (status)
            ) $c;",

            'transfer_items' => "CREATE TABLE {$p}transfer_items (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                transfer_id bigint(20) unsigned NOT NULL,
                imei_id bigint(20) unsigned NOT NULL,
                product_id bigint(20) unsigned NOT NULL,
                PRIMARY KEY  (id),
                KEY transfer_id (transfer_id),
                KEY imei_id (imei_id)
            ) $c;",

            'approvals' => "CREATE TABLE {$p}approvals (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                type varchar(64) NOT NULL,
                payload longtext NOT NULL,
                status varchar(32) NOT NULL DEFAULT 'pending',
                requested_by bigint(20) unsigned NOT NULL,
                reviewed_by bigint(20) unsigned NULL,
                review_notes text NULL,
                branch_id bigint(20) unsigned NULL,
                created_at datetime NOT NULL,
                reviewed_at datetime NULL,
                PRIMARY KEY  (id),
                KEY status (status),
                KEY type (type)
            ) $c;",

            'audit_logs' => "CREATE TABLE {$p}audit_logs (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                user_id bigint(20) unsigned NULL,
                action varchar(64) NOT NULL,
                entity_type varchar(64) NOT NULL,
                entity_id bigint(20) unsigned NULL,
                old_value longtext NULL,
                new_value longtext NULL,
                ip_address varchar(64) NULL,
                branch_id bigint(20) unsigned NULL,
                created_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY user_id (user_id),
                KEY action (action),
                KEY entity (entity_type, entity_id),
                KEY created_at (created_at)
            ) $c;",

            'sequences' => "CREATE TABLE {$p}sequences (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                seq_key varchar(64) NOT NULL,
                next_value int(11) NOT NULL DEFAULT 1,
                PRIMARY KEY  (id),
                UNIQUE KEY seq_key (seq_key)
            ) $c;",

            'notifications' => "CREATE TABLE {$p}notifications (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                user_id bigint(20) unsigned NULL,
                branch_id bigint(20) unsigned NULL,
                type varchar(64) NOT NULL,
                title varchar(191) NOT NULL,
                body text NOT NULL,
                is_read tinyint(1) NOT NULL DEFAULT 0,
                reference_type varchar(64) NULL,
                reference_id bigint(20) unsigned NULL,
                created_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY user_read (user_id, is_read),
                KEY created_at (created_at)
            ) $c;",

            'repairs' => "CREATE TABLE {$p}repairs (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                ticket_number varchar(64) NOT NULL,
                imei_id bigint(20) unsigned NOT NULL,
                customer_id bigint(20) unsigned NULL,
                branch_id bigint(20) unsigned NOT NULL,
                engineer_id bigint(20) unsigned NULL,
                fault_description text NOT NULL,
                diagnosis text NULL,
                status varchar(32) NOT NULL DEFAULT 'received',
                source varchar(32) NOT NULL DEFAULT 'walk_in',
                charge_amount bigint(20) NOT NULL DEFAULT 0,
                paid_amount bigint(20) NOT NULL DEFAULT 0,
                received_at datetime NOT NULL,
                completed_at datetime NULL,
                returned_at datetime NULL,
                created_by bigint(20) unsigned NOT NULL,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY ticket_number (ticket_number),
                KEY imei_id (imei_id),
                KEY status (status),
                KEY branch_id (branch_id)
            ) $c;",

            'expenses' => "CREATE TABLE {$p}expenses (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                branch_id bigint(20) unsigned NOT NULL,
                category varchar(64) NOT NULL,
                amount bigint(20) NOT NULL,
                description text NOT NULL,
                vendor varchar(191) NULL,
                status varchar(32) NOT NULL DEFAULT 'draft',
                approval_id bigint(20) unsigned NULL,
                posted_by bigint(20) unsigned NOT NULL,
                posted_at datetime NULL,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY branch_id (branch_id),
                KEY status (status),
                KEY posted_at (posted_at),
                KEY category (category)
            ) $c;",

            'supplier_payments' => "CREATE TABLE {$p}supplier_payments (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                supplier_id bigint(20) unsigned NOT NULL,
                purchase_id bigint(20) unsigned NULL,
                amount bigint(20) NOT NULL,
                method varchar(32) NOT NULL,
                branch_id bigint(20) unsigned NOT NULL,
                status varchar(32) NOT NULL DEFAULT 'posted',
                reversal_of bigint(20) unsigned NULL,
                notes text NULL,
                posted_by bigint(20) unsigned NOT NULL,
                posted_at datetime NOT NULL,
                created_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY supplier_id (supplier_id),
                KEY posted_at (posted_at)
            ) $c;",

            'stock_counts' => "CREATE TABLE {$p}stock_counts (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                branch_id bigint(20) unsigned NOT NULL,
                status varchar(32) NOT NULL DEFAULT 'open',
                reason text NULL,
                expected_qty int(11) NOT NULL DEFAULT 0,
                counted_qty int(11) NOT NULL DEFAULT 0,
                missing_qty int(11) NOT NULL DEFAULT 0,
                extra_qty int(11) NOT NULL DEFAULT 0,
                approval_id bigint(20) unsigned NULL,
                counted_by bigint(20) unsigned NOT NULL,
                approved_by bigint(20) unsigned NULL,
                posted_at datetime NULL,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY branch_status (branch_id, status)
            ) $c;",

            'stock_count_lines' => "CREATE TABLE {$p}stock_count_lines (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                count_id bigint(20) unsigned NOT NULL,
                imei_id bigint(20) unsigned NULL,
                imei varchar(64) NOT NULL,
                track_mode varchar(16) NOT NULL DEFAULT 'imei',
                product_id bigint(20) unsigned NULL,
                variant_id bigint(20) unsigned NULL,
                expected_status varchar(32) NULL,
                found_status varchar(32) NULL,
                expected tinyint(1) NOT NULL DEFAULT 0,
                counted tinyint(1) NOT NULL DEFAULT 0,
                expected_qty int(11) NOT NULL DEFAULT 1,
                counted_qty int(11) NOT NULL DEFAULT 0,
                variance varchar(32) NOT NULL DEFAULT 'missing',
                notes varchar(255) NULL,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY count_id (count_id),
                KEY imei (imei),
                KEY count_product (count_id, product_id, variant_id)
            ) $c;",

            'outbox' => "CREATE TABLE {$p}outbox (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                channel varchar(32) NOT NULL,
                destination varchar(64) NULL,
                title varchar(191) NOT NULL,
                body text NOT NULL,
                payload longtext NULL,
                status varchar(32) NOT NULL DEFAULT 'queued',
                created_at datetime NOT NULL,
                sent_at datetime NULL,
                PRIMARY KEY  (id),
                KEY status (status),
                KEY created_at (created_at)
            ) $c;",

            'branch_stock' => "CREATE TABLE {$p}branch_stock (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                branch_id bigint(20) unsigned NOT NULL,
                product_id bigint(20) unsigned NOT NULL,
                variant_id bigint(20) unsigned NULL,
                qty_on_hand int(11) NOT NULL DEFAULT 0,
                avg_cost bigint(20) NOT NULL DEFAULT 0,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY branch_product_variant (branch_id, product_id, variant_id),
                KEY branch_id (branch_id),
                KEY product_id (product_id)
            ) $c;",

            'product_branch_prices' => "CREATE TABLE {$p}product_branch_prices (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                product_id bigint(20) unsigned NOT NULL,
                variant_id bigint(20) unsigned NULL,
                branch_id bigint(20) unsigned NOT NULL,
                cost_price bigint(20) NOT NULL DEFAULT 0,
                min_selling_price bigint(20) NOT NULL DEFAULT 0,
                current_selling_price bigint(20) NOT NULL DEFAULT 0,
                market_price bigint(20) NOT NULL DEFAULT 0,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY product_branch_variant (product_id, branch_id, variant_id),
                KEY branch_id (branch_id)
            ) $c;",

            'price_history' => "CREATE TABLE {$p}price_history (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                product_id bigint(20) unsigned NOT NULL,
                variant_id bigint(20) unsigned NULL,
                branch_id bigint(20) unsigned NULL,
                field varchar(32) NOT NULL DEFAULT 'current',
                old_price bigint(20) NOT NULL DEFAULT 0,
                new_price bigint(20) NOT NULL DEFAULT 0,
                change_type varchar(32) NOT NULL DEFAULT 'bulk',
                reason varchar(255) NULL,
                status varchar(32) NOT NULL DEFAULT 'applied',
                created_by bigint(20) unsigned NULL,
                approved_by bigint(20) unsigned NULL,
                created_at datetime NOT NULL,
                PRIMARY KEY  (id),
                KEY product_id (product_id),
                KEY created_at (created_at),
                KEY status (status)
            ) $c;",

            'price_schedules' => "CREATE TABLE {$p}price_schedules (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                name varchar(191) NOT NULL,
                payload longtext NOT NULL,
                effective_at datetime NOT NULL,
                status varchar(32) NOT NULL DEFAULT 'pending',
                created_by bigint(20) unsigned NULL,
                branch_id bigint(20) unsigned NULL,
                created_at datetime NOT NULL,
                applied_at datetime NULL,
                PRIMARY KEY  (id),
                KEY status_effective (status, effective_at)
            ) $c;",

            'idempotency' => "CREATE TABLE {$p}idempotency (
                id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
                idempotency_key varchar(64) NOT NULL,
                user_id bigint(20) unsigned NOT NULL DEFAULT 0,
                route varchar(191) NOT NULL,
                response_json longtext NOT NULL,
                created_at datetime NOT NULL,
                PRIMARY KEY  (id),
                UNIQUE KEY idempotency_key (idempotency_key),
                KEY created_at (created_at)
            ) $c;",
        ];
    }
}
