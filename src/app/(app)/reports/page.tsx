import Link from "next/link"
import { getReportData } from "@/app/actions/finance"
import { ExportCsv } from "@/components/export-csv"
import { PageHeader } from "@/components/shared"
import { PrintButton } from "@/components/print-button"
import { getAppSettings, lowStockLimit } from "@/lib/settings"
import { formatCurrency, money } from "@/lib/utils"

export default async function ReportsPage() {
  const [data, settings] = await Promise.all([getReportData(), getAppSettings()])
  const revenue = data.sales.reduce((sum, sale) => sum + money(sale.totalAmount), 0)
  const collected = data.sales.reduce((sum, sale) => sum + money(sale.paidAmount), 0)
  const expense = data.expenses.reduce((sum, row) => sum + money(row.amount), 0)
  const stock = data.inventory.reduce((sum, row) => sum + row.quantity * money(row.product.costPrice), 0)
  const swapValue = data.swaps.reduce((sum, row) => sum + money(row.balanceAmount), 0)
  const owing = data.debtors.reduce((sum, row) => sum + money(row.currentBalance), 0)
  const lowStock = data.inventory.filter((row) => row.quantity <= lowStockLimit(row.minStock, settings.lowStockThreshold))

  const byBranch = Object.values(
    data.sales.reduce<Record<string, { name: string; revenue: number; collected: number; tickets: number }>>((acc, sale) => {
      const key = sale.branch.id
      acc[key] = acc[key] ?? { name: sale.branch.name, revenue: 0, collected: 0, tickets: 0 }
      acc[key].revenue += money(sale.totalAmount)
      acc[key].collected += money(sale.paidAmount)
      acc[key].tickets += 1
      return acc
    }, {})
  ).sort((a, b) => b.revenue - a.revenue)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Today’s real numbers: sales, money collected, stock, swaps, returns, and what people still owe."
        actions={
          <div className="flex gap-2">
            <PrintButton label="Print report" />
            <ExportCsv
              filename="abutwins-sales.csv"
              label="Export sales CSV"
              rows={[
                ["Invoice", "Customer", "Branch", "Total", "Paid", "Due", "Date"],
                ...data.sales.map((sale) => [
                  sale.invoiceNumber,
                  sale.customer?.name ?? "Walk-in",
                  sale.branch.code,
                  String(money(sale.totalAmount)),
                  String(money(sale.paidAmount)),
                  String(money(sale.totalAmount) - money(sale.paidAmount)),
                  new Date(sale.saleDate).toISOString().slice(0, 10),
                ]),
              ]}
            />
          </div>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Revenue posted", formatCurrency(revenue)],
          ["Collected", formatCurrency(collected)],
          ["Expenses", formatCurrency(expense)],
          ["Stock at cost", formatCurrency(stock)],
        ].map(([label, value]) => (
          <div key={label} className="surface-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Completed invoices</p>
          <p className="text-3xl font-semibold">{data.sales.length}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Still owed</p>
          <p className="text-3xl font-semibold">{formatCurrency(owing)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Swap differences</p>
          <p className="text-3xl font-semibold">{formatCurrency(swapValue)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Returns filed</p>
          <p className="text-3xl font-semibold">{data.returns.length}</p>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="surface-card overflow-hidden">
          <h3 className="border-b border-border px-5 py-4 font-semibold">Branch books</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Branch</th>
                <th className="px-3 py-3">Sales</th>
                <th className="px-3 py-3">Revenue</th>
                <th className="px-5 py-3">Collected</th>
              </tr>
            </thead>
            <tbody>
              {byBranch.map((row) => (
                <tr key={row.name} className="border-b border-border/70">
                  <td className="px-5 py-3 font-medium">{row.name}</td>
                  <td className="px-3 py-3">{row.tickets}</td>
                  <td className="px-3 py-3">{formatCurrency(row.revenue)}</td>
                  <td className="px-5 py-3">{formatCurrency(row.collected)}</td>
                </tr>
              ))}
              {byBranch.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">No completed sales in this scope.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="surface-card overflow-hidden">
          <h3 className="border-b border-border px-5 py-4 font-semibold">Debtors</h3>
          <div className="space-y-3 p-5 text-sm">
            {data.debtors.map((row) => (
              <div key={row.id} className="flex justify-between">
                <Link href={`/customers/${row.id}`} className="text-primary">{row.name} · {row.branch.code}</Link>
                <span className="font-medium">{formatCurrency(money(row.currentBalance))}</span>
              </div>
            ))}
            {data.debtors.length === 0 ? <p className="text-muted-foreground">No open customer balances.</p> : null}
          </div>
        </div>
      </div>
      <div className="surface-card overflow-hidden">
        <h3 className="border-b border-border px-5 py-4 font-semibold">Unpaid supplier invoices</h3>
        <div className="space-y-3 p-5 text-sm">
          {data.creditors.map((row) => (
            <div key={row.id} className="flex justify-between">
              <Link href={`/purchases/${row.id}`} className="text-primary">{row.invoiceNumber} · {row.supplier} · {row.branch}</Link>
              <span className="font-medium">{formatCurrency(row.owed)}</span>
            </div>
          ))}
          {data.creditors.length === 0 ? <p className="text-muted-foreground">No supplier invoices still owed.</p> : null}
        </div>
      </div>
      <div className="surface-card overflow-hidden">
        <h3 className="border-b border-border px-5 py-4 font-semibold">Low stock</h3>
        <div className="space-y-3 p-5 text-sm">
          {lowStock.map((row) => (
            <div key={row.id} className="flex justify-between">
              <span>{row.product.name} · {row.branch.code}</span>
              <span className="font-medium">{row.quantity} / min {row.minStock}</span>
            </div>
          ))}
          {lowStock.length === 0 ? <p className="text-muted-foreground">No lines are at or below minimum.</p> : null}
        </div>
      </div>
    </div>
  )
}
