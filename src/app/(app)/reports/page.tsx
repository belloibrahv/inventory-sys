import Link from "next/link"
import { getReportData } from "@/app/actions/finance"
import { ExportCsv } from "@/components/export-csv"
import { ReportsPdfButton } from "@/components/reports-pdf-button"
import { ReportsStatement } from "@/components/reports-statement"
import { PageHeader } from "@/components/shared"
import { PrintButton } from "@/components/print-button"
import { formatLagosStamp, watDayKey } from "@/lib/lagos-day"
import type { ReportsPack } from "@/lib/reports-pack"
import { getAppSettings, lowStockLimit } from "@/lib/settings"
import { requireUser } from "@/lib/session"
import { formatCurrency, money } from "@/lib/utils"

export default async function ReportsPage() {
  const [data, settings, user] = await Promise.all([getReportData(), getAppSettings(), requireUser()])
  const revenue = data.sales.reduce((sum, sale) => sum + money(sale.totalAmount), 0)
  const collected = data.sales.reduce((sum, sale) => sum + money(sale.paidAmount), 0)
  const expense = data.expenses.reduce((sum, row) => sum + money(row.amount), 0)
  const stock = data.inventory.reduce((sum, row) => sum + row.quantity * money(row.product.costPrice), 0)
  const swapValue = data.swaps.reduce((sum, row) => sum + money(row.balanceAmount), 0)
  const owing = data.debtors.reduce((sum, row) => sum + money(row.currentBalance), 0)
  const lowStock = data.inventory.filter((row) => row.quantity <= lowStockLimit(row.minStock, settings.lowStockThreshold))

  const byShop = Object.values(
    data.sales.reduce<Record<string, { name: string; revenue: number; collected: number; tickets: number }>>((acc, sale) => {
      const key = sale.branch.id
      acc[key] = acc[key] ?? { name: sale.branch.name, revenue: 0, collected: 0, tickets: 0 }
      acc[key].revenue += money(sale.totalAmount)
      acc[key].collected += money(sale.paidAmount)
      acc[key].tickets += 1
      return acc
    }, {})
  ).sort((a, b) => b.revenue - a.revenue)

  const shopNames = byShop.map((row) => row.name)
  const scope =
    shopNames.length === 0
      ? "Shops you can see"
      : shopNames.length === 1
        ? shopNames[0]
        : shopNames.join(" and ")

  const pack: ReportsPack = {
    company: {
      name: settings.companyName,
      product: settings.productName,
      phone: settings.companyPhone,
      address: settings.companyAddress,
      email: settings.companyEmail,
    },
    scope,
    preparedAt: new Date().toISOString(),
    preparedBy: user.name || user.email,
    statementRef: `RP-${watDayKey().replaceAll("-", "")}`,
    totals: {
      revenue,
      collected,
      expenses: expense,
      stock,
      invoices: data.sales.length,
      owing,
      swaps: swapValue,
      returns: data.returns.length,
    },
    byShop,
    debtors: data.debtors.map((row) => ({
      id: row.id,
      name: row.name,
      shop: row.branch.code,
      amount: money(row.currentBalance),
    })),
    creditors: data.creditors.map((row) => ({
      id: row.id,
      invoice: row.invoiceNumber,
      supplier: row.supplier,
      shop: row.branch,
      owed: row.owed,
    })),
    lowStock: lowStock.map((row) => ({
      id: row.id,
      product: row.product.name,
      shop: row.branch.code,
      quantity: row.quantity,
      min: row.minStock,
    })),
  }

  return (
    <div className="space-y-6">
      <div className="reports-chrome print:hidden">
        <PageHeader
          title="Reports"
          description={`Sales, money collected, stock, swaps, returns, and what people still owe. Position as at ${formatLagosStamp()}.`}
          actions={
            <div className="flex flex-wrap gap-2">
              <a href="/audit/books" className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-sm">
                Check the books
              </a>
              <ReportsPdfButton data={pack} />
              <PrintButton label="Print / Save PDF" />
              <ExportCsv
                filename={`${pack.statementRef}.csv`}
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
        <div className="mt-4 grid gap-4 md:grid-cols-4">
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
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="surface-card overflow-hidden">
            <h3 className="border-b border-border px-5 py-4 font-semibold">Shop books</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-5 py-3">Shop</th>
                  <th className="px-3 py-3">Sales</th>
                  <th className="px-3 py-3">Revenue</th>
                  <th className="px-5 py-3">Collected</th>
                </tr>
              </thead>
              <tbody>
                {byShop.map((row) => (
                  <tr key={row.name} className="border-b border-border/70">
                    <td className="px-5 py-3 font-medium">{row.name}</td>
                    <td className="px-3 py-3">{row.tickets}</td>
                    <td className="px-3 py-3">{formatCurrency(row.revenue)}</td>
                    <td className="px-5 py-3">{formatCurrency(row.collected)}</td>
                  </tr>
                ))}
                {byShop.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">No completed sales in this scope.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="surface-card overflow-hidden">
            <h3 className="border-b border-border px-5 py-4 font-semibold">Customers still owe</h3>
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
        <div className="mt-4 surface-card overflow-hidden">
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
        <div className="mt-4 surface-card overflow-hidden">
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
      <ReportsStatement data={pack} />
    </div>
  )
}
