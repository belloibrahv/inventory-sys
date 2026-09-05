<?php
declare(strict_types=1);

namespace Atoms\Support;

final class Context
{
    public function userId(): int
    {
        return get_current_user_id();
    }

    public function ip(): string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        return is_string($ip) ? sanitize_text_field($ip) : '';
    }

    public function defaultBranchId(): ?int
    {
        $user = $this->userId();
        if (!$user) {
            return null;
        }

        global $wpdb;
        $table = (new Db())->table('user_branches');
        $id    = $wpdb->get_var(
            $wpdb->prepare(
                "SELECT branch_id FROM {$table} WHERE user_id = %d ORDER BY is_default DESC, id ASC LIMIT 1",
                $user
            )
        );

        return $id ? (int) $id : null;
    }

    /**
     * @return list<int>
     */
    public function branchIds(): array
    {
        $user = $this->userId();
        if (!$user) {
            return [];
        }

        if (current_user_can('atoms_all_branches')) {
            global $wpdb;
            $table = (new Db())->table('branches');
            $ids   = $wpdb->get_col("SELECT id FROM {$table} WHERE is_active = 1");
            return array_map('intval', $ids ?: []);
        }

        global $wpdb;
        $table = (new Db())->table('user_branches');
        $ids   = $wpdb->get_col($wpdb->prepare("SELECT branch_id FROM {$table} WHERE user_id = %d", $user));

        return array_map('intval', $ids ?: []);
    }

    public function assertBranchAccess(int $branchId): void
    {
        if (current_user_can('atoms_all_branches')) {
            return;
        }

        if (!in_array($branchId, $this->branchIds(), true)) {
            throw new \RuntimeException('You do not have access to this branch.');
        }
    }
}
