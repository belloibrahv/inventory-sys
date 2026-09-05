<?php
declare(strict_types=1);

namespace Atoms\Domain;

enum ImeiStatus: string
{
    case Available    = 'available';
    case Reserved     = 'reserved';
    case Sold         = 'sold';
    case Returned     = 'returned';
    case Faulty       = 'faulty';
    case UnderRepair  = 'under_repair';
    case Transferred  = 'transferred';
    case Disposed     = 'disposed';

    public function label(): string
    {
        return (new StatusLabel())->of($this->value);
    }

    public function isSellable(): bool
    {
        return $this === self::Available;
    }
}
