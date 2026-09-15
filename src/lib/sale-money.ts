import { money } from "@/lib/utils"

/**
 * How money on a sale is counted for the books.
 *
 * Credit sales = what is still owed (invoice minus already paid).
 * Cash / Transfer / POS = the payment lines, not the sale label.
 * A ₦180,000 sale with ₦120,000 transfer paid is Transfer received ₦120,000
 * and Credit sales ₦60,000, even though the sale itself is labelled CREDIT.
 */
export type SaleTenderRow = {
  paymentMethod: string
  totalAmount: unknown
  paidAmount: unknown
  payments?: Array<{ method: string; amount: unknown }> | null
}

export function saleTenders(sale: SaleTenderRow) {
  let cash = 0
  let transfer = 0
  let pos = 0
  const lines = sale.payments?.length ? sale.payments : null
  if (lines) {
    for (const payment of lines) {
      const amount = money(payment.amount)
      if (payment.method === "CASH") cash += amount
      else if (payment.method === "TRANSFER") transfer += amount
      else if (payment.method === "POS") pos += amount
    }
  } else {
    const paid = money(sale.paidAmount)
    if (sale.paymentMethod === "CASH") cash = paid
    else if (sale.paymentMethod === "TRANSFER") transfer = paid
    else if (sale.paymentMethod === "POS") pos = paid
  }

  const revenue = money(sale.totalAmount)
  const collected = money(sale.paidAmount)
  const credit = Math.max(0, revenue - collected)
  let received = cash + transfer + pos
  // Older credit sales may have a deposit on paidAmount with no payment rows.
  // Count that money in Total payments received, but do not guess the channel.
  if (received === 0 && collected > 0 && (sale.paymentMethod === "CREDIT" || sale.paymentMethod === "SPLIT_PAYMENT")) {
    received = collected
  }

  return { cash, transfer, pos, credit, revenue, collected, received }
}

export function sumSaleTenders(rows: SaleTenderRow[]) {
  return rows.reduce(
    (acc, sale) => {
      const row = saleTenders(sale)
      acc.cash += row.cash
      acc.transfer += row.transfer
      acc.pos += row.pos
      acc.credit += row.credit
      acc.revenue += row.revenue
      acc.collected += row.collected
      acc.received += row.received
      acc.count += 1
      return acc
    },
    { cash: 0, transfer: 0, pos: 0, credit: 0, revenue: 0, collected: 0, received: 0, count: 0 }
  )
}
