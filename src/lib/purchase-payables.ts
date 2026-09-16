import type { Prisma } from "@prisma/client"

/** Prisma filter: supplier bills that can still be owed. Opening stock is excluded. */
export const payablePurchaseWhere: Prisma.PurchaseWhereInput = {
  status: { not: "CANCELLED" },
  invoiceNumber: { not: { startsWith: "OPEN-" } },
  openingStock: { is: null },
}
