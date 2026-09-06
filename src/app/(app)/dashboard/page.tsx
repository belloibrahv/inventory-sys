import { getDashboardData } from "@/app/actions/dashboard"
import { DevicePie, SalesPurchaseChart } from "@/components/dashboard-charts"
import { KpiCard, StatusBadge } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { getAppSettings, lowStockLimit } from "@/lib/settings"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import { Banknote, CreditCard, Receipt, Wallet } from "lucide-react"

export default async function DashboardPage() {
  const [data, settings] = await Promise.all([getDashboardData(), getAppSettings()])

  return (
    <div className="space-y-6">
      {data.tasks.length ? (
        <div className="surface-card p-5">
          <h3 className="mb-3 font-semibold">Do these next</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.tasks.map((task) => (
              <a key={task.href + task.label} href={task.href} className="rounded-xl border border-border px-4 py-3 hover:bg-muted">
                <p className="text-2xl font-semibold">{task.count}</p>
                <p className="text-sm text-muted-foreground">{task.label}</p>
              </a>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No open shop tasks for you right now.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total sales"
          value={formatCurrency(data.kpis.totalSales)}
          trend={data.kpis.salesTrend}
          tone="blue"
          icon={<Receipt className="h-5 w-5" />}
        />
        <KpiCard
          label="Total expenses"
          value={formatCurrency(data.kpis.totalExpense)}
          trend={data.kpis.expenseTrend}
          tone="blue"
          icon={<CreditCard className="h-5 w-5" />}
        />
        <KpiCard
          label="Money sent out"
          value={formatCurrency(data.kpis.paymentSent)}
          trend={data.kpis.paymentSentTrend}
          tone="blue"
          icon={<Banknote className="h-5 w-5" />}
        />
        <KpiCard
          label="Money collected"
          value={formatCurrency(data.kpis.paymentReceived)}
          trend={data.kpis.paymentReceivedTrend}
          tone="green"
          icon={<Wallet className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <a href="/approvals" className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Waiting for approval</p>
          <p className="text-2xl font-semibold">{data.exceptions.pendingApprovals}</p>
        </a>
        <a href="/sales" className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Walk-in sales with no name</p>
          <p className="text-2xl font-semibold">{data.exceptions.walkIns}</p>
          <p className="text-xs text-muted-foreground">Add the buyer before any return</p>
        </a>
        <a href="/finance" className="surface-card p-5">
          <p className="text-sm text-muted-foreground">We still owe suppliers</p>
          <p className="text-2xl font-semibold">{formatCurrency(data.exceptions.creditorOwed)}</p>
        </a>
        <a href="#imei-check" className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Stock count vs IMEI mismatch</p>
          <p className="text-2xl font-semibold">{data.exceptions.imeiGaps}</p>
          <p className="text-xs text-muted-foreground">
            {data.exceptions.imeiGaps === 0 ? "Shop list and IMEI match" : "Open the IMEI check below"}
          </p>
        </a>
      </div>

      <div id="imei-check" className="surface-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5">
          <div>
            <h3 className="font-semibold">IMEI vs shop count</h3>
            <p className="text-sm text-muted-foreground">
              {data.exceptions.imeiGaps === 0
                ? "Every phone and laptop on the shop list has a matching IMEI count."
                : `${data.exceptions.imeiGaps} product${data.exceptions.imeiGaps === 1 ? "" : "s"} do not match. If it is not on this list, treat the shop count as unproven.`}
            </p>
          </div>
          <Badge variant={data.exceptions.imeiGaps ? "danger" : "success"}>
            {data.exceptions.imeiGaps ? "Gaps" : "Match"}
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-y border-border">
                <th className="px-6 py-3 font-medium">Product</th>
                <th className="px-3 py-3 font-medium">Shop</th>
                <th className="px-3 py-3 font-medium">Shop qty</th>
                <th className="px-3 py-3 font-medium">IMEIs</th>
                <th className="px-6 py-3 font-medium">Gap</th>
              </tr>
            </thead>
            <tbody>
              {data.imeiCheck.map((row) => (
                <tr key={row.id} className="border-b border-border/70 last:border-0">
                  <td className="px-6 py-3 font-medium">{row.product}</td>
                  <td className="px-3 py-3">{row.shop}</td>
                  <td className="px-3 py-3">{row.shopQty}</td>
                  <td className="px-3 py-3">{row.imeis}</td>
                  <td className="px-6 py-3">
                    <Badge variant={row.delta === 0 ? "success" : "danger"}>
                      {row.delta === 0 ? "Match" : row.delta > 0 ? `+${row.delta} extra IMEI` : `${row.delta} short`}
                    </Badge>
                  </td>
                </tr>
              ))}
              {data.imeiCheck.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-muted-foreground">
                    No serialized stock in the shops you can see yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-7">
        <div className="surface-card p-6 xl:col-span-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Sales & purchases</h3>
              <p className="text-sm text-muted-foreground">Last six months for the shops you can see</p>
            </div>
            <Badge variant="muted">6 Months</Badge>
          </div>
          <SalesPurchaseChart data={data.chartSales} />
        </div>
        <div className="surface-card p-6 xl:col-span-3">
          <h3 className="font-semibold">Phones in shop</h3>
          <p className="mb-4 text-sm text-muted-foreground">How many units by brand</p>
          <DevicePie data={data.devices} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-7">
        <div className="surface-card overflow-hidden xl:col-span-4">
          <div className="flex items-center justify-between px-6 py-5">
            <h3 className="font-semibold">Recent sales</h3>
            <Badge variant="muted">Invoices</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-y border-border">
                  <th className="px-6 py-3 font-medium">Invoice</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Amount paid</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((sale) => (
                  <tr key={sale.id} className="border-b border-border/70 last:border-0">
                    <td className="px-6 py-3 font-medium">
                      <a href={`/sales/${sale.id}`} className="text-primary">{sale.invoiceNumber}</a>
                    </td>
                    <td className="px-3 py-3">{sale.customer?.name ?? "Walk-in"}</td>
                    <td className="px-3 py-3">{formatDate(sale.saleDate)}</td>
                    <td className="px-3 py-3">{formatCurrency(money(sale.paidAmount))}</td>
                    <td className="px-6 py-3">
                      <StatusBadge value={sale.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4 xl:col-span-3">
          <div className="surface-card p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Stock now</h3>
              <Badge variant="muted">Live</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Stock value</p>
            <p className="text-3xl font-semibold">{formatCurrency(data.kpis.stockValue)}</p>
            <p className="mt-1 text-xs text-emerald-600">Customers still owing {formatCurrency(data.kpis.outstanding)}</p>
            <div className="mt-4 space-y-3">
              {data.stock.map((row) => (
                <div key={row.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{row.product.name}</p>
                    <p className="text-xs text-muted-foreground">{row.branch.code}</p>
                  </div>
                  <Badge variant={row.quantity <= lowStockLimit(row.minStock, settings.lowStockThreshold) ? "danger" : "success"}>{row.quantity}</Badge>
                </div>
              ))}
            </div>
          </div>
          <div className="surface-card p-6">
            <h3 className="mb-3 font-semibold">Shop ranking</h3>
            <div className="space-y-3">
              {data.ranking.map((row, index) => (
                <div key={row.name} className="flex items-center justify-between text-sm">
                  <span>
                    {index + 1}. {row.name}
                  </span>
                  <span className="font-medium">{formatCurrency(row.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
