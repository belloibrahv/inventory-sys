<?php
declare(strict_types=1);

namespace Atoms\Services;

/** Unified Stock Central view — unit-tracked (IMEI/serial) and quantity stock. */
final class InventoryService
{
    public function __construct(
        private readonly ImeiService $imeis = new ImeiService(),
        private readonly StockService $stock = new StockService()
    ) {
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function stockCentral(?int $branchId = null): array
    {
        $unit = $this->imeis->stockByProduct($branchId);
        foreach ($unit as &$row) {
            $row['track_mode'] = (string) ($row['track_mode'] ?? 'imei');
        }
        unset($row);

        $qty = $this->stock->stockRows($branchId);
        foreach ($qty as &$row) {
            $row['track_mode'] = 'quantity';
        }
        unset($row);

        return array_merge($unit, $qty);
    }
}
