<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * Integer kobo/cents arithmetic. Never use floats for money.
 */
final class Money
{
    public function __construct(private readonly int $minor)
    {
    }

    public static function fromMajor(float|int|string $major): self
    {
        if (is_string($major)) {
            $major = str_replace([',', ' '], '', $major);
        }

        return new self((int) round(((float) $major) * 100));
    }

    public static function zero(): self
    {
        return new self(0);
    }

    public function minor(): int
    {
        return $this->minor;
    }

    public function major(): float
    {
        return $this->minor / 100;
    }

    public function add(self $other): self
    {
        return new self($this->minor + $other->minor);
    }

    public function subtract(self $other): self
    {
        return new self($this->minor - $other->minor);
    }

    public function isNegative(): bool
    {
        return $this->minor < 0;
    }

    public function isZero(): bool
    {
        return $this->minor === 0;
    }

    public function greaterThan(self $other): bool
    {
        return $this->minor > $other->minor;
    }

    public function greaterThanOrEqual(self $other): bool
    {
        return $this->minor >= $other->minor;
    }

    public function lessThan(self $other): bool
    {
        return $this->minor < $other->minor;
    }

    public function equals(self $other): bool
    {
        return $this->minor === $other->minor;
    }

    public function format(string $symbol = '₦'): string
    {
        $sign = $this->minor < 0 ? '-' : '';
        $abs  = abs($this->minor);

        return $sign . $symbol . number_format($abs / 100, 2);
    }
}
