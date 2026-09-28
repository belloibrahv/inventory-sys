import type { PaperCompany } from "@/lib/letterhead"

export type ReportsPack = {
  company: PaperCompany
  scope: string
  preparedAt: string
  preparedBy: string
  statementRef: string
  periodLabel: string
  range: "day" | "week" | "month"
  /**
   * What the stock figure is worth at. Cost for the CEO; at sell price for
   * everyone else, who may not see what items cost us.
   */
  stockBasis: "cost" | "sell"
  from: string
  to: string
  compare: {
    from: string
    to: string
    revenue: number
    collected: number
    expenses: number
  }
  totals: {
    /** Gross: every invoice in the period, as written. */
    revenue: number
    /** Value taken back on refunds and credit notes finished in the period. */
    salesReturns: number
    collected: number
    expenses: number
    stock: number
    invoices: number
    owing: number
    swaps: number
    returns: number
  }
  byShop: Array<{ name: string; tickets: number; revenue: number; collected: number }>
  debtors: Array<{ id: string; name: string; shop: string; amount: number }>
  creditors: Array<{ id: string; invoice: string; supplier: string; shop: string; owed: number }>
  supplierCredits: Array<{ id: string; invoice: string; supplier: string; shop: string; owed: number }>
  lowStock: Array<{ id: string; product: string; shop: string; quantity: number; min: number }>
}

export function reportsKpis(data: ReportsPack) {
  return [
    { label: "Total sales", value: data.totals.revenue, money: true },
    { label: "Sales returns", value: data.totals.salesReturns, money: true },
    { label: "Net sales", value: data.totals.revenue - data.totals.salesReturns, money: true },
    { label: "Total payments received", value: data.totals.collected, money: true },
    { label: "Approved expenses", value: data.totals.expenses, money: true },
    { label: data.stockBasis === "cost" ? "Stock at cost" : "Stock at sell price", value: data.totals.stock, money: true },
    { label: "Customers still owe", value: data.totals.owing, money: true },
    { label: "Swap Deal value", value: data.totals.swaps, money: true },
  ]
}
