import type { Prisma } from "@prisma/client"
import { money } from "@/lib/utils"

export const UPLOAD_STOCK_SOURCE = "UPLOAD_STOCK"
export const MARKED_PAID_ON_UPLOAD = "MARKED_PAID_ON_UPLOAD"

type Tx = Prisma.TransactionClient

/**
 * Add or grow a purchase line and bump the bill total.
 * If the upload bill was started as paid, keep paidAmount in step with totalAmount.
 */
export async function attachPurchaseLine(
  tx: Tx,
  input: {
    purchaseId: string
    productId: string
    quantity: number
    costPrice: number
    markedPaid: boolean
  }
) {
  const qty = input.quantity
  const cost = input.costPrice
  const lineTotal = qty * cost

  const existing = await tx.purchaseItem.findFirst({
    where: { purchaseId: input.purchaseId, productId: input.productId },
  })

  if (existing) {
    const nextQty = existing.quantity + qty
    const nextReceived = existing.receivedQty + qty
    const nextLine = money(existing.totalAmount) + lineTotal
    // Weighted average cost so the line still makes sense if costs differ slightly.
    const nextCost = nextQty > 0 ? nextLine / nextQty : cost
    await tx.purchaseItem.update({
      where: { id: existing.id },
      data: {
        quantity: nextQty,
        receivedQty: nextReceived,
        costPrice: nextCost.toFixed(2),
        totalAmount: nextLine.toFixed(2),
      },
    })
  } else {
    await tx.purchaseItem.create({
      data: {
        purchaseId: input.purchaseId,
        productId: input.productId,
        quantity: qty,
        receivedQty: qty,
        costPrice: cost.toFixed(2),
        totalAmount: lineTotal.toFixed(2),
      },
    })
  }

  await tx.purchase.update({
    where: { id: input.purchaseId },
    data: {
      totalAmount: { increment: lineTotal },
      ...(input.markedPaid ? { paidAmount: { increment: lineTotal } } : {}),
    },
  })

  return lineTotal
}

export function isMarkedPaidOnUpload(paymentMethod: string | null | undefined) {
  return paymentMethod === MARKED_PAID_ON_UPLOAD
}
