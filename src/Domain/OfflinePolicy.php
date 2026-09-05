<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * Floor work that must survive a dropped network.
 *
 * Technique (adopted):
 * - Outbox queue on device (localStorage → durable queue items with client UUID)
 * - Idempotent server replay (atoms_idempotency) so retries never double-post
 * - Read-through cache for catalog/IMEI/customer lookups after first online warm-up
 * - Auto-flush on reconnect + Background Sync when PWA is installed
 *
 * Correctness rules:
 * - Same client_id → same server result (exactly-once delivery)
 * - IMEI conflicts on flush surface as failed queue items (no silent overwrite)
 * - New customers offline: pass customer_phone/name on the sale, or queue POST customers first
 */
final class OfflinePolicy
{
    /**
     * @return array{
     *   queue_posts: list<string>,
     *   queue_post_patterns: list<string>,
     *   cache_prefixes: list<string>,
     *   warm_gets: list<string>,
     *   max_queue: int,
     *   max_retries: int
     * }
     */
    public function manifest(): array
    {
        return [
            'queue_posts'         => ['sales', 'returns', 'customers'],
            'queue_post_patterns' => ['customers/[0-9]+/payments'],
            'cache_prefixes'      => [
                'bootstrap',
                'dashboard',
                'imei',
                'customers',
                'products',
                'returns/locate',
                'sales/invoice',
            ],
            'warm_gets'           => ['products', 'customers?q='],
            'max_queue'           => 200,
            'max_retries'         => 8,
        ];
    }

    public function canQueuePost(string $path): bool
    {
        $p = explode('?', $this->normalize($path), 2)[0];
        $m = $this->manifest();
        if (in_array($p, $m['queue_posts'], true)) {
            return true;
        }
        foreach ($m['queue_post_patterns'] as $pattern) {
            if (preg_match('#^' . $pattern . '$#', $p)) {
                return true;
            }
        }

        return false;
    }

    public function canCacheGet(string $path): bool
    {
        $p = $this->normalize($path);
        foreach ($this->manifest()['cache_prefixes'] as $prefix) {
            if ($p === $prefix || str_starts_with($p, $prefix . '/') || str_starts_with($p, $prefix . '?')) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param array<string, mixed> $body
     */
    public function label(string $path, array $body = []): string
    {
        $imei = (string) ($body['items'][0]['imei'] ?? '');
        $p    = explode('?', $this->normalize($path), 2)[0];
        if ($p === 'returns') {
            return $imei !== '' ? 'Return ' . $imei : 'Return';
        }
        if ($p === 'customers') {
            $name = trim((string) ($body['name'] ?? ''));

            return $name !== '' ? 'Customer ' . $name : 'New customer';
        }
        if (preg_match('#^customers/\d+/payments$#', $p)) {
            $amt = $body['amount'] ?? '';

            return $amt !== '' && $amt !== null ? 'Payment ₦' . $amt : 'Customer payment';
        }

        return $imei !== '' ? 'Sale ' . $imei : 'Sale';
    }

    private function normalize(string $path): string
    {
        return strtolower(ltrim(trim($path), '/'));
    }
}
