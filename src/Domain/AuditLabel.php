<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class AuditLabel
{
    /**
     * Business language for audit actions. Machine keys stay in the database.
     */
    public function of(string $action): string
    {
        return match ($action) {
            'sale.created'              => 'Sale posted',
            'sale.voided'               => 'Sale voided',
            'payment.posted'            => 'Payment added',
            'payment.reversed'          => 'Payment reversed',
            'return.created'            => 'Return posted',
            'swap.created'              => 'Swap posted',
            'approval.requested'        => 'Approval requested',
            'approval.approved'         => 'Approval granted',
            'approval.rejected'         => 'Approval rejected',
            'imei.registered'           => 'IMEI registered',
            'imei.transition'           => 'IMEI status changed',
            'repair.received'           => 'Repair received',
            'repair.status'             => 'Repair status updated',
            'repair.resolved'           => 'Repair closed',
            'purchase.created'          => 'Purchase created',
            'purchase.received'         => 'Purchase received',
            'purchase.imeis_registered' => 'Purchase IMEIs registered',
            'transfer.requested'        => 'Transfer requested',
            'transfer.approved'         => 'Transfer approved',
            'transfer.dispatched'       => 'Transfer dispatched',
            'transfer.received'         => 'Transfer received',
            'expense.posted'            => 'Expense posted',
            'stock_count.opened'        => 'Stock count opened',
            'stock_count.scanned'       => 'Stock count scan',
            'stock_count.submitted'     => 'Stock count submitted',
            'stock_count.posted'        => 'Stock adjustment posted',
            'stock_count.rejected'      => 'Stock count rejected',
            'stock_count.cancelled'     => 'Stock count cancelled',
            'customer.created'          => 'Customer created',
            'customer.updated'          => 'Customer updated',
            'product.created'           => 'Product created',
            'product.updated'           => 'Product updated',
            'product.archived'          => 'Product archived',
            'product.restored'          => 'Product restored',
            'product.variant_added'     => 'Variant added',
            'supplier.created'          => 'Supplier created',
            'supplier.payment'          => 'Supplier payment',
            'supplier.return'           => 'Returned to supplier',
            'supplier.archived'         => 'Supplier archived',
            'supplier.restored'         => 'Supplier restored',
            'customer.archived'         => 'Customer archived',
            'customer.restored'         => 'Customer restored',
            'import.ran'                => 'CSV import',
            'automation.ran'            => 'Automation ran',
            'branch.created'            => 'Branch created',
            'branch.updated'            => 'Branch updated',
            default                     => ucfirst(trim(str_replace(['.', '_'], ' ', $action))),
        };
    }
}
