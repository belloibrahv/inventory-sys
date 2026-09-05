<?php
declare(strict_types=1);

namespace Atoms\Domain;

/**
 * Colour / storage is what staff see. Quantity is a count of IMEIs of that variant.
 */
final class VariantLabel
{
    /**
     * @param array<string, mixed>|null $variant
     */
    public function format(?array $variant): string
    {
        if (!$variant) {
            return '';
        }
        $named = trim((string) ($variant['variant_name'] ?? ''));
        if ($named !== '') {
            return $named;
        }
        $color   = trim((string) ($variant['color'] ?? ''));
        $storage = trim((string) ($variant['storage'] ?? ''));
        if ($color !== '' && $storage !== '') {
            return $color . ' / ' . $storage;
        }

        return $color !== '' ? $color : $storage;
    }

    /**
     * Variant minimum wins when set. Zero means “use the product floor”.
     *
     * @param array<string, mixed>      $product
     * @param array<string, mixed>|null $variant
     */
    public function minimum(array $product, ?array $variant): Money
    {
        $fromVariant = (int) ($variant['min_selling_price'] ?? 0);
        if ($fromVariant > 0) {
            return new Money($fromVariant);
        }

        return new Money((int) ($product['min_selling_price'] ?? 0));
    }
}
