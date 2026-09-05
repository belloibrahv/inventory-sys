<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * AES-256-GCM box for secrets at rest (WhatsApp API token). Never log the plaintext.
 */
final class SecretBox
{
    public const PREFIX = 'enc:v1:';

    public function __construct(private readonly string $keyMaterial)
    {
        if ($this->keyMaterial === '') {
            throw new DomainException('Encryption key material is required.');
        }
    }

    public static function fromWordPress(): self
    {
        $material = '';
        if (function_exists('wp_salt')) {
            $material = wp_salt('auth') . wp_salt('secure_auth');
        }
        if ($material === '') {
            $material = (defined('AUTH_KEY') ? (string) AUTH_KEY : '')
                . (defined('SECURE_AUTH_KEY') ? (string) SECURE_AUTH_KEY : 'atoms');
        }

        return new self($material);
    }

    public function seal(string $plaintext): string
    {
        if ($plaintext === '') {
            return '';
        }
        $key = $this->key();
        $iv  = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false || $tag === '') {
            throw new DomainException('Could not encrypt the secret.');
        }

        return self::PREFIX . base64_encode($iv . $tag . $cipher);
    }

    public function open(string $stored): string
    {
        if ($stored === '') {
            return '';
        }
        if (!str_starts_with($stored, self::PREFIX)) {
            return $stored;
        }
        $raw = base64_decode(substr($stored, strlen(self::PREFIX)), true);
        if ($raw === false || strlen($raw) < 29) {
            throw new DomainException('Stored secret is corrupt.');
        }
        $iv     = substr($raw, 0, 12);
        $tag    = substr($raw, 12, 16);
        $cipher = substr($raw, 28);
        $plain  = openssl_decrypt($cipher, 'aes-256-gcm', $this->key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($plain === false) {
            throw new DomainException('Could not decrypt the secret.');
        }

        return $plain;
    }

    public function isSealed(string $stored): bool
    {
        return str_starts_with($stored, self::PREFIX);
    }

    private function key(): string
    {
        return hash('sha256', $this->keyMaterial, true);
    }
}
