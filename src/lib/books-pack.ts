import type { BooksCheck } from "@/app/actions/books-check"
import { formatWatLong } from "@/lib/lagos-day"

export function booksPeriodLabel(range: BooksCheck["range"], from: string, to: string) {
  if (range === "day") return formatWatLong(from)
  return `${formatWatLong(from)} to ${formatWatLong(to)}`
}

export function booksRangeTitle(range: BooksCheck["range"]) {
  if (range === "week") return "Seven-day books"
  if (range === "month") return "Month-to-date books"
  return "Daily books"
}

export function booksCompareRows(data: BooksCheck) {
  return [
    { label: "Invoices posted", now: data.revenue, then: data.compare.priorRevenue, change: data.compare.revenue, money: true },
    { label: "Money collected", now: data.collected, then: data.compare.priorCollected, change: data.compare.collected, money: true },
    { label: "Cash collected", now: data.cash, then: data.compare.priorCash, change: data.compare.cash, money: true },
    { label: "Transfer collected", now: data.transfer, then: data.compare.priorTransfer, change: data.compare.transfer, money: true },
    { label: "POS collected", now: data.pos, then: data.compare.priorPos, change: data.compare.pos, money: true },
    { label: "Credit invoices", now: data.credit, then: data.compare.priorCredit, change: data.compare.credit, money: true },
    { label: "Still due on invoices", now: data.due, then: data.compare.priorDue, change: data.compare.due, money: true },
    { label: "Approved expenses", now: data.expenses, then: data.compare.priorExpenses, change: data.compare.expenses, money: true },
    { label: "Money out", now: data.moneyOut, then: data.compare.priorMoneyOut, change: data.compare.moneyOut, money: true },
    { label: "Completed sales", now: data.salesCount, then: data.compare.priorCount, change: data.compare.count, money: false },
  ]
}

export function booksMoneyLines(data: BooksCheck) {
  return [
    { label: "Cash collected", value: data.cash, total: false },
    { label: "Transfer collected", value: data.transfer, total: false },
    { label: "POS collected", value: data.pos, total: false },
    { label: "Money taken on those methods", value: data.methodSum, total: true },
    { label: "All invoices posted", value: data.revenue, total: false },
    { label: "Money collected on those invoices", value: data.collected, total: false },
    { label: "Still due on invoices", value: data.due, total: true },
    { label: "Credit invoices (full amount)", value: data.credit, total: false },
    { label: "Approved expenses", value: data.expenses, total: false },
    { label: "Paid to suppliers", value: data.purchasesPaid, total: false },
    { label: "Money out", value: data.moneyOut, total: true },
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
    cells("Official statement of account"),
    cells("Statement", data.statementRef),
    cells("Shop", `${data.shopName} (${data.shopCode})`),
    cells("Period", period),
    cells("Compared with", compared),
    cells("Prepared by", data.preparedBy),
    cells("Prepared at (Lagos)", data.preparedAt),
    cells("Verdict", data.verdict),
    [],
    cells("COMPARISON"),
    cells("Line", "This period", "Compared period", "Movement", "Change"),
    ...booksCompareRows(data).map((row) => cells(row.label, row.now, row.then, row.change.amount, row.change.value)),
    [],
    cells("WORKING PAPER"),
    cells("Check", "Result", "Note"),
    ...data.papers.map((row) => cells(row.label, row.ok ? "Pass" : "Needs work", row.detail)),
    [],
    cells("MONEY ADD-UP"),
    cells("Line", "Amount"),
    ...booksMoneyLines(data).map((row) => cells(row.label, row.value)),
    [],
    cells("BOOKS STILL OPEN"),
    cells("Customers still owe", data.customersOwe),
    cells("We still owe suppliers", data.supplierOwed),
    cells("Walk-in sales", data.walkIns),
    [],
    cells("WHO COLLECTED"),
    cells("Staff", "Sales", "Collected"),
    ...data.byStaff.map((row) => cells(row.name, row.count, row.collected)),
    [],
    cells("INVOICES"),
    cells("Invoice", "When", "Customer", "Staff", "Method", "Total", "Paid"),
    ...data.invoices.map((row) => cells(row.invoice, row.when, row.customer, row.staff, row.method, row.total, row.paid)),
    [],
    cells("TILL CLOSES"),
    cells("Day", "Staff", "Expected", "Counted", "Variance", "Sales"),
    ...data.closes.map((row) => cells(row.day, row.staff, row.expected, row.counted, row.variance, row.sales)),
    [],
    cells("IMEI VS SHOP COUNT"),
    cells("Product", "Shop qty", "IMEIs", "Gap"),
    ...data.imeiRows.map((row) => cells(row.product, row.shopQty, row.imeis, row.delta)),
  ]
}
