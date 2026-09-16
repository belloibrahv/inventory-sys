import type { PaperCompany } from "@/lib/letterhead"

export type ReportsPack = {
  company: PaperCompany
  scope: string
  preparedAt: string
  preparedBy: string
  statementRef: string
  periodLabel: string
  range: "day" | "week" | "month"
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
    revenue: number
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
  lowStock: Array<{ id: string; product: string; shop: string; quantity: number; min: number }>
}

export function reportsKpis(data: ReportsPack) {
  return [
    { label: "Total sales", value: data.totals.revenue, money: true },
    { label: "Total payments received", value: data.totals.collected, money: true },
    { label: "Approved expenses", value: data.totals.expenses, money: true },
    { label: "Inventory valuation (Cost)", value: data.totals.stock, money: true },
    { label: "Sales volume", value: data.totals.invoices, money: false },
    { label: "Receivables", value: data.totals.owing, money: true },
    { label: "Swap Deal value", value: data.totals.swaps, money: true },
    { label: "Returned products", value: data.totals.returns, money: false },
  ]
}
