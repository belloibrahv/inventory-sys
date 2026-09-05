<?php
declare(strict_types=1);

namespace Atoms\Rest;

use Atoms\Domain\RateLimit;
use Atoms\Domain\RateLimited;

final class Guard
{
    public function assert(): void
    {
        $limit = new RateLimit();
        $uid   = get_current_user_id();
        $ip    = sanitize_text_field((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
        $key   = 'atoms_rl_' . $uid . '_' . md5($ip);
        $hits  = (int) get_transient($key);
        if (!$limit->allow($hits)) {
            throw new RateLimited('Too many requests. Wait a minute and try again.');
        }
        set_transient($key, $hits + 1, $limit->window());
    }
}
