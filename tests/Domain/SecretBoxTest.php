<?php
declare(strict_types=1);

namespace Atoms\Tests\Domain;

use Atoms\Domain\DomainException;
use Atoms\Domain\SecretBox;
use PHPUnit\Framework\TestCase;

final class SecretBoxTest extends TestCase
{
    public function test_round_trip_hides_the_plaintext(): void
    {
        $box    = new SecretBox('unit-test-key');
        $sealed = $box->seal('wa-live-token-abc');
        $this->assertTrue($box->isSealed($sealed));
        $this->assertStringStartsWith(SecretBox::PREFIX, $sealed);
        $this->assertStringNotContainsString('wa-live-token-abc', $sealed);
        $this->assertSame('wa-live-token-abc', $box->open($sealed));
    }

    public function test_empty_secret_stays_empty(): void
    {
        $box = new SecretBox('unit-test-key');
        $this->assertSame('', $box->seal(''));
        $this->assertSame('', $box->open(''));
    }

    public function test_legacy_plaintext_still_opens(): void
    {
        $box = new SecretBox('unit-test-key');
        $this->assertSame('old-token', $box->open('old-token'));
        $this->assertFalse($box->isSealed('old-token'));
    }

    public function test_wrong_key_or_tamper_refuses_to_open(): void
    {
        $sealed = (new SecretBox('key-a'))->seal('secret');
        $this->expectException(DomainException::class);
        (new SecretBox('key-b'))->open($sealed);
    }

    public function test_tampered_payload_is_refused(): void
    {
        $sealed  = (new SecretBox('unit-test-key'))->seal('secret');
        $flipped = substr($sealed, 0, -2) . (substr($sealed, -2, 1) === 'A' ? 'B' : 'A') . substr($sealed, -1);
        $this->expectException(DomainException::class);
        (new SecretBox('unit-test-key'))->open($flipped);
    }
}
