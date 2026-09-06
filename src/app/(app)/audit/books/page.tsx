import Link from "next/link"
import { getBooksCheck, type BooksRange } from "@/app/actions/books-check"
import { ExportCsv } from "@/components/export-csv"
import { PageHeader } from "@/components/shared"
import { PrintButton } from "@/components/print-button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency, formatDate } from "@/lib/utils"

function asRange(value?: string): BooksRange {
  return value === "week" || value === "month" ? value : "day"
}

export default async function BooksCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; date?: string; range?: string }>
}) {
  const { shop, date, range } = await searchParams
  const data = await getBooksCheck(shop, date, asRange(range))
  if (!data) {
    return <p className="text-sm text-muted-foreground">You cannot open Check the books.</p>
  }

  const lines = [
    ["Cash sales collected", data.cash],
    ["+ Transfer collected", data.transfer],
    ["+ POS collected", data.pos],
    ["= Money taken on those methods", data.methodSum],
    ["All invoices (revenue)", data.revenue],
    ["− Money collected on those invoices", data.collected],
    ["= Still on invoices (due)", data.due],
    ["Credit sales (full invoice)", data.credit],
    ["Approved expenses", data.expenses],
    ["+ Paid to suppliers", data.purchasesPaid],
    ["= Money out", data.moneyOut],
  ]
  const periodLabel = data.range === "day" ? data.businessDate : `${data.from} to ${data.to}`

  return (
    <div className="audit-pack space-y-6">
      <PageHeader
        title="Check the books"
        description="A working paper for the owner, accountant, and records checker. The system adds money and phones again. It does not change any invoice."
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <PrintButton label="Print this pack" />
            <ExportCsv
              filename={`abutwins-books-${data.shopName}-${data.from}-${data.to}.csv`}
              label="Download CSV"
              rows={[
                ["Shop", data.shopName],
                ["Period", periodLabel],
                ["Verdict", data.verdict],
                [],
                ["Check", "Result", "Note"],
                ...data.papers.map((row) => [row.label, row.ok ? "Pass" : "Needs work", row.detail]),
                [],
                ["Line", "Amount"],
                ...lines.map(([label, value]) => [String(label), String(value)]),
                [],
                ["Invoice", "When", "Customer", "Staff", "Method", "Total", "Paid"],
                ...data.invoices.map((row) => [row.invoice, row.when, row.customer, row.staff, row.method, String(row.total), String(row.paid)]),
              ]}
            />
          </div>
        }
      />
      <p className="text-sm print:hidden">
        <Link href="/audit" className="text-primary">Who did what</Link>
        {" · "}
        <Link href="/finance/close" className="text-primary">Close the day</Link>
        {" · "}
        <Link href="/reports" className="text-primary">Reports</Link>
      </p>

      <form className="surface-card grid gap-3 p-4 print:hidden md:grid-cols-[1fr_160px_180px_auto] md:items-end">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Shop</span>
          <Select name="shop" defaultValue={data.shopId}>
            {data.shops.map((row) => (
              <option key={row.id} value={row.id}>{row.name}</option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Period</span>
          <Select name="range" defaultValue={data.range}>
            <option value="day">One day</option>
            <option value="week">Last 7 days</option>
            <option value="month">This month to date</option>
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">End date (Lagos)</span>
          <Input name="date" type="date" defaultValue={data.businessDate} required />
        </label>
        <button type="submit" className="min-h-12 rounded-xl bg-primary px-4 text-sm text-primary-foreground">
          Recalculate
        </button>
      </form>

      <div className={`rounded-xl px-4 py-4 text-sm ${data.openCount ? "bg-rose-50 text-rose-950 dark:bg-rose-500/10 dark:text-rose-100" : "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100"}`}>
        <p className="font-semibold">{data.shopName} · {periodLabel}</p>
        <p className="mt-1">{data.verdict}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Sales</p>
          <p className="text-2xl font-semibold">{data.salesCount}</p>
          <p className="text-xs text-muted-foreground">Prior period {data.compare.priorCount} · {data.compare.count.value}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Money collected</p>
          <p className="text-2xl font-semibold">{formatCurrency(data.collected)}</p>
          <p className="text-xs text-muted-foreground">Prior {formatCurrency(data.compare.priorCollected)} · {data.compare.collected.value}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Revenue posted</p>
          <p className="text-2xl font-semibold">{formatCurrency(data.revenue)}</p>
          <p className="text-xs text-muted-foreground">Prior {formatCurrency(data.compare.priorRevenue)} · {data.compare.revenue.value}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Things to clear</p>
          <p className="text-2xl font-semibold">{data.openCount}</p>
          <p className="text-xs text-muted-foreground">{data.openCount ? "Open the working paper below" : "All checks passed"}</p>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-semibold">Working paper</h3>
          <p className="text-sm text-muted-foreground">Do these in order. A pass means the system already proved it. A fail means a person must act.</p>
        </div>
        <div className="divide-y divide-border/70">
          {data.papers.map((row) => (
            <div key={row.label} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{row.label}</p>
                <p className="text-sm text-muted-foreground">{row.detail}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={row.ok ? "success" : "danger"}>{row.ok ? "Pass" : "Needs work"}</Badge>
                <Link href={row.href} className="text-sm text-primary print:hidden">Open</Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="surface-card overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h3 className="font-semibold">How the numbers add up</h3>
            <p className="text-sm text-muted-foreground">Read top to bottom. Use the shop calculator if you want to check a line by hand.</p>
          </div>
          <div className="divide-y divide-border/70">
            {lines.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className={String(label).startsWith("=") ? "font-medium" : "text-muted-foreground"}>{label}</span>
                <span className="font-medium tabular-nums">{formatCurrency(Number(value))}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="surface-card p-5">
            <h3 className="mb-3 font-semibold">Books still open</h3>
            <div className="space-y-2 text-sm">
              <p className="flex justify-between gap-3"><span className="text-muted-foreground">Customers still owe</span><span>{formatCurrency(data.customersOwe)}</span></p>
              <p className="flex justify-between gap-3"><span className="text-muted-foreground">We still owe suppliers</span><span>{formatCurrency(data.supplierOwed)}</span></p>
              <p className="flex justify-between gap-3"><span className="text-muted-foreground">Walk-in sales this period</span><span>{data.walkIns}</span></p>
            </div>
          </div>
          <div className="surface-card p-5">
            <h3 className="mb-3 font-semibold">Who collected</h3>
            <div className="space-y-2 text-sm">
              {data.byStaff.map((row) => (
                <p key={row.name} className="flex justify-between gap-3">
                  <span>{row.name} · {row.count} sale{row.count === 1 ? "" : "s"}</span>
                  <span>{formatCurrency(row.collected)}</span>
                </p>
              ))}
              {data.byStaff.length === 0 ? <p className="text-muted-foreground">No completed sales in this period.</p> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 className="font-semibold">Invoices in this period</h3>
            <Badge variant="muted">{data.invoices.length} shown</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-5 py-2">Invoice</th>
                  <th className="px-3 py-2">Buyer</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-5 py-2">Paid</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((row) => (
                  <tr key={row.id} className="border-b border-border/70">
                    <td className="px-5 py-2">
                      <Link href={`/sales/${row.id}`} className="text-primary">{row.invoice}</Link>
                      <span className="block text-xs text-muted-foreground">{formatDate(row.when)} · {row.staff}</span>
                    </td>
                    <td className="px-3 py-2">{row.customer}</td>
                    <td className="px-3 py-2">{row.method}</td>
                    <td className="px-5 py-2">{formatCurrency(row.paid)}</td>
                  </tr>
                ))}
                {data.invoices.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-6 text-muted-foreground">No completed sales in this period.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-4">
          <div className="surface-card overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h3 className="font-semibold">Till closes</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-5 py-2">Day</th>
                    <th className="px-3 py-2">Expected</th>
                    <th className="px-5 py-2">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.closes.map((row) => (
                    <tr key={row.id} className="border-b border-border/70">
                      <td className="px-5 py-2">{row.day}<span className="block text-xs text-muted-foreground">{row.staff}</span></td>
                      <td className="px-3 py-2">{formatCurrency(row.expected)}</td>
                      <td className="px-5 py-2">{formatCurrency(row.variance)}</td>
                    </tr>
                  ))}
                  {data.closes.length === 0 ? (
                    <tr><td colSpan={3} className="px-5 py-6 text-muted-foreground">No till close in this period.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          <div className="surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-semibold">IMEI vs shop count</h3>
              <Badge variant={data.imeiGaps ? "danger" : "success"}>{data.imeiGaps ? "Gaps" : "Match"}</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-5 py-2">Product</th>
                    <th className="px-3 py-2">Shop</th>
                    <th className="px-3 py-2">IMEIs</th>
                    <th className="px-5 py-2">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {data.imeiRows.map((row) => (
                    <tr key={`${row.product}-${row.shop}`} className="border-b border-border/70">
                      <td className="px-5 py-2">{row.product}</td>
                      <td className="px-3 py-2">{row.shopQty}</td>
                      <td className="px-3 py-2">{row.imeis}</td>
                      <td className="px-5 py-2">{row.delta === 0 ? "Match" : row.delta > 0 ? `+${row.delta}` : row.delta}</td>
                    </tr>
                  ))}
                  {data.imeiRows.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-6 text-muted-foreground">No serialized stock in this shop.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
