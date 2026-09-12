import type { BooksCheck } from "@/app/actions/books-check"
import { formatWatLong } from "@/lib/lagos-day"

export function booksPeriodLabel(range: BooksCheck["range"], from: string, to: string) {
  if (range === "day") return formatWatLong(from)
  return `${formatWatLong(from)} to ${formatWatLong(to)}`
}

export function booksRangeTitle(range: BooksCheck["range"]) {
  if (range === "week") return "Money report for seven days"
  if (range === "month") return "Money report for this month so far"
  return "Money report for one day"
}

export function booksCompareRows(data: BooksCheck) {
  return [
    { label: "Money from sales", now: data.revenue, then: data.compare.priorRevenue, change: data.compare.revenue, money: true },
    { label: "Money we collected", now: data.collected, then: data.compare.priorCollected, change: data.compare.collected, money: true },
    { label: "Cash we collected", now: data.cash, then: data.compare.priorCash, change: data.compare.cash, money: true },
    { label: "Transfer we collected", now: data.transfer, then: data.compare.priorTransfer, change: data.compare.transfer, money: true },
    { label: "POS we collected", now: data.pos, then: data.compare.priorPos, change: data.compare.pos, money: true },
    { label: "Sales taken on credit", now: data.credit, then: data.compare.priorCredit, change: data.compare.credit, money: true },
    { label: "Money customers still owe", now: data.due, then: data.compare.priorDue, change: data.compare.due, money: true },
    { label: "Bills the boss approved", now: data.expenses, then: data.compare.priorExpenses, change: data.compare.expenses, money: true },
    { label: "All money that went out", now: data.moneyOut, then: data.compare.priorMoneyOut, change: data.compare.moneyOut, money: true },
    { label: "How many sales", now: data.salesCount, then: data.compare.priorCount, change: data.compare.count, money: false },
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
    { label: "Cash we collected", value: data.cash, total: false },
    { label: "Transfer we collected", value: data.transfer, total: false },
    { label: "POS we collected", value: data.pos, total: false },
    { label: "All three added together", value: data.methodSum, total: true },
    { label: "All money from sales", value: data.revenue, total: false },
    { label: "What customers have paid us", value: data.collected, total: false },
    { label: "What customers still owe", value: data.due, total: true },
    { label: "Sales taken on credit (full amount)", value: data.credit, total: false },
    { label: "Bills the boss approved", value: data.expenses, total: false },
    { label: "Money we sent to suppliers", value: data.purchasesPaid, total: false },
    { label: "All money that went out", value: data.moneyOut, total: true },
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
    cells("Money report"),
    cells("Report number", data.statementRef),
    cells("Shop", `${data.shopName} (${data.shopCode})`),
    cells("Time covered", period),
    cells("Compared with", compared),
    cells("Written by", data.preparedBy),
    cells("Written at (Lagos time)", data.preparedAt),
    cells("What the books say", data.verdict),
    [],
    cells("THIS TIME AGAINST LAST TIME"),
    cells("Line", "This time", "Last time", "Up or down", "Change"),
    ...booksCompareRows(data).map((row) => cells(row.label, row.now, row.then, row.change.amount, row.change.value)),
    [],
    cells("CHECKS ON THE BOOKS"),
    cells("Check", "Result", "Note"),
    ...data.papers.map((row) => cells(row.label, row.ok ? "Good" : "Needs work", row.detail)),
    [],
    cells("HOW THE MONEY ADDS UP"),
    cells("Line", "Amount"),
    ...booksMoneyLines(data).map((row) => cells(row.label, row.value)),
    [],
    cells("STILL NOT SETTLED"),
    cells("Customers still owe", data.customersOwe),
    cells("We still owe suppliers", data.supplierOwed),
    cells("Sales with no buyer name", data.walkIns),
    [],
    cells("WHO COLLECTED THE MONEY"),
    cells("Staff", "How many sales", "Money collected"),
    ...data.byStaff.map((row) => cells(row.name, row.count, row.collected)),
    [],
    cells("SALES"),
    cells("Invoice", "When", "Customer", "Staff", "Paid by", "Total", "Paid"),
    ...data.invoices.map((row) => cells(row.invoice, row.when, row.customer, row.staff, row.method, row.total, row.paid)),
    [],
    cells("DAYS WE CLOSED"),
    cells("Day", "Staff", "Should be", "We counted", "Short or plenty", "Sales"),
    ...data.closes.map((row) => cells(row.day, row.staff, row.expected, row.counted, row.variance, row.sales)),
    [],
    cells("IMEI LIST AGAINST SHOP COUNT"),
    cells("Item", "Shop count", "IMEIs", "Gap"),
    ...data.imeiRows.map((row) => cells(row.product, row.shopQty, row.imeis, row.delta)),
  ]
}
