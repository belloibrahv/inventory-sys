<?php
declare(strict_types=1);

namespace Atoms\Domain;

/** Validates unit identifiers based on product tracking mode (IMEI, serial, or quantity). */
final class UnitValidator
{
    public function __construct(private readonly ImeiValidator $imei = new ImeiValidator())
    {
    }

    public function normalizeTrackMode(string $mode): string
    {
        $mode = strtolower(trim($mode));
        return in_array($mode, ['imei', 'serial', 'quantity'], true) ? $mode : 'imei';
    }

    public function assertUnitCode(string $code, string $trackMode = 'imei'): string
    {
        $trackMode = $this->normalizeTrackMode($trackMode);
        if ($trackMode === 'quantity') {
            throw new DomainException('Quantity products are not scanned as individual units.');
        }
        if ($trackMode === 'imei') {
            return $this->imei->assertValid($code);
        }
        $serial = strtoupper(trim($code));
        if ($serial === '' || strlen($serial) < 4 || strlen($serial) > 64) {
            throw new DomainException('Serial number must be 4–64 characters.');
        }
        if (!preg_match('/^[A-Z0-9\-_.]+$/', $serial)) {
            throw new DomainException('Serial number has invalid characters.');
        }

        return $serial;
    }
}
