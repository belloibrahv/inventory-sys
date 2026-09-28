/**
 * How low is "low stock" for one shelf line.
 *
 * If the item has its own minimum, use that. Otherwise use the shop-wide
 * threshold from Settings.
 */
export function lowStockLimit(minStock: number, threshold: number) {
  return minStock > 0 ? minStock : threshold
}

/**
 * Low stock is about items a shop actually carries. Registering a name for
 * "All shops" puts an empty line on every shop, so without this every item a
 * shop never stocked read as low: Home counted 1,234 "items below the
 * low-stock warning" across shops that had not loaded stock yet.
 *
 * `everStocked` is true when the shop holds the item or has any stock history
 * for it (see stockedPairs), so a line that sold out still counts.
 */
export function isLowStock(
  row: { quantity: number; minStock: number; everStocked: boolean },
  threshold: number
) {
  return row.everStocked && row.quantity <= lowStockLimit(row.minStock, threshold)
}

/** The key stockedPairs uses for one item on one shop's shelf. */
export function shelfKey(productId: string, branchId: string) {
  return `${productId}:${branchId}`
}
