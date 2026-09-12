/**
 * How low is "low stock" for one shelf line.
 *
 * If the item has its own minimum, use that. Otherwise use the shop-wide
 * threshold from Settings.
 */
export function lowStockLimit(minStock: number, threshold: number) {
  return minStock > 0 ? minStock : threshold
}
