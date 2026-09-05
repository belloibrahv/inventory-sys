<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class RateLimit
{
    public function __construct(
        private readonly int $max = 120,
        private readonly int $window = 60
    ) {
    }

    public function allow(int $hitsInWindow): bool
    {
        return $hitsInWindow < $this->max;
    }

    public function max(): int
    {
        return $this->max;
    }

    public function window(): int
    {
        return $this->window;
    }
}
