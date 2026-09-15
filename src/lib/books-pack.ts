import type { BooksCheck } from "@/app/actions/books-check"
import { formatWatLong } from "@/lib/lagos-day"

export function booksPeriodLabel(range: BooksCheck["range"], from: string, to: string) {
  if (range === "day") return formatWatLong(from)
  return `${formatWatLong(from)} to ${formatWatLong(to)}`
}

export function booksRangeTitle(range: BooksCheck["range"]) {
  if (range === "week") return "Financial Audit Statement (Trailing 7 Days)"
  if (range === "month") return "Financial Audit Statement (Month to Date)"
  return "Financial Audit Statement (Single Business Day)"
}

export function booksCompareRows(data: BooksCheck) {
  return [
    { label: "Total sales", now: data.revenue, then: data.compare.priorRevenue, change: data.compare.revenue, money: true },
    { label: "Total payments received", now: data.collected, then: data.compare.priorCollected, change: data.compare.collected, money: true },
    { label: "Cash received", now: data.cash, then: data.compare.priorCash, change: data.compare.cash, money: true },
    { label: "Transfer received", now: data.transfer, then: data.compare.priorTransfer, change: data.compare.transfer, money: true },
    { label: "POS received", now: data.pos, then: data.compare.priorPos, change: data.compare.pos, money: true },
    { label: "Credit sales", now: data.credit, then: data.compare.priorCredit, change: data.compare.credit, money: true },
    { label: "Receivables", now: data.due, then: data.compare.priorDue, change: data.compare.due, money: true },
    { label: "Approved expenses", now: data.expenses, then: data.compare.priorExpenses, change: data.compare.expenses, money: true },
    { label: "Total expenditure", now: data.moneyOut, then: data.compare.priorMoneyOut, change: data.compare.moneyOut, money: true },
    { label: "Sales volume", now: data.salesCount, then: data.compare.priorCount, change: data.compare.count, money: false },
  ]
}

export function formatPdfMoney(value: number) {
  const n = Math.round(Number.isFinite(value) ? value : 0)
  const digits = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.abs(n))
  return `${n < 0 ? "-" : ""}NGN ${digits}`
}

export function formatPdfMove(change: { amount: number; value: string }, money: boolean) {
  const amount = money ? formatPdfMoney(change.amount) : `${change.amount > 0 ? "+" : ""}${change.amount}`
  if (change.value === "0") return amount
  if (change.value === "New") return `${amount} (new)`
  return `${amount} (${change.value})`
}

export function booksMoneyLines(data: BooksCheck) {
  return [
    { label: "Cash received", value: data.cash, total: false },
    { label: "Transfer received", value: data.transfer, total: false },
    { label: "POS received", value: data.pos, total: false },
    { label: "Total payments received", value: data.methodSum, total: true },
    { label: "Total sales", value: data.revenue, total: false },
    { label: "Payment received from sales", value: data.collected, total: false },
    { label: "Receivables", value: data.due, total: true },
    { label: "Credit sales", value: data.credit, total: false },
    { label: "Approved expenses", value: data.expenses, total: false },
    { label: "Suppliers payment", value: data.purchasesPaid, total: false },
    { label: "Total expenditure", value: data.moneyOut, total: true },
  ]
}

function cells(...values: unknown[]) {
  return values.map((value) => (value == null ? "" : String(value)))
}

export function booksCsvRows(data: BooksCheck): string[][] {
  const period = booksPeriodLabel(data.range, data.from, data.to)
  const compared = booksPeriodLabel(data.range, data.priorFrom, data.priorTo)
  return [
    cells(data.company.product || data.company.name),
    cells("Financial Audit Statement"),
    cells("Statement Ref", data.statementRef),
    cells("Shop Location", `${data.shopName} (${data.shopCode})`),
    cells("Period Covered", period),
    cells("Comparative Period", compared),
    cells("Prepared By", data.preparedBy),
    cells("Prepared At (WAT)", data.preparedAt),
    cells("Auditor's Assessment", data.verdict),
    [],
    cells("COMPARATIVE PERFORMANCE ANALYSIS"),
    cells("Line", "Current Period", "Comparative Period", "Variance (Amount)", "Variance (%)"),
    ...booksCompareRows(data).map((row) => cells(row.label, row.now, row.then, row.change.amount, row.change.value)),
    [],
    cells("INTERNAL AUDIT CONTROLS & VERIFICATIONS"),
    cells("Audit Check", "Status", "Findings / Notes"),
    ...data.papers.map((row) => cells(row.label, row.ok ? "Verified" : "Discrepancy", row.detail)),
    [],
    cells("FINANCIAL RECONCILIATION SUMMARY"),
    cells("Line", "Amount"),
    ...booksMoneyLines(data).map((row) => cells(row.label, row.value)),
    [],
    cells("OUTSTANDING RECEIVABLES & PAYABLES"),
    cells("Receivables", data.customersOwe),
    cells("Suppliers payment (Payables balance)", data.supplierOwed),
    cells("Walk-in transactions (Unregistered)", data.walkIns),
    [],
    cells("PAYMENTS RECEIVED BY STAFF"),
    cells("Staff", "Sales volume", "Total payments received"),
    ...data.byStaff.map((row) => cells(row.name, row.count, row.collected)),
    [],
    cells("SALES LEDGER"),
    cells("Invoice", "When", "Customer", "Staff", "Paid by", "Total", "Paid"),
    ...data.invoices.map((row) => cells(row.invoice, row.when, row.customer, row.staff, row.method, row.total, row.paid)),
    [],
    cells("BUSINESS DAY REGISTERS CLOSED"),
    cells("Day", "Staff", "Total sales for the day", "Cash expected", "Cash remitted", "Shortage / Overage", "Sales"),
    ...data.closes.map((row) => cells(row.day, row.staff, row.totalSales ?? row.expected, row.expected, row.counted, row.variance, row.sales)),
    [],
    cells("SERIALIZED STOCK INVENTORY RECONCILIATION"),
    cells("Item", "Shop count", "IMEIs", "Gap"),
    ...data.imeiRows.map((row) => cells(row.product, row.shopQty, row.imeis, row.delta)),
  ]
}
