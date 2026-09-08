import type { IMEIStatus, Prisma } from "@prisma/client"

export type Tx = Prisma.TransactionClient

/**
 * Raised when a guarded write loses a race: the row moved between the moment we
 * read it and the moment we wrote it. Every caller runs inside a transaction, so
 * throwing this rolls the whole posting back and nothing half-lands.
 *
 * The message is shop wording, ready to hand straight back to staff.
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConflictError"
  }
}

/**
 * Run a posting and turn a lost race into the normal { error } shape instead of
 * a crash. Anything else still throws, so real faults stay loud.
 */
export async function settle<T>(run: () => Promise<T>): Promise<{ data: T } | { error: string }> {
  try {
    return { data: await run() }
  } catch (error) {
    if (error instanceof ConflictError) return { error: error.message }
    throw error
  }
}

/**
 * Move one tracked unit out of stock, but only if it is still In shop at this
 * branch. This is a single guarded UPDATE, so two tills cannot both win it.
 */
export async function claimImei(
  tx: Tx,
  input: {
    imeiId: string
    branchId: string
    label: string
    from?: IMEIStatus
    data: Prisma.ImeiRecordUncheckedUpdateManyInput
  }
) {
  const { count } = await tx.imeiRecord.updateMany({
    where: {
      id: input.imeiId,
      branchId: input.branchId,
      status: input.from ?? "IN_STOCK",
    },
    data: input.data,
  })
  if (count !== 1) {
    throw new ConflictError(
      `${input.label} was just taken by another till or moved out of this shop. Refresh and try again.`
    )
  }
}

/**
 * Same guard for a batch of units addressed by imei1. Every listed unit must
 * still be In shop at the sending branch, or the whole posting rolls back.
 */
export async function claimImeis(
  tx: Tx,
  input: {
    imei1s: string[]
    branchId: string
    from?: IMEIStatus
    data: Prisma.ImeiRecordUncheckedUpdateManyInput
  }
) {
  if (!input.imei1s.length) return
  const { count } = await tx.imeiRecord.updateMany({
    where: {
      imei1: { in: input.imei1s },
      branchId: input.branchId,
      status: input.from ?? "IN_STOCK",
    },
    data: input.data,
  })
  if (count !== input.imei1s.length) {
    throw new ConflictError(
      `${input.imei1s.length - count} of the phones on this list are no longer In shop here. Someone else moved or sold them while you were working. Refresh and build the list again.`
    )
  }
}

/**
 * Draw untracked pieces down. The quantity guard lives in the WHERE clause, so
 * stock can never be pushed below zero and no read-modify-write window exists.
 */
export async function drawStock(
  tx: Tx,
  input: { productId: string; branchId: string; quantity: number; label: string }
) {
  if (input.quantity <= 0) return
  const { count } = await tx.inventory.updateMany({
    where: {
      productId: input.productId,
      branchId: input.branchId,
      quantity: { gte: input.quantity },
    },
    data: { quantity: { decrement: input.quantity } },
  })
  if (count !== 1) {
    throw new ConflictError(
      `${input.label} no longer has ${input.quantity} in this shop. Someone else sold or moved it. Check the stock and try again.`
    )
  }
}

/** Put pieces back. Creates the branch row when the item has never been held here. */
export async function returnStock(
  tx: Tx,
  input: { productId: string; branchId: string; quantity: number }
) {
  if (input.quantity <= 0) return
  await tx.inventory.upsert({
    where: { productId_branchId: { productId: input.productId, branchId: input.branchId } },
    update: { quantity: { increment: input.quantity } },
    create: { productId: input.productId, branchId: input.branchId, quantity: input.quantity },
  })
}

/**
 * Move a customer's debt by delta and hand back the true balance after the move.
 * The database does the addition, so two clerks posting at once cannot overwrite
 * each other. Use the returned figure for the ledger line, never a figure read
 * before the write.
 */
export async function shiftCustomerBalance(tx: Tx, customerId: string, delta: number) {
  const updated = await tx.customer.update({
    where: { id: customerId },
    data: { currentBalance: { increment: delta } },
    select: { id: true, name: true, currentBalance: true, creditLimit: true, branchId: true },
  })
  return updated
}

/**
 * Add to what an invoice has been paid and hand back the fresh figures. Throws
 * if the collection would take the invoice past its own total, which is what a
 * double-submit or a two-clerk race looks like.
 */
export async function creditInvoice(tx: Tx, saleId: string, amount: number) {
  const updated = await tx.sale.update({
    where: { id: saleId },
    data: { paidAmount: { increment: amount } },
    select: { id: true, invoiceNumber: true, paidAmount: true, totalAmount: true, paymentMethod: true },
  })
  if (Number(updated.paidAmount) > Number(updated.totalAmount) + 0.005) {
    throw new ConflictError(
      `${updated.invoiceNumber} was already collected on while you were typing. Open the invoice again to see what is still owed.`
    )
  }
  return updated
}
