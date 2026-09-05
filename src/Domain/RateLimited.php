<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * Thrown when a client exceeds the request rate window.
 * Extends RuntimeException (not DomainException) so DomainException can stay final.
 */
final class RateLimited extends \RuntimeException
{
}
