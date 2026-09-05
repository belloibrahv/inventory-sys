<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class ReturnTypes
{
    public const GOOD      = 'good';
    public const FAULTY    = 'faulty';
    public const WARRANTY  = 'warranty';
    public const EXCHANGE  = 'exchange';

    public const RESOLUTION_REFUND      = 'refund';
    public const RESOLUTION_REPLACEMENT = 'replacement';
    public const RESOLUTION_REPAIR      = 'repair';
    public const RESOLUTION_CREDIT      = 'store_credit';

    public static function imeiEvent(string $type): string
    {
        return match ($type) {
            self::GOOD     => 'return_good',
            self::FAULTY   => 'return_faulty',
            self::WARRANTY => 'return_warranty',
            self::EXCHANGE => 'return_exchange',
            default        => throw new DomainException('Unknown return type.'),
        };
    }
}
