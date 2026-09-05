<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Services\IdempotencyStore;
use PHPUnit\Framework\TestCase;

final class IdempotencyStoreTest extends TestCase
{
    public function test_normalize_rejects_short_or_invalid_keys(): void
    {
        $s = new IdempotencyStore();
        $this->assertSame('', $s->normalize(''));
        $this->assertSame('', $s->normalize('abc'));
        $this->assertSame('', $s->normalize('bad key!!'));
        $this->assertNotSame('', $s->normalize('clientid12345678'));
        $this->assertSame('abc12345-def0', $s->normalize('ABC12345-DEF0'));
    }
}
