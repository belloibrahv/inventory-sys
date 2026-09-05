<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Roles\Capabilities;
use Atoms\Support\Db;

final class UserService
{
    public function __construct(private readonly Db $db = new Db())
    {
    }

    /**
     * @return list<array{id: string, label: string}>
     */
    public function roleOptions(): array
    {
        $out = [];
        foreach (Capabilities::ROLES as $key => $label) {
            $out[] = ['id' => $key, 'label' => $label];
        }

        return $out;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function list(): array
    {
        $roles = array_merge(['administrator'], array_keys(Capabilities::ROLES));
        $users = get_users(['role__in' => $roles, 'number' => 200]);
        $out   = [];
        foreach ($users as $user) {
            $primary = $this->primaryRole($user->roles);
            $out[]   = [
                'id'         => $user->ID,
                'name'       => $user->display_name,
                'email'      => $user->user_email,
                'username'   => $user->user_login,
                'roles'      => $user->roles,
                'role_label' => $this->roleLabel($primary),
                'branches'   => $this->branchesFor((int) $user->ID),
            ];
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function createStaff(array $data): array
    {
        $name     = trim((string) ($data['name'] ?? ''));
        $email    = sanitize_email((string) ($data['email'] ?? ''));
        $username = sanitize_user((string) ($data['username'] ?? ''), true);
        $password = (string) ($data['password'] ?? '');
        $role     = sanitize_key((string) ($data['role'] ?? 'atoms_sales_officer'));

        if ($name === '' || $email === '' || $username === '' || $password === '') {
            throw new DomainException('Name, email, username, and password are required.');
        }
        if (!isset(Capabilities::ROLES[$role])) {
            throw new DomainException('Choose a valid staff role.');
        }
        if (username_exists($username) || email_exists($email)) {
            throw new DomainException('That username or email is already in use.');
        }

        $userId = wp_create_user($username, $password, $email);
        if (is_wp_error($userId)) {
            throw new DomainException((string) $userId->get_error_message());
        }

        wp_update_user([
            'ID'           => (int) $userId,
            'display_name' => $name,
        ]);

        $user = new \WP_User((int) $userId);
        $user->set_role($role);

        $branchIds = array_map('intval', $data['branch_ids'] ?? []);
        if ($branchIds !== []) {
            $this->assignBranches(
                (int) $userId,
                $branchIds,
                isset($data['default_branch_id']) ? (int) $data['default_branch_id'] : null
            );
        }

        return [
            'id'         => (int) $userId,
            'name'       => $name,
            'email'      => $email,
            'username'   => $username,
            'roles'      => [$role],
            'role_label' => $this->roleLabel($role),
            'branches'   => $this->branchesFor((int) $userId),
        ];
    }

    /**
     * Update staff display name and/or role. Does not change WordPress administrators
     * or invent passwords (use WP Users for password resets).
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function updateStaff(int $userId, array $data): array
    {
        $user = get_user_by('id', $userId);
        if (!$user) {
            throw new DomainException('User not found.');
        }

        $roles = (array) $user->roles;
        if (in_array('administrator', $roles, true) && !current_user_can('manage_options')) {
            throw new DomainException('Only a WordPress administrator can edit admin accounts.');
        }

        $updates = ['ID' => $userId];
        if (isset($data['name']) && trim((string) $data['name']) !== '') {
            $updates['display_name'] = sanitize_text_field((string) $data['name']);
        }
        if (isset($data['email']) && trim((string) $data['email']) !== '') {
            $email = sanitize_email((string) $data['email']);
            if ($email === '') {
                throw new DomainException('Enter a valid email address.');
            }
            $owner = email_exists($email);
            if ($owner && (int) $owner !== $userId) {
                throw new DomainException('That email is already in use.');
            }
            $updates['user_email'] = $email;
        }
        if (count($updates) > 1) {
            $result = wp_update_user($updates);
            if (is_wp_error($result)) {
                throw new DomainException((string) $result->get_error_message());
            }
        }

        if (isset($data['role']) && (string) $data['role'] !== '') {
            $role = sanitize_key((string) $data['role']);
            if (!isset(Capabilities::ROLES[$role])) {
                throw new DomainException('Choose a valid staff role.');
            }
            if (in_array('administrator', $roles, true)) {
                throw new DomainException('Change WordPress administrator roles in Users → All Users.');
            }
            $wpUser = new \WP_User($userId);
            $wpUser->set_role($role);
        }

        if (isset($data['branch_ids']) && is_array($data['branch_ids'])) {
            $this->assignBranches(
                $userId,
                array_map('intval', $data['branch_ids']),
                isset($data['default_branch_id']) ? (int) $data['default_branch_id'] : null
            );
        }

        $fresh = get_userdata($userId);
        $primary = $this->primaryRole((array) ($fresh->roles ?? []));

        return [
            'id'         => $userId,
            'name'       => $fresh->display_name,
            'email'      => $fresh->user_email,
            'username'   => $fresh->user_login,
            'roles'      => $fresh->roles,
            'role_label' => $this->roleLabel($primary),
            'branches'   => $this->branchesFor($userId),
        ];
    }

    /**
     * @param list<int> $branchIds
     * @return list<array<string, mixed>>
     */
    public function assignBranches(int $userId, array $branchIds, ?int $defaultBranchId = null): array
    {
        $user = get_user_by('id', $userId);
        if (!$user) {
            throw new DomainException('User not found.');
        }

        global $wpdb;
        $wpdb->delete($this->db->table('user_branches'), ['user_id' => $userId]);

        foreach ($branchIds as $i => $branchId) {
            $this->db->insert('user_branches', [
                'user_id'    => $userId,
                'branch_id'  => (int) $branchId,
                'is_default' => ($defaultBranchId ? (int) $branchId === $defaultBranchId : $i === 0) ? 1 : 0,
            ]);
        }

        return $this->branchesFor($userId);
    }

    /**
     * @return array{sellers: list<array{id: int, name: string}>, engineers: list<array{id: int, name: string}>}
     */
    public function directory(?int $branchId = null): array
    {
        $sellers   = [];
        $engineers = [];
        foreach ($this->list() as $row) {
            $user = get_userdata((int) $row['id']);
            if (!$user) {
                continue;
            }
            $onBranch = $branchId === null
                || user_can($user, 'atoms_all_branches')
                || in_array($branchId, array_map(static fn ($b) => (int) $b['id'], $row['branches']), true);
            if (!$onBranch) {
                continue;
            }
            $entry = ['id' => (int) $row['id'], 'name' => (string) $row['name']];
            if (user_can($user, 'atoms_create_sale')) {
                $sellers[] = $entry;
            }
            if (user_can($user, 'atoms_manage_repairs')) {
                $engineers[] = $entry;
            }
        }

        return compact('sellers', 'engineers');
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function branchesFor(int $userId): array
    {
        global $wpdb;
        $ub = $this->db->table('user_branches');
        $b  = $this->db->table('branches');

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT b.* FROM {$b} b INNER JOIN {$ub} ub ON ub.branch_id = b.id WHERE ub.user_id = %d ORDER BY ub.is_default DESC, b.name",
                $userId
            ),
            ARRAY_A
        ) ?: [];
    }

    /**
     * @param list<string> $roles
     */
    private function primaryRole(array $roles): string
    {
        foreach ($roles as $role) {
            if (isset(Capabilities::ROLES[$role])) {
                return $role;
            }
        }

        return (string) ($roles[0] ?? '');
    }

    private function roleLabel(string $role): string
    {
        if ($role === 'administrator') {
            return 'WordPress Admin';
        }

        return Capabilities::ROLES[$role] ?? $role;
    }
}
