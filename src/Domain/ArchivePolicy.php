<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * Posted money and stock never delete. Catalog rows archive when they leave the floor.
 */
final class ArchivePolicy
{
    /**
     * @return list<string>
     */
    public function catalogEntities(): array
    {
        return ['products', 'customers', 'suppliers'];
    }

    public function canArchive(string $entity): bool
    {
        return in_array($entity, $this->catalogEntities(), true);
    }
}
