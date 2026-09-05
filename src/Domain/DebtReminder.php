<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class DebtReminder
{
    public function text(string $name, string $company, string $formattedBalance): string
    {
        $who = trim($name) !== '' ? trim($name) : 'customer';
        $shop = trim($company) !== '' ? trim($company) : 'the shop';

        return sprintf(
            'Hello %s, your balance at %s is %s. Please pay at the shop. This does not change any posted invoice.',
            $who,
            $shop,
            $formattedBalance
        );
    }
}
