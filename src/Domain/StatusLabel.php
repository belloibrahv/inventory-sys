<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class StatusLabel
{
    /**
     * Business language for statuses shown to cashiers and managers.
     */
    public function of(string $status): string
    {
        return match ($status) {
            'available'          => 'In stock',
            'reserved'           => 'Reserved',
            'sold'               => 'Sold',
            'returned'           => 'Returned',
            'faulty'             => 'Faulty',
            'under_repair'       => 'In repair',
            'transferred'        => 'In transit',
            'disposed'           => 'Disposed',
            'pending'            => 'Waiting',
            'pending_approval'   => 'Waiting for approval',
            'completed'          => 'Posted',
            'posted'             => 'Posted',
            'open'               => 'Open',
            'requested'          => 'Requested',
            'approved'           => 'Approved',
            'dispatched'         => 'On the way',
            'received'           => 'Received',
            'inspecting'         => 'Inspecting',
            'cancelled'          => 'Cancelled',
            'rejected'           => 'Rejected',
            'voided'             => 'Voided',
            'match'              => 'Match',
            'missing'            => 'Missing',
            'wrong_branch'       => 'Wrong branch',
            'unknown'            => 'Unknown',
            'unexpected_status'  => 'Unexpected status',
            'paid'               => 'Paid',
            default              => str_replace('_', ' ', $status),
        };
    }
}
