import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { OPENING_STOCK_METHOD, UPLOAD_STOCK_SOURCE } from "@/lib/upload-purchase"
import { money } from "@/lib/utils"

/**
 * Opening stock must never sit as money owed. Older loads could save UNPAID
 * and post a supplier payment. This puts those bills back to value only.
 */
export const healOpeningStockBills = cache(async () => {
  const bills = await prisma.purchase.findMany({
    where: {
      status: { not: "CANCELLED" },
      OR: [
        { source: UPLOAD_STOCK_SOURCE },
        { paymentMethod: OPENING_STOCK_METHOD },
        { invoiceNumber: { startsWith: "OPEN-" } },
        { openingStock: { isNot: null } },
      ],
    },
    select: { id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, paymentMethod: true },
  })
  for (const bill of bills) {
    const total = money(bill.totalAmount)
    if (bill.paymentMethod === OPENING_STOCK_METHOD && Math.abs(money(bill.paidAmount) - total) < 0.005) continue
    await prisma.purchase.update({
      where: { id: bill.id },
      data: {
        paymentMethod: OPENING_STOCK_METHOD,
        paidAmount: total.toFixed(2),
      },
    })
  }
  const refs = bills.map((bill) => bill.invoiceNumber).filter(Boolean)
  if (refs.length) {
    await prisma.financeEntry.deleteMany({
      where: {
        account: "SUPPLIER_PAYMENTS",
        type: "EXPENSE",
        reference: { in: refs },
      },
    })
  }
})
