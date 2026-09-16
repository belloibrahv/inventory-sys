import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { OPENING_STOCK_METHOD, UPLOAD_STOCK_SOURCE } from "@/lib/upload-purchase"
import {
  isTrueOpeningStockNotes,
  paymentFromUploadNotes,
} from "@/lib/purchase-money"
import { money } from "@/lib/utils"

/**
 * Opening stock must never sit as money owed. Older loads could save UNPAID
 * and post a supplier payment. This puts those bills back to value only.
 *
 * Supplier carton uploads share the UPLOAD_STOCK source. They are not opening
 * stock. If an earlier heal marked them paid as opening stock, this restores
 * the paid / unpaid state from the bill notes so Reports and Money in and out
 * show the same balance as Goods from supplier.
 */
export const healOpeningStockBills = cache(async () => {
  await restoreMisclassifiedSupplierBills()

  const bills = await prisma.purchase.findMany({
    where: {
      status: { not: "CANCELLED" },
      OR: [
        { invoiceNumber: { startsWith: "OPEN-" } },
        { openingStock: { isNot: null } },
      ],
    },
    select: { id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, paymentMethod: true },
  })
  const refs: string[] = []
  for (const bill of bills) {
    const total = money(bill.totalAmount)
    if (bill.paymentMethod === OPENING_STOCK_METHOD && Math.abs(money(bill.paidAmount) - total) < 0.005) {
      refs.push(bill.invoiceNumber)
      continue
    }
    await prisma.purchase.update({
      where: { id: bill.id },
      data: {
        paymentMethod: OPENING_STOCK_METHOD,
        paidAmount: total.toFixed(2),
      },
    })
    refs.push(bill.invoiceNumber)
  }
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

async function restoreMisclassifiedSupplierBills() {
  const rows = await prisma.purchase.findMany({
    where: {
      source: UPLOAD_STOCK_SOURCE,
      paymentMethod: OPENING_STOCK_METHOD,
      status: { not: "CANCELLED" },
      invoiceNumber: { not: { startsWith: "OPEN-" } },
      openingStock: { is: null },
    },
    select: {
      id: true,
      invoiceNumber: true,
      notes: true,
      totalAmount: true,
      branchId: true,
    },
  })

  for (const row of rows) {
    if (isTrueOpeningStockNotes(row.notes)) continue
    const restored = paymentFromUploadNotes(row.notes, money(row.totalAmount))
    if (restored.method === OPENING_STOCK_METHOD) continue
    await prisma.purchase.update({
      where: { id: row.id },
      data: {
        paymentMethod: restored.method,
        paidAmount: restored.paid.toFixed(2),
      },
    })
    if (restored.paid <= 0.005) continue
    const exists = await prisma.financeEntry.findFirst({
      where: {
        account: "SUPPLIER_PAYMENTS",
        type: "EXPENSE",
        reference: row.invoiceNumber,
      },
      select: { id: true },
    })
    if (exists) continue
    await prisma.financeEntry.create({
      data: {
        branchId: row.branchId,
        account: "SUPPLIER_PAYMENTS",
        type: "EXPENSE",
        amount: restored.paid.toFixed(2),
        reference: row.invoiceNumber,
        description: `Supplier payment on upload for ${row.invoiceNumber}`,
      },
    })
  }
}
