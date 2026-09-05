<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class ShopIdentity
{
    /**
     * @param array<string, mixed> $ops
     * @return array{company: string, wordmark: string, accent: string, tagline: string}
     */
    public function of(array $ops): array
    {
        $company = trim((string) ($ops['company'] ?? ''));
        if ($company === '') {
            $company = 'Abu Twins Softskills Investment';
        }
        $wordmark = trim((string) ($ops['wordmark'] ?? ''));
        if ($wordmark === '') {
            $wordmark = $company;
        }

        return [
            'company'  => $company,
            'wordmark' => $wordmark,
            'accent'   => trim((string) ($ops['wordmark_accent'] ?? '')),
            'tagline'  => trim((string) ($ops['tagline'] ?? '')),
        ];
    }
}
