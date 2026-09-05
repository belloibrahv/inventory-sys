<?php
declare(strict_types=1);

namespace Atoms\Services;

use Atoms\Domain\DomainException;
use Atoms\Domain\LedgerMath;
use Atoms\Domain\Money;
use Atoms\Support\Context;
use Atoms\Support\Db;

final class LedgerService
{
    public function __construct(
        private readonly Db $db = new Db(),
        private readonly Context $context = new Context(),
        private readonly LedgerMath $math = new LedgerMath()
    ) {
    }

    public function hasReference(string $partyType, int $partyId, string $referenceType): bool
    {
        global $wpdb;
        $table = $this->db->table('ledgers');
        $n     = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE party_type = %s AND party_id = %d AND reference_type = %s",
                $partyType,
                $partyId,
                $referenceType
            )
        );

        return $n > 0;
    }

    public function balance(string $partyType, int $partyId): Money
    {
        global $wpdb;
        $table = $this->db->table('ledgers');
        $val   = $wpdb->get_var(
            $wpdb->prepare(
                "SELECT balance_after FROM {$table} WHERE party_type = %s AND party_id = %d ORDER BY id DESC LIMIT 1",
                $partyType,
                $partyId
            )
        );

        return new Money($val === null ? 0 : (int) $val);
    }

    public function post(
        string $partyType,
        int $partyId,
        string $entryType,
        Money $amount,
        string $referenceType,
        int $referenceId,
        string $description,
        ?int $branchId = null
    ): array {
        if ($amount->isZero() || $amount->isNegative()) {
            throw new DomainException('Ledger amount must be greater than zero.');
        }

        return $this->db->transaction(function () use ($partyType, $partyId, $entryType, $amount, $referenceType, $referenceId, $description, $branchId) {
            $current = $this->balance($partyType, $partyId);
            $next    = $this->math->apply($current, $entryType, $amount);
            $id      = $this->db->insert('ledgers', [
                'party_type'     => $partyType,
                'party_id'       => $partyId,
                'entry_type'     => $entryType,
                'amount'         => $amount->minor(),
                'balance_after'  => $next->minor(),
                'reference_type' => $referenceType,
                'reference_id'   => $referenceId,
                'description'    => $description,
                'branch_id'      => $branchId,
                'posted_by'      => $this->context->userId(),
                'posted_at'      => $this->db->now(),
            ]);

            return $this->db->find('ledgers', $id);
        });
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function entries(string $partyType, int $partyId): array
    {
        global $wpdb;
        $table = $this->db->table('ledgers');

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE party_type = %s AND party_id = %d ORDER BY id DESC LIMIT 200",
                $partyType,
                $partyId
            ),
            ARRAY_A
        ) ?: [];
    }
}
