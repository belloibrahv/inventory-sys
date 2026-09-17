import type { Prisma } from "@prisma/client"
import { MARKED_PAID_ON_UPLOAD, OPENING_STOCK_METHOD } from "@/lib/upload-purchase"
import { displayPartyName, partyNameKey } from "@/lib/party-key"
import { formatCurrency, money } from "@/lib/utils"

/**
 * Opening stock is the shop's starting value. It is never money owed.
 * True opening bills are OPEN- invoices or rows with an OpeningStock record.
 * A supplier carton loaded on Upload stock is a normal bill, even when its
 * source is UPLOAD_STOCK.
 */
export function isOpeningStockPurchase(row: {
  invoiceNumber?: string | null
  notes?: string | null
  openingStock?: unknown
}): boolean {
  if (row.openingStock) return true
  if (String(row.invoiceNumber || "").startsWith("OPEN-")) return true
  return isTrueOpeningStockNotes(row.notes)
}

export function isTrueOpeningStockNotes(notes?: string | null) {
  const text = notes ?? ""
  return /opening stock/i.test(text) && /not a supplier bill/i.test(text)
}

/** +₦x when the house owes Abu Twins after stock return. */
export function formatValueOwingPlus(amount: number) {
  const n = Math.max(0, Number(amount) || 0)
  return n > 0 ? `+${formatCurrency(n)}` : formatCurrency(0)
}

/** -₦x when Abu Twins still owes the house. */
export function formatValueOwingMinus(amount: number) {
  const n = Math.max(0, Number(amount) || 0)
  return n > 0 ? `-${formatCurrency(n)}` : formatCurrency(0)
}

/** Balance cell: surplus as +, still owed as -. */
export function formatPurchaseBalanceCell(owed: number, surplus: number) {
  if (surplus > 0) return formatValueOwingPlus(surplus)
  if (owed > 0) return formatValueOwingMinus(owed)
  return formatCurrency(0)
}

/** What is still owed, or surplus the supplier owes us, after send-backs. */
export function purchaseBalance(total: unknown, paid: unknown, returned: unknown = 0) {
  const billed = money(total)
  const paidVal = money(paid)
  const sentBack = money(returned)
  const remaining = Math.max(0, billed - sentBack)
  const net = remaining - paidVal
  return {
    billed,
    paid: paidVal,
    sentBack,
    remaining,
    owed: Math.max(0, net),
    surplus: Math.max(0, -net),
  }
}

/** Prisma filter: supplier bills that can still be owed. */
export const payablePurchaseWhere: Prisma.PurchaseWhereInput = {
  status: { not: "CANCELLED" },
  invoiceNumber: { not: { startsWith: "OPEN-" } },
  openingStock: { is: null },
}

/**
 * Read the paid / unpaid state written on an Upload stock carton bill.
 * Heal used to overwrite every upload as opening stock. These notes are how
 * we put the real balance back.
 */
export function paymentFromUploadNotes(notes: string | null | undefined, total: number): {
  method: string
  paid: number
} {
  const text = notes ?? ""
  const totalSafe = money(total)
  if (isTrueOpeningStockNotes(text)) {
    return { method: OPENING_STOCK_METHOD, paid: totalSafe }
  }
  const partial = text.match(/partial payment of\s*₦?\s*([\d,]+(?:\.\d+)?)/i)
  if (partial) {
    const paid = money(Number(String(partial[1]).replace(/,/g, "")))
    return { method: "PARTIAL_PAYMENT", paid: Math.min(Math.max(0, paid), totalSafe) }
  }
  if (/unpaid invoice/i.test(text) || /not paid yet/i.test(text) || /nothing paid/i.test(text)) {
    return { method: "UNPAID", paid: 0 }
  }
  if (/paid in full/i.test(text) || /paid when the stock was loaded/i.test(text)) {
    return { method: "PAID_ON_UPLOAD", paid: totalSafe }
  }
  if (/marked as paid/i.test(text)) {
    return { method: MARKED_PAID_ON_UPLOAD, paid: totalSafe }
  }
  if (/\bpaid\b/i.test(text) && !/unpaid/i.test(text) && !/not paid/i.test(text) && !/partial/i.test(text)) {
    return { method: "PAID_ON_UPLOAD", paid: totalSafe }
  }
  return { method: "UNPAID", paid: 0 }
}

export type OwedBill = {
  id: string
  invoice: string
  supplier: string
  shop: string
  owed: number
}

export type OwedHouse = {
  key: string
  name: string
  owed: number
  bills: OwedBill[]
}

/** One house, then the bills inside it. IRIS and iris become one row. */
export function groupOwedHouses(rows: OwedBill[]): OwedHouse[] {
  const houses = new Map<string, OwedHouse>()
  for (const row of rows) {
    const key = partyNameKey(row.supplier) || displayPartyName(row.supplier) || row.id
    const existing = houses.get(key)
    if (existing) {
      existing.owed += row.owed
      existing.bills.push(row)
    } else {
      houses.set(key, {
        key,
        name: displayPartyName(row.supplier) || row.supplier,
        owed: row.owed,
        bills: [row],
      })
    }
  }
  return [...houses.values()].sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name))
}

export type SupplierLedgerBill = {
  supplierId: string
  supplierName: string
  creditBalance?: unknown
  totalAmount: unknown
  paidAmount: unknown
  returnedAmount?: unknown
}

export type SupplierLedger = {
  id: string
  name: string
  billed: number
  paid: number
  sentBack: number
  extraCredit: number
  owed: number
  surplus: number
}

/** One house: bills netted, then any leftover send-back credit that was not on a bill. */
export function groupSupplierLedgers(bills: SupplierLedgerBill[]): SupplierLedger[] {
  const houses = new Map<
    string,
    {
      id: string
      name: string
      bills: SupplierLedgerBill[]
      credits: Map<string, number>
    }
  >()
  for (const bill of bills) {
    const key = partyNameKey(bill.supplierName) || displayPartyName(bill.supplierName) || bill.supplierId
    const existing = houses.get(key)
    const credit = money(bill.creditBalance)
    if (existing) {
      existing.bills.push(bill)
      if (!existing.credits.has(bill.supplierId)) existing.credits.set(bill.supplierId, credit)
    } else {
      houses.set(key, {
        id: bill.supplierId,
        name: displayPartyName(bill.supplierName) || bill.supplierName,
        bills: [bill],
        credits: new Map([[bill.supplierId, credit]]),
      })
    }
  }
  return [...houses.values()]
    .map((house) => {
      let billed = 0
      let paid = 0
      let sentBack = 0
      let net = 0
      for (const bill of house.bills) {
        const bal = purchaseBalance(bill.totalAmount, bill.paidAmount, bill.returnedAmount)
        billed += bal.billed
        paid += bal.paid
        sentBack += bal.sentBack
        net += bal.remaining - bal.paid
      }
      const extraCredit = [...house.credits.values()].reduce((sum, value) => sum + value, 0)
      net -= extraCredit
      return {
        id: house.id,
        name: house.name,
        billed,
        paid,
        sentBack,
        extraCredit,
        owed: Math.max(0, net),
        surplus: Math.max(0, -net),
      }
    })
    .sort((a, b) => b.owed - a.owed || b.surplus - a.surplus || a.name.localeCompare(b.name))
}
