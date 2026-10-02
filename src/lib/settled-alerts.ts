import { prisma } from "@/lib/prisma"
import { dueAfterReturns, returnedValueBySale } from "@/lib/returned-value"

const RETURN_NO = /\bRTN-[A-Z0-9]+-[A-Z0-9]+\b/
const SWAP_NO = /\bSWP-[A-Z0-9]+-[A-Z0-9]+\b/
const INVOICE_NO = /\bINV-[A-Z0-9]+-[A-Z0-9]+\b/

/**
 * Put away this person's alerts whose work is already done.
 *
 * "A return is waiting for you to say yes" goes to every manager, the CEO and
 * the main admins. Once one of them decided it, everyone else's alert still
 * said it was waiting, and opening it only met "Somebody has already decided
 * on this one", which read as being unable to accept. The same went for "still
 * owes" alerts on invoices since paid. An alert is put away (read) once:
 * - its return or Swap Deal is no longer waiting for a yes, or
 * - its invoice has nothing left to pay after refunds and credit notes.
 */
export async function settleDoneAlerts(userId: string) {
  const open = await prisma.notification.findMany({
    where: { userId, status: "UNREAD", type: { in: ["APPROVAL_REQUEST", "DUE_PAYMENT"] } },
    select: { id: true, type: true, message: true },
  })
  if (open.length === 0) return

  const numberIn = (text: string, pattern: RegExp) => text.match(pattern)?.[0] ?? null
  const returnNos = new Set<string>()
  const swapNos = new Set<string>()
  const invoiceNos = new Set<string>()
  for (const row of open) {
    if (row.type === "APPROVAL_REQUEST") {
      const rtn = numberIn(row.message, RETURN_NO)
      const swp = numberIn(row.message, SWAP_NO)
      if (rtn) returnNos.add(rtn)
      if (swp) swapNos.add(swp)
    } else {
      const inv = numberIn(row.message, INVOICE_NO)
      if (inv) invoiceNos.add(inv)
    }
  }

  const [returns, swaps, sales] = await Promise.all([
    returnNos.size
      ? prisma.stockReturn.findMany({ where: { returnNumber: { in: [...returnNos] } }, select: { returnNumber: true, status: true } })
      : [],
    swapNos.size
      ? prisma.swap.findMany({ where: { swapNumber: { in: [...swapNos] } }, select: { swapNumber: true, status: true } })
      : [],
    invoiceNos.size
      ? prisma.sale.findMany({
          where: { invoiceNumber: { in: [...invoiceNos] } },
          select: { id: true, invoiceNumber: true, status: true, totalAmount: true, paidAmount: true },
        })
      : [],
  ])
  const returned = await returnedValueBySale(prisma, sales.map((sale) => sale.id))

  const done = new Set<string>()
  for (const row of returns) if (row.status !== "PENDING") done.add(row.returnNumber)
  for (const row of swaps) if (row.status !== "PENDING") done.add(row.swapNumber)
  for (const sale of sales) {
    if (sale.status !== "COMPLETED" || dueAfterReturns(sale, returned.get(sale.id) ?? 0) <= 0.005) {
      done.add(sale.invoiceNumber)
    }
  }
  if (done.size === 0) return

  const settled = open
    .filter((row) => {
      const pattern = row.type === "DUE_PAYMENT" ? [INVOICE_NO] : [RETURN_NO, SWAP_NO]
      return pattern.some((re) => {
        const no = numberIn(row.message, re)
        return no != null && done.has(no)
      })
    })
    .map((row) => row.id)
  if (settled.length === 0) return
  await prisma.notification.updateMany({
    where: { id: { in: settled }, userId, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  })
}
