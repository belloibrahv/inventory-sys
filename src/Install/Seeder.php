<?php
declare(strict_types=1);

namespace Atoms\Install;

use Atoms\Support\Db;

final class Seeder
{
    public function seedIfEmpty(): void
    {
        global $wpdb;
        $db    = new Db();
        $count = (int) $wpdb->get_var('SELECT COUNT(*) FROM ' . $db->table('branches'));
        if ($count > 0) {
            return;
        }

        $now = $db->now();
        $branches = [
            ['Ibadan Main', 'IBD', 'Ibadan, Oyo State'],
            ['Branch A', 'BRA', ''],
            ['Branch B', 'BRB', ''],
            ['Branch C', 'BRC', ''],
        ];
        $ids = [];
        foreach ($branches as $b) {
            $ids[] = $db->insert('branches', [
                'name'       => $b[0],
                'code'       => $b[1],
                'address'    => $b[2],
                'phone'      => '',
                'is_active'  => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $admin = get_users(['role' => 'administrator', 'number' => 1]);
        if ($admin) {
            foreach ($ids as $i => $branchId) {
                $db->insert('user_branches', [
                    'user_id'    => (int) $admin[0]->ID,
                    'branch_id'  => $branchId,
                    'is_default' => $i === 0 ? 1 : 0,
                ]);
            }
        }

        $db->insert('suppliers', [
            'name'           => 'Walk-in Supplier',
            'contact_person' => '',
            'phone'          => '',
            'email'          => '',
            'address'        => '',
            'notes'          => 'Default supplier record',
            'is_active'      => 1,
            'created_at'     => $now,
            'updated_at'     => $now,
        ]);

        $db->insert('customers', [
            'name'       => 'Walk-in Customer',
            'phone'      => '00000000000',
            'email'      => '',
            'address'    => '',
            'branch_id'  => $ids[0] ?? null,
            'notes'      => 'Cash walk-in',
            'is_walk_in' => 1,
            'is_active'  => 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $samples = [
            ['SAM-A36-128', 'Samsung Galaxy A36', 'Samsung', 'Phone', 280000, 250000, 'Black', '128GB'],
            ['IPH-13-128', 'iPhone 13', 'Apple', 'Phone', 450000, 400000, 'Blue', '128GB'],
            ['TEC-SPARK', 'Tecno Spark', 'Tecno', 'Phone', 120000, 95000, 'Gold', '64GB'],
        ];
        foreach ($samples as $p) {
            $pid = $db->insert('products', [
                'sku'                 => $p[0],
                'name'                => $p[1],
                'brand'               => $p[2],
                'category'            => $p[3],
                'description'         => '',
                'is_serialized'       => 1,
                'min_selling_price'   => $p[4] * 100,
                'default_cost_price'  => $p[5] * 100,
                'low_stock_threshold' => 2,
                'warranty_days'       => 365,
                'is_active'           => 1,
                'created_at'          => $now,
                'updated_at'          => $now,
            ]);
            $db->insert('product_variants', [
                'product_id'        => $pid,
                'sku'               => $p[0] . '-V1',
                'variant_name'      => $p[6] . ' / ' . $p[7],
                'color'             => $p[6],
                'storage'           => $p[7],
                'min_selling_price' => $p[4] * 100,
                'cost_price'        => $p[5] * 100,
                'is_active'         => 1,
                'created_at'        => $now,
                'updated_at'        => $now,
            ]);
        }

        update_option('atoms_company_name', 'Abu Twins Softskills Investment');
        update_option('atoms_ops', [
            'company'            => 'Abu Twins Softskills Investment',
            'wordmark'           => 'abutwins',
            'wordmark_accent'    => 'Softskills',
            'tagline'            => 'INVESTMENT',
            'warranty_days'      => 365,
        ]);
    }
}
