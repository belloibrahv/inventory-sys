<?php
declare(strict_types=1);

namespace Atoms\Roles;

final class Capabilities
{
    public const ROLES = [
        'atoms_ceo'               => 'CEO',
        'atoms_director'          => 'Director',
        'atoms_auditor'           => 'Auditor',
        'atoms_accountant'        => 'Accountant',
        'atoms_branch_manager'    => 'Branch Manager',
        'atoms_vault_manager'     => 'Vault Manager',
        'atoms_cashier'           => 'Cashier',
        'atoms_sales_officer'     => 'Sales Officer',
        'atoms_engineer'             => 'Engineer',
        'atoms_inventory_officer'    => 'Inventory Officer',
        'atoms_inbound_coordinator'  => 'Inbound Coordinator',
    ];

    /**
     * @return array<string, list<string>>
     */
    public function map(): array
    {
        $read = [
            'atoms_access',
            'atoms_read',
            'atoms_view_reports',
            'atoms_view_imei',
            'atoms_view_audit',
            'atoms_all_branches',
        ];

        $sales = [
            'atoms_access',
            'atoms_read',
            'atoms_create_sale',
            'atoms_create_payment',
            'atoms_create_return',
            'atoms_create_swap',
            'atoms_view_imei',
        ];

        return [
            'atoms_ceo' => array_values(array_unique(array_merge($read, $this->allCaps()))),
            'atoms_director' => array_values(array_unique(array_merge($read, [
                'atoms_create_sale',
                'atoms_create_payment',
                'atoms_create_return',
                'atoms_create_swap',
                'atoms_manage_inventory',
                'atoms_manage_inbound',
                'atoms_manage_purchases',
                'atoms_manage_transfers',
                'atoms_approve',
                'atoms_manage_products',
                'atoms_manage_pricing',
                'atoms_manage_customers',
                'atoms_manage_suppliers',
                'atoms_manage_expenses',
                'atoms_manage_repairs',
            ]))),
            'atoms_auditor' => array_merge($read, ['atoms_approve_adjustments']),
            'atoms_accountant' => [
                'atoms_access',
                'atoms_read',
                'atoms_view_reports',
                'atoms_create_payment',
                'atoms_manage_customers',
                'atoms_manage_suppliers',
                'atoms_manage_expenses',
                'atoms_view_imei',
                'atoms_all_branches',
            ],
            'atoms_branch_manager' => array_merge($sales, [
                'atoms_view_reports',
                'atoms_manage_inventory',
                'atoms_manage_transfers',
                'atoms_approve',
                'atoms_manage_customers',
                'atoms_view_audit',
            ]),
            'atoms_vault_manager' => [
                'atoms_access',
                'atoms_read',
                'atoms_manage_inventory',
                'atoms_manage_inbound',
                'atoms_manage_purchases',
                'atoms_manage_transfers',
                'atoms_view_imei',
                'atoms_register_imei',
            ],
            'atoms_inbound_coordinator' => [
                'atoms_access',
                'atoms_read',
                'atoms_view_imei',
                'atoms_manage_inbound',
            ],
            'atoms_cashier' => array_merge($sales, ['atoms_manage_customers']),
            'atoms_sales_officer' => array_merge($sales, ['atoms_manage_customers']),
            'atoms_engineer' => [
                'atoms_access',
                'atoms_read',
                'atoms_manage_repairs',
                'atoms_view_imei',
            ],
            'atoms_inventory_officer' => [
                'atoms_access',
                'atoms_read',
                'atoms_manage_inventory',
                'atoms_view_imei',
                'atoms_register_imei',
            ],
        ];
    }

    /**
     * @return list<string>
     */
    public function allCaps(): array
    {
        return [
            'atoms_access',
            'atoms_read',
            'atoms_view_reports',
            'atoms_view_imei',
            'atoms_view_audit',
            'atoms_all_branches',
            'atoms_create_sale',
            'atoms_create_payment',
            'atoms_create_return',
            'atoms_create_swap',
            'atoms_manage_inventory',
            'atoms_manage_inbound',
            'atoms_manage_purchases',
            'atoms_manage_transfers',
            'atoms_register_imei',
            'atoms_approve',
            'atoms_approve_adjustments',
            'atoms_manage_products',
            'atoms_manage_pricing',
            'atoms_manage_customers',
            'atoms_manage_suppliers',
            'atoms_manage_expenses',
            'atoms_manage_repairs',
            'atoms_manage_settings',
            'atoms_void',
        ];
    }

    public function install(): void
    {
        foreach (self::ROLES as $key => $label) {
            $role = get_role($key);
            if (!$role) {
                add_role($key, $label, ['read' => true]);
                $role = get_role($key);
            }
            foreach ($this->map()[$key] as $cap) {
                $role?->add_cap($cap);
            }
        }

        $admin = get_role('administrator');
        if ($admin) {
            foreach ($this->allCaps() as $cap) {
                $admin->add_cap($cap);
            }
        }
    }
}
