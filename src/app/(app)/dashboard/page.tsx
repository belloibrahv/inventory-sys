import { getDashboardData } from "@/app/actions/dashboard"
import { DevicePie, SalesPurchaseChart } from "@/components/dashboard-charts"
import { KpiCard, SectionCard, StatCard, StatGrid, StatusBadge } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { getAppSettings, lowStockLimit } from "@/lib/settings"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import { Banknote, CreditCard, Receipt, Wallet } from "lucide-react"

export default async function DashboardPage() {
  const [data, settings] = await Promise.all([getDashboardData(), getAppSettings()])

  return (
    <div className="space-y-6">
      {data.tasks.length ? (
        <SectionCard title="Pending Action Items" description="Operational tasks and exceptions requiring immediate review across active branches.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.tasks.map((task) => (
              <a
                key={task.href + task.label}
                href={task.href}
                className="rounded-lg border border-border px-4 py-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <p className="text-2xl font-semibold num">{task.count}</p>
                <p className="text-sm text-muted-foreground">{task.label}</p>
              </a>
            ))}
          </div>
        </SectionCard>
      ) : (
        <p className="text-sm text-muted-foreground">No pending action items require immediate attention.</p>
      )}
      <StatGrid>
        <KpiCard
          label="Gross Revenue"
          value={formatCurrency(data.kpis.totalSales)}
          trend={data.kpis.salesTrend}
          icon={<Receipt className="h-5 w-5" />}
        />
        <KpiCard
          label="Operating Expenses (OPEX)"
          value={formatCurrency(data.kpis.totalExpense)}
          trend={data.kpis.expenseTrend}
          icon={<CreditCard className="h-5 w-5" />}
        />
        <KpiCard
          label="Disbursements (Outflows)"
          value={formatCurrency(data.kpis.paymentSent)}
          trend={data.kpis.paymentSentTrend}
          icon={<Banknote className="h-5 w-5" />}
        />
        <KpiCard
          label="Collections (Inflows)"
          value={formatCurrency(data.kpis.paymentReceived)}
          trend={data.kpis.paymentReceivedTrend}
          icon={<Wallet className="h-5 w-5" />}
        />
      </StatGrid>

      <StatGrid>
        <StatCard
          label="Pending Approvals"
          value={String(data.exceptions.pendingApprovals)}
          hint="Supervisory authorization required before workflow execution"
          href="/approvals"
          tone={data.exceptions.pendingApprovals > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Unregistered Walk-Ins"
          value={String(data.exceptions.walkIns)}
          hint="Sales completed without customer profile assignment"
          href="/sales"
          tone={data.exceptions.walkIns > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Accounts Payable"
          value={formatCurrency(data.exceptions.creditorOwed)}
          hint="Outstanding vendor balances across scoped locations"
          href="/suppliers"
        />
        <StatCard
          label="Serial Reconciliation Gaps"
          value={String(data.exceptions.imeiGaps)}
          hint={
            data.exceptions.imeiGaps === 0
              ? "Physical inventory matches serialized asset register"
              : "Discrepancies identified between stock and serial register"
          }
          href="#imei-check"
          tone={data.exceptions.imeiGaps > 0 ? "danger" : "success"}
        />
      </StatGrid>

      <p className="text-sm text-muted-foreground">
        Open the{" "}
        <a href="/audit/books" className="font-medium text-primary hover:underline">
          Financial Audit Pack
        </a>{" "}
        for general ledger balances, asset valuation, and printable statutory compliance statements.
      </p>

      <div id="imei-check" className="surface-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5">
          <div>
            <h3 className="font-semibold">Physical vs Serialized Asset Reconciliation</h3>
            <p className="text-sm text-muted-foreground">
              {data.exceptions.imeiGaps === 0
                ? "Physical on-hand inventory perfectly matches registered serial counts."
                : `${data.exceptions.imeiGaps} item${data.exceptions.imeiGaps === 1 ? "" : "s"} require serialization reconciliation.`}
            </p>
          </div>
          <Badge variant={data.exceptions.imeiGaps ? "danger" : "success"}>
            {data.exceptions.imeiGaps ? "Variance Detected" : "Reconciled"}
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-y border-border">
                <th className="px-6 py-3 font-medium">Product / SKU</th>
                <th className="px-3 py-3 font-medium">Location</th>
                <th className="px-3 py-3 font-medium">Stock on Hand</th>
                <th className="px-3 py-3 font-medium">Serialized Assets</th>
                <th className="px-6 py-3 font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {data.imeiCheck.map((row) => (
                <tr key={row.id} className="border-b border-border/70 last:border-0">
                  <td className="px-6 py-3 font-medium">{row.product}</td>
                  <td className="px-3 py-3">{row.shop}</td>
                  <td className="px-3 py-3 num">{row.shopQty}</td>
                  <td className="px-3 py-3 num">{row.imeis}</td>
                  <td className="px-6 py-3">
                    <Badge variant={row.delta === 0 ? "success" : "danger"}>
                      {row.delta === 0 ? "Reconciled" : row.delta > 0 ? `+${row.delta} excess serials` : `${row.delta} missing serials`}
                    </Badge>
                  </td>
                </tr>
              ))}
              {data.imeiCheck.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-muted-foreground">
                    No serialized inventory tracked in selected branch locations.
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
              <h3 className="font-semibold">Revenue vs Procurement</h3>
              <p className="text-sm text-muted-foreground">Trailing six months for active branch scope</p>
            </div>
            <Badge variant="muted">6 Months</Badge>
          </div>
          <SalesPurchaseChart data={data.chartSales} />
        </div>
        <div className="surface-card p-6 xl:col-span-3">
          <h3 className="font-semibold">Asset Breakdown by Brand</h3>
          <p className="mb-4 text-sm text-muted-foreground">In-stock serialized inventory distribution</p>
          <DevicePie data={data.devices} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-7">
        <div className="surface-card overflow-hidden xl:col-span-4">
          <div className="flex items-center justify-between px-6 py-5">
            <h3 className="font-semibold">Recent Sales Orders</h3>
            <Badge variant="muted">Invoices</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-y border-border">
                  <th className="px-6 py-3 font-medium">Invoice</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Total Paid</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((sale) => (
                  <tr key={sale.id} className="border-b border-border/70 last:border-0">
                    <td className="px-6 py-3 font-medium">
                      <a href={`/sales/${sale.id}`} className="text-primary font-mono">{sale.invoiceNumber}</a>
                    </td>
                    <td className="px-3 py-3">{sale.customer?.name ?? "Walk-in Customer"}</td>
                    <td className="px-3 py-3">{formatDate(sale.saleDate)}</td>
                    <td className="px-3 py-3 num">{formatCurrency(money(sale.paidAmount))}</td>
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
              <h3 className="font-semibold">Inventory Valuation</h3>
              <Badge variant="muted">Live</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Total Stock at Cost</p>
            <p className="text-3xl font-semibold num">{formatCurrency(data.kpis.stockValue)}</p>
            <p className="mt-1 text-xs text-success">Accounts Receivable: {formatCurrency(data.kpis.outstanding)}</p>
            <div className="mt-4 space-y-3">
              {data.stock.map((row) => (
                <div key={row.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{row.product.name}</p>
                    <p className="text-xs text-muted-foreground">{row.branch.code}</p>
                  </div>
                  <Badge variant={row.quantity <= lowStockLimit(row.minStock, settings.lowStockThreshold) ? "danger" : "success"}>{row.quantity} units</Badge>
                </div>
              ))}
            </div>
          </div>
          <div className="surface-card p-6">
            <h3 className="mb-3 font-semibold">Branch Revenue Ranking</h3>
            <div className="space-y-3">
              {data.ranking.map((row, index) => (
                <div key={row.name} className="flex items-center justify-between text-sm">
                  <span>
                    {index + 1}. {row.name}
                  </span>
                  <span className="font-medium num">{formatCurrency(row.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
