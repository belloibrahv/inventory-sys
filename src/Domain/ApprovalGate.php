<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class ApprovalGate
{
    public function canReview(string $type, bool $canApprove, bool $canAdjust): bool
    {
        if ($type === 'stock_adjustment') {
            return $canAdjust || $canApprove;
        }

        return $canApprove;
    }
}
