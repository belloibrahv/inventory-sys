import { prisma } from "@/lib/prisma"
import { shelfKey } from "@/lib/stock-limits"

/**
 * Every item-and-shop pair with any stock history: received, sold, moved,
 * counted. Used with isLowStock to tell "sold out" from "never stocked here".
 */
export async function stockedPairs(branchId?: string | null) {
  const rows = await prisma.stockMovement.groupBy({
    by: ["productId", "branchId"],
    where: branchId ? { branchId } : {},
  })
  return new Set(rows.map((row) => shelfKey(row.productId, row.branchId)))
}
