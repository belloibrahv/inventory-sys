export type ReportsPack = {
  company: {
    name: string
    product: string
    phone: string
    address: string
    email: string
  }
  scope: string
  preparedAt: string
  preparedBy: string
  statementRef: string
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
    { label: "Money from sales", value: data.totals.revenue, money: true },
    { label: "Money we collected", value: data.totals.collected, money: true },
    { label: "Bills the boss approved", value: data.totals.expenses, money: true },
    { label: "What the stock cost us", value: data.totals.stock, money: true },
    { label: "How many sales", value: data.totals.invoices, money: false },
    { label: "Customers still owe us", value: data.totals.owing, money: true },
    { label: "Money from swaps", value: data.totals.swaps, money: true },
    { label: "Things brought back", value: data.totals.returns, money: false },
  ]
}
