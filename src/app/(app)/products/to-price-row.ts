import type { getProducts } from "@/app/actions/catalog"
import type { PriceRow } from "@/app/(app)/products/price-list"
import { money } from "@/lib/utils"

/** Prisma Decimals turned into plain numbers before they cross to the browser. */
export function toPriceRow(product: Awaited<ReturnType<typeof getProducts>>[number]): PriceRow {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    brand: product.brand.name,
    color: product.color,
    storage: product.storage,
    tracking: product.tracking,
    condition: product.condition,
    costPrice: money(product.costPrice),
    minimumPrice: money(product.minimumPrice),
    sellingPrice: money(product.sellingPrice),
    warrantyDays: product.warrantyDays,
    units: product.inventory.reduce((sum, row) => sum + row.quantity, 0),
  }
}
