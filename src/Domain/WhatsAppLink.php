<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class WhatsAppLink
{
    public function digits(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (strlen($digits) === 11 && str_starts_with($digits, '0')) {
            $digits = '234' . substr($digits, 1);
        }

        return $digits;
    }

    public function chatUrl(string $phone, string $text): string
    {
        $to = $this->digits($phone);
        if ($to === '') {
            throw new DomainException('A WhatsApp destination number is required.');
        }

        return 'https://wa.me/' . $to . '?text=' . rawurlencode($text);
    }
}
