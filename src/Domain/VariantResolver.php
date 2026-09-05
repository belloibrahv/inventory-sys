<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * Pick the colour/storage row when registering or importing an IMEI.
 */
final class VariantResolver
{
    /**
     * @param list<array<string, mixed>> $variants
     */
    public function resolve(array $variants, string $color = '', string $storage = ''): ?int
    {
        $active = array_values(array_filter(
            $variants,
            static fn(array $variant): bool => (int) ($variant['is_active'] ?? 1) === 1
        ));
        if ($active === []) {
            return null;
        }

        $color   = trim($color);
        $storage = trim($storage);
        if ($color === '' && $storage === '') {
            if (count($active) === 1) {
                return (int) $active[0]['id'];
            }

            throw new DomainException('Product has multiple variants — specify color and storage on the IMEI row.');
        }

        foreach ($active as $variant) {
            $matchColor = $color === '' || strcasecmp(trim((string) ($variant['color'] ?? '')), $color) === 0;
            $matchStorage = $storage === '' || strcasecmp(trim((string) ($variant['storage'] ?? '')), $storage) === 0;
            if ($matchColor && $matchStorage) {
                return (int) $variant['id'];
            }
        }

        throw new DomainException(sprintf(
            'No variant matches %s / %s for this product.',
            $color !== '' ? $color : '—',
            $storage !== '' ? $storage : '—'
        ));
    }
}
