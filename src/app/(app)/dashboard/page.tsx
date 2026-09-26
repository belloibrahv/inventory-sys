import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  Banknote,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  CreditCard,
  Gauge,
  PackageX,
  Receipt,
  Store,
  Tags,
  Truck,
  Undo2,
  Upload,
  UserX,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { getDashboardData } from "@/app/actions/dashboard"
import { DevicePie, SalesPurchaseChart } from "@/components/dashboard-charts"
import { KpiCard, StatCard, StatGrid } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { formatShopWhen, formatWatLong, watDayKey } from "@/lib/lagos-day"
import { getAllowedKeys, hrefsForKeys } from "@/lib/permissions"
import { getAppSettings, lowStockLimit } from "@/lib/settings"
import { formatCurrency, money } from "@/lib/utils"

/** The jobs people open the app to do, in the order a shop reaches for them. */
const QUICK_ACTIONS: Array<{ href: string; label: string; icon: LucideIcon; primary?: boolean }> = [
  { href: "/pos", label: "Sell now", icon: Store, primary: true },
  { href: "/returns", label: "Take a return", icon: Undo2 },
  { href: "/finance/close", label: "Balance the till", icon: ClipboardCheck },
  { href: "/inventory", label: "Shop stock", icon: Boxes },
  { href: "/products", label: "Price list", icon: Tags },
  { href: "/uploads", label: "Upload stock", icon: Upload },
  { href: "/expenses", label: "Shop expense", icon: Receipt },
  { href: "/approvals", label: "Needs approval", icon: BadgeCheck },
  { href: "/owner", label: "Business today", icon: Gauge },
]

const TASK_ICON: Record<string, LucideIcon> = {
  "/finance/close": ClipboardCheck,
  "/pos": Clock,
  "/audit?risk=HIGH": AlertTriangle,
  "/incoming": Truck,
  "/transfers": ArrowLeftRight,
  "/sales": UserX,
  "/inventory": PackageX,
  "/approvals": BadgeCheck,
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date())
  )
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

export default async function DashboardPage() {
  const [data, settings] = await Promise.all([getDashboardData(), getAppSettings()])
  const allowed = new Set(hrefsForKeys(await getAllowedKeys(data.user.role)))
  const actions = QUICK_ACTIONS.filter((action) => allowed.has(action.href)).slice(0, 6)
  const firstName = (data.user.name ?? "").split(/\s+/)[0]
  const gaps = data.imeiCheck.filter((row) => row.delta !== 0)
  const sellsHere = allowed.has("/pos")

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{formatWatLong(watDayKey())}</p>
          <h2 className="text-2xl font-semibold tracking-tight">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h2>
        </div>
      </div>

      {actions.length ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={
                action.primary
                  ? "flex flex-col items-center justify-center gap-1.5 rounded-xl bg-primary px-2 py-3.5 text-center text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:bg-primary/90 active:scale-[0.98]"
                  : "surface-card-interactive flex flex-col items-center justify-center gap-1.5 px-2 py-3.5 text-center text-sm font-medium"
              }
            >
              <action.icon className="h-5 w-5" />
              <span className="leading-tight">{action.label}</span>
            </Link>
          ))}
        </div>
      ) : null}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today</h3>
        <StatGrid className={sellsHere ? "xl:grid-cols-3" : "xl:grid-cols-2"}>
          <StatCard
            label="Sales today"
            value={formatCurrency(data.today.sales)}
            hint={`${data.today.count} sale${data.today.count === 1 ? "" : "s"}`}
            tone="primary"
            href="/sales"
          />
          <StatCard label="Taken today" value={formatCurrency(data.today.paid)} hint="Money in on today's sales" tone="success" />
          {sellsHere ? (
            <StatCard
              label="Your sales today"
              value={formatCurrency(data.today.mine)}
              hint={`${data.today.mineCount} sale${data.today.mineCount === 1 ? "" : "s"} by you`}
              className="col-span-2 xl:col-span-1"
            />
          ) : null}
        </StatGrid>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Needs you</h3>
        {data.tasks.length ? (
          <ul className="surface-card divide-y divide-border overflow-hidden">
            {data.tasks.map((task) => {
              const Icon = TASK_ICON[task.href] ?? AlertTriangle
              return (
                <li key={task.href + task.label}>
                  <Link href={task.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium">{task.label}</span>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-semibold tabular-nums">{task.count}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="surface-card flex items-center gap-3 px-4 py-4 text-sm">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <span>Nothing waiting. The shops you can see are clear for now.</span>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">This month</h3>
        <StatGrid>
          <KpiCard label="Sales" value={formatCurrency(data.kpis.totalSales)} trend={data.kpis.salesTrend} icon={<Receipt className="h-4 w-4" />} href="/sales" />
          <KpiCard label="Money collected" value={formatCurrency(data.kpis.paymentReceived)} trend={data.kpis.paymentReceivedTrend} icon={<Wallet className="h-4 w-4" />} />
          <KpiCard label="Shop expenses" value={formatCurrency(data.kpis.totalExpense)} trend={data.kpis.expenseTrend} icon={<CreditCard className="h-4 w-4" />} href="/expenses" />
          <KpiCard label="Paid to suppliers" value={formatCurrency(data.kpis.paymentSent)} trend={data.kpis.paymentSentTrend} icon={<Banknote className="h-4 w-4" />} />
        </StatGrid>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Money and stock</h3>
        <StatGrid>
          <StatCard label="Stock at cost" value={formatCurrency(data.kpis.stockValue)} href="/inventory" />
          <StatCard
            label="Customers owe us"
            value={formatCurrency(data.kpis.outstanding)}
            tone={data.kpis.outstanding > 0 ? "warning" : "neutral"}
            href="/customers"
          />
          <StatCard
            label="We owe suppliers"
            value={formatCurrency(data.exceptions.creditorOwed)}
            hint={data.exceptions.supplierCredit > 0 ? `They owe us ${formatCurrency(data.exceptions.supplierCredit)}` : undefined}
            href="/suppliers"
          />
          <StatCard
            label="IMEI vs shop count"
            value={gaps.length ? `${gaps.length} gap${gaps.length === 1 ? "" : "s"}` : "All match"}
            tone={gaps.length ? "danger" : "success"}
            href="#imei-check"
          />
        </StatGrid>
      </section>

      <div className="grid gap-4 xl:grid-cols-7">
        <div className="surface-card p-5 sm:p-6 xl:col-span-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold">Sales vs goods bought</h3>
              <p className="text-sm text-muted-foreground">Last six months</p>
            </div>
            <Badge variant="muted">6 months</Badge>
          </div>
          <SalesPurchaseChart data={data.chartSales} />
        </div>
        <div className="surface-card p-5 sm:p-6 xl:col-span-3">
          <h3 className="font-semibold">Phones by brand</h3>
          <p className="mb-4 text-sm text-muted-foreground">Phones and laptops in the shops</p>
          <DevicePie data={data.devices} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-7">
        <div className="surface-card overflow-hidden xl:col-span-4">
          <div className="flex items-center justify-between px-5 py-4">
            <h3 className="font-semibold">Recent sales</h3>
            <Link href="/sales" className="text-sm font-medium text-primary hover:underline">
              See all
            </Link>
          </div>
          <ul className="divide-y divide-border border-t border-border">
            {data.recentSales.map((sale) => (
              <li key={sale.id}>
                <Link href={`/sales/${sale.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{sale.customer?.name ?? "Walk-in"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {sale.invoiceNumber} · {sale.branch.name} · {formatShopWhen(sale.saleDate)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(money(sale.totalAmount))}</span>
                </Link>
              </li>
            ))}
            {data.recentSales.length === 0 ? <li className="px-5 py-6 text-sm text-muted-foreground">No sales yet.</li> : null}
          </ul>
        </div>

        <div className="space-y-4 xl:col-span-3">
          <div className="surface-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Fewest left</h3>
              <Link href="/inventory" className="text-sm font-medium text-primary hover:underline">
                Shop stock
              </Link>
            </div>
            <div className="space-y-2.5">
              {data.stock.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.product.name}</p>
                    <p className="text-xs text-muted-foreground">{row.branch.code}</p>
                  </div>
                  <Badge variant={row.quantity <= lowStockLimit(row.minStock, settings.lowStockThreshold) ? "danger" : "success"}>
                    {row.quantity} left
                  </Badge>
                </div>
              ))}
            </div>
          </div>
          {data.ranking.length > 1 ? (
            <div className="surface-card p-5">
              <h3 className="mb-3 font-semibold">Shop sales ranking</h3>
              <div className="space-y-2.5">
                {data.ranking.map((row, index) => {
                  const top = data.ranking[0]?.revenue || 1
                  return (
                    <div key={row.name} className="text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate">
                          {index + 1}. {row.name}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">{formatCurrency(row.revenue)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(2, (row.revenue / top) * 100)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div id="imei-check" className="surface-card scroll-mt-20 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-5 py-4">
          <div>
            <h3 className="font-semibold">IMEI vs shop count</h3>
            <p className="text-sm text-muted-foreground">
              {gaps.length
                ? "Only the items where the shelf and the IMEI list disagree."
                : `All ${data.imeiCheck.length} phone and laptop lines match.`}
            </p>
          </div>
          <Badge variant={gaps.length ? "danger" : "success"}>{gaps.length ? `${gaps.length} gap${gaps.length === 1 ? "" : "s"}` : "Match"}</Badge>
        </div>
        {gaps.length ? (
          <ul className="divide-y divide-border border-t border-border">
            {gaps.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.product}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {row.shop} · shelf {row.shopQty} · IMEIs {row.imeis}
                  </p>
                </div>
                <Badge variant="danger">
                  {row.delta > 0 ? `${row.delta} extra IMEI${row.delta === 1 ? "" : "s"}` : `${Math.abs(row.delta)} missing`}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
