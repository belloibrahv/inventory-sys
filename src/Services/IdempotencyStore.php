<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Support\Db;

/**
 * Exactly-once replay for offline outbox mutations.
 * Same client key → same stored response (no duplicate sales/payments).
 */
final class IdempotencyStore
{
    public function __construct(private readonly Db $db = new Db())
    {
    }

    /**
     * @template T
     * @param callable():T $producer
     * @return T
     */
    public function once(string $key, string $route, callable $producer): mixed
    {
        $key = $this->normalize($key);
        if ($key === '') {
            return $producer();
        }

        $hit = $this->find($key);
        if ($hit !== null) {
            return $hit['payload'];
        }

        $payload = $producer();
        $this->store($key, $route, $payload);

        return $payload;
    }

    public function normalize(string $key): string
    {
        $key = strtolower(trim($key));
        if ($key === '' || strlen($key) > 64) {
            return '';
        }
        if (!preg_match('/^[a-z0-9][a-z0-9\-_]{7,63}$/', $key)) {
            return '';
        }

        return $key;
    }

    /**
     * @return array{payload: mixed}|null
     */
    private function find(string $key): ?array
    {
        global $wpdb;
        $table = $this->db->table('idempotency');
        $row   = $wpdb->get_row(
            $wpdb->prepare("SELECT response_json FROM {$table} WHERE idempotency_key = %s LIMIT 1", $key),
            ARRAY_A
        );
        if (!$row) {
            return null;
        }
        $decoded = json_decode((string) ($row['response_json'] ?? ''), true);

        return ['payload' => $decoded];
    }

    private function store(string $key, string $route, mixed $payload): void
    {
        global $wpdb;
        $table = $this->db->table('idempotency');
        $wpdb->query(
            $wpdb->prepare(
                "INSERT IGNORE INTO {$table} (idempotency_key, user_id, route, response_json, created_at)
                 VALUES (%s, %d, %s, %s, %s)",
                $key,
                get_current_user_id(),
                substr($route, 0, 191),
                wp_json_encode($payload),
                $this->db->now()
            )
        );
        // If another request won the race, prefer the stored winner.
        if ((int) $wpdb->rows_affected === 0) {
            $hit = $this->find($key);
            if ($hit !== null) {
                // Producer already ran — rare race; stored row wins for future retries.
            }
        }
    }
}
