<?php
declare(strict_types=1);

namespace Atoms\Rest;

use Atoms\Domain\DomainException;
use Atoms\Domain\RateLimited;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

final class Http
{
    public static function ok(mixed $data, int $status = 200): WP_REST_Response
    {
        return new WP_REST_Response(['ok' => true, 'data' => $data], $status);
    }

    public static function error(\Throwable $e, int $status = 400): WP_Error
    {
        if ($e instanceof RateLimited) {
            return new WP_Error('atoms_rate', $e->getMessage(), ['status' => 429]);
        }
        $code = $e instanceof DomainException ? 'atoms_domain' : 'atoms_error';
        return new WP_Error($code, $e->getMessage(), ['status' => $status]);
    }

    /**
     * Run a mutating handler once per client idempotency key (offline outbox safety).
     *
     * @template T
     * @param callable():T $producer
     * @return T
     */
    public static function once(WP_REST_Request $request, string $route, callable $producer): mixed
    {
        $key = self::idempotencyKey($request);
        if ($key === '') {
            return $producer();
        }

        return (new \Atoms\Services\IdempotencyStore())->once($key, $route, $producer);
    }

    public static function idempotencyKey(WP_REST_Request $request): string
    {
        $header = (string) $request->get_header('x_idempotency_key');
        if ($header === '') {
            $header = (string) $request->get_header('X-Idempotency-Key');
        }
        $body = self::json($request);
        $fromBody = (string) ($body['client_id'] ?? '');
        $raw = $header !== '' ? $header : $fromBody;

        return (new \Atoms\Services\IdempotencyStore())->normalize($raw);
    }

    /**
     * @return array<string, mixed>
     */
    public static function json(WP_REST_Request $request): array
    {
        $params = $request->get_json_params();
        return is_array($params) ? $params : [];
    }

    public static function can(string $cap): callable
    {
        return static function () use ($cap) {
            return current_user_can('atoms_access') && current_user_can($cap);
        };
    }

    /**
     * @param list<string> $caps
     */
    public static function canAny(array $caps): callable
    {
        return static function () use ($caps) {
            if (!current_user_can('atoms_access')) {
                return false;
            }
            foreach ($caps as $cap) {
                if (current_user_can($cap)) {
                    return true;
                }
            }

            return false;
        };
    }
}
