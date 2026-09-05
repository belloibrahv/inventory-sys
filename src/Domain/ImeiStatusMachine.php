<?php
declare(strict_types=1);

namespace Atoms\Domain;

final class ImeiStatusMachine
{
    /**
     * Allowed transitions keyed by event.
     *
     * @var array<string, array<string, string>>
     */
    private const TRANSITIONS = [
        'purchase_received'  => ['available' => 'available'],
        'confirm_inbound'    => ['reserved' => 'available'],
        'reserve_for_sale'   => ['available' => 'reserved'],
        'release_reserve'    => ['reserved' => 'available'],
        'complete_sale'      => ['reserved' => 'sold', 'available' => 'sold'],
        'return_good'        => ['sold' => 'available'],
        'return_faulty'      => ['sold' => 'faulty'],
        'return_warranty'    => ['sold' => 'under_repair'],
        'return_exchange'    => ['sold' => 'available'],
        'send_to_repair'     => ['faulty' => 'under_repair', 'available' => 'under_repair', 'returned' => 'under_repair', 'sold' => 'under_repair'],
        'repair_complete'    => ['under_repair' => 'available'],
        'repair_return_customer' => ['under_repair' => 'sold'],
        'repair_unfixable'   => ['under_repair' => 'faulty'],
        'transfer_dispatch'  => ['available' => 'transferred'],
        'transfer_receive'   => ['transferred' => 'available'],
        'transfer_cancel'    => ['transferred' => 'available'],
        'swap_in'            => ['available' => 'available'],
        'swap_out'           => ['available' => 'sold', 'reserved' => 'sold'],
        'supplier_return'    => ['available' => 'disposed', 'faulty' => 'disposed'],
        'dispose'            => ['faulty' => 'disposed', 'available' => 'disposed'],
        'count_missing'      => ['available' => 'disposed', 'faulty' => 'disposed'],
        'mark_faulty'        => ['available' => 'faulty', 'returned' => 'faulty'],
        'mark_available'     => ['returned' => 'available', 'faulty' => 'available'],
    ];

    public function canTransition(ImeiStatus $from, string $event): bool
    {
        $map = self::TRANSITIONS[$event] ?? null;
        if ($map === null) {
            return false;
        }

        return isset($map[$from->value]);
    }

    public function apply(ImeiStatus $from, string $event): ImeiStatus
    {
        if (!$this->canTransition($from, $event)) {
            throw new DomainException(
                sprintf('IMEI cannot move from "%s" via event "%s".', $from->value, $event)
            );
        }

        $target = self::TRANSITIONS[$event][$from->value];

        return ImeiStatus::from($target);
    }

    /**
     * @return list<string>
     */
    public function allowedEvents(ImeiStatus $from): array
    {
        $allowed = [];
        foreach (self::TRANSITIONS as $event => $map) {
            if (isset($map[$from->value])) {
                $allowed[] = $event;
            }
        }

        return $allowed;
    }
}
