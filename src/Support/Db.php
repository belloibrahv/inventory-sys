<?php
declare(strict_types=1);

namespace Atoms\Support;

final class Db
{
    private static int $depth = 0;

    public function prefix(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'atoms_';
    }

    public function table(string $name): string
    {
        return $this->prefix() . $name;
    }

    public function now(): string
    {
        return current_time('mysql');
    }

    public function today(): string
    {
        return current_time('Y-m-d');
    }

    public function year(): string
    {
        return (string) current_time('Y');
    }

    /**
     * @param array<string, mixed> $data
     */
    public function insert(string $table, array $data): int
    {
        global $wpdb;
        $ok = $wpdb->insert($this->table($table), $data);
        if ($ok === false) {
            throw new \RuntimeException($wpdb->last_error ?: 'Insert failed.');
        }

        return (int) $wpdb->insert_id;
    }

    /**
     * @param array<string, mixed> $data
     * @param array<string, mixed> $where
     */
    public function update(string $table, array $data, array $where): int
    {
        global $wpdb;
        $ok = $wpdb->update($this->table($table), $data, $where);
        if ($ok === false) {
            throw new \RuntimeException($wpdb->last_error ?: 'Update failed.');
        }

        return (int) $ok;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function find(string $table, int $id): ?array
    {
        global $wpdb;
        $sql = $wpdb->prepare('SELECT * FROM ' . $this->table($table) . ' WHERE id = %d', $id);
        $row = $wpdb->get_row($sql, ARRAY_A);

        return $row ?: null;
    }

    public function transaction(callable $callback): mixed
    {
        global $wpdb;
        self::$depth++;
        if (self::$depth === 1) {
            $wpdb->query('START TRANSACTION');
        }
        try {
            $result = $callback();
            if (self::$depth === 1) {
                $wpdb->query('COMMIT');
            }
            self::$depth--;

            return $result;
        } catch (\Throwable $e) {
            if (self::$depth === 1) {
                $wpdb->query('ROLLBACK');
            }
            self::$depth--;
            throw $e;
        }
    }

    public function nextSequence(string $key): int
    {
        global $wpdb;
        $table = $this->table('sequences');
        $row   = $wpdb->get_row(
            $wpdb->prepare("SELECT * FROM {$table} WHERE seq_key = %s FOR UPDATE", $key),
            ARRAY_A
        );

        if (!$row) {
            $wpdb->insert($table, ['seq_key' => $key, 'next_value' => 2]);
            return 1;
        }

        $current = (int) $row['next_value'];
        $wpdb->update($table, ['next_value' => $current + 1], ['id' => (int) $row['id']]);

        return $current;
    }
}
