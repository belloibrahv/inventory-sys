<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * Home overview KPI widgets and per-persona layouts.
 */
final class HomeDashboardPolicy
{
    public const PERSONAS = ['cashier', 'stock', 'engineer', 'money', 'manager', 'owner'];

    /** @var array<string, string> */
    public const WIDGETS = [
        'sales_today'        => 'Sales today',
        'cash_collected'     => 'Cash collected',
        'customer_balances'  => 'Customer balances',
        'supplier_payables'  => 'Supplier payables',
        'overdue_invoices'   => 'Overdue invoices',
        'unread_alerts'      => 'Unread alerts',
        'devices_in_stock'   => 'Devices in stock',
        'accessories_stock'  => 'Accessories on hand',
        'low_stock_items'    => 'Low stock items',
        'in_transit'         => 'In transit',
        'open_repairs'       => 'Open repairs',
        'stuck_repairs'      => 'Stuck repairs',
        'faulty_devices'     => 'Faulty devices',
        'repairs_today'      => 'Repairs completed today',
        'net_cash_today'     => 'Net cash today',
        'receivables'        => 'Receivables',
        'payables'           => 'Payables',
        'pending_approvals'  => 'Pending approvals',
        'wholesale_today'    => 'Wholesale today',
    ];

    /**
     * @return array<string, list<string>>
     */
    public function defaults(): array
    {
        return [
            'cashier'  => ['sales_today', 'cash_collected', 'overdue_invoices', 'unread_alerts'],
            'stock'    => ['devices_in_stock', 'accessories_stock', 'low_stock_items', 'in_transit'],
            'engineer' => ['open_repairs', 'stuck_repairs', 'faulty_devices', 'repairs_today'],
            'money'    => ['cash_collected', 'customer_balances', 'supplier_payables', 'overdue_invoices'],
            'owner'    => ['sales_today', 'net_cash_today', 'receivables', 'payables', 'pending_approvals', 'low_stock_items'],
            'manager'  => ['sales_today', 'cash_collected', 'customer_balances', 'devices_in_stock', 'open_repairs', 'unread_alerts'],
        ];
    }

    /**
     * @return array{
     *   personas: list<array{id: string, label: string}>,
     *   widgets: list<array{id: string, label: string}>,
     *   defaults: array<string, list<string>>,
     *   layout: array<string, list<string>>
     * }
     */
    public function manifest(?array $saved = null): array
    {
        $labels = [
            'cashier'  => 'Sales floor',
            'stock'    => 'Stock desk',
            'engineer' => 'Service desk',
            'money'    => 'Finance desk',
            'manager'  => 'Branch manager',
            'owner'    => 'Executive view',
        ];

        return [
            'personas' => array_map(
                static fn(string $id) => ['id' => $id, 'label' => $labels[$id] ?? $id],
                self::PERSONAS
            ),
            'widgets'  => array_map(
                static fn(string $id, string $label) => ['id' => $id, 'label' => $label],
                array_keys(self::WIDGETS),
                array_values(self::WIDGETS)
            ),
            'defaults' => $this->defaults(),
            'layout'   => $this->normalize(is_array($saved) ? $saved : null),
        ];
    }

    /**
     * @param array<string, mixed>|null $saved
     * @return array<string, list<string>>
     */
    public function normalize(?array $saved): array
    {
        $defaults = $this->defaults();
        $allowed  = array_keys(self::WIDGETS);
        $out      = [];

        foreach (self::PERSONAS as $persona) {
            $picked = [];
            if (is_array($saved[$persona] ?? null)) {
                foreach ($saved[$persona] as $widget) {
                    $widget = strtolower(preg_replace('/[^a-z0-9_\-]/', '', (string) $widget) ?? '');
                    if ($widget !== '' && in_array($widget, $allowed, true) && !in_array($widget, $picked, true)) {
                        $picked[] = $widget;
                    }
                }
            }
            $out[$persona] = $picked !== [] ? array_slice($picked, 0, 8) : $defaults[$persona];
        }

        return $out;
    }

    public function resolvePersona(array $roles): string
    {
        $roles = array_map(static fn(string $r): string => strtolower($r), $roles);
        $has   = static function (string $needle) use ($roles): bool {
            foreach ($roles as $role) {
                if (str_contains($role, $needle)) {
                    return true;
                }
            }

            return false;
        };

        if ($has('engineer')) {
            return 'engineer';
        }
        if ($has('vault') || $has('inventory') || $has('inbound')) {
            return 'stock';
        }
        if ($has('cashier') || $has('sales_officer')) {
            return 'cashier';
        }
        if ($has('accountant')) {
            return 'money';
        }
        if ($has('administrator') || $has('ceo') || $has('director')) {
            return 'owner';
        }
        if ($has('branch_manager') || $has('auditor')) {
            return 'manager';
        }

        return 'manager';
    }

    public function personaLabel(string $persona): string
    {
        $labels = [
            'cashier'  => 'Sales floor',
            'stock'    => 'Stock desk',
            'engineer' => 'Service desk',
            'money'    => 'Finance desk',
            'manager'  => 'Branch manager',
            'owner'    => 'Executive view',
        ];

        return $labels[$persona] ?? 'Operations';
    }
}
