import Link from "next/link"
import { closeDay, getDayClosePreview, getDayCloses } from "@/app/actions/day-close"
import { getBranches } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { requireUser } from "@/lib/session"
import { viewBranchFilter } from "@/lib/branch-scope"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Store, Building2, Calendar, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react"

export default async function DayClosePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; branchId?: string }>
}) {
  const user = await requireUser()
  const activeBranch = await viewBranchFilter(user)
  const params = await searchParams
  const date = params.date
  const selectedBranchId = params.branchId || activeBranch || undefined

  const [preview, closes, branches] = await Promise.all([
    getDayClosePreview(selectedBranchId, date),
    getDayCloses(selectedBranchId),
    getBranches(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="Daily Till Count & Day Close"
          description="Count and reconcile the physical till cash against recorded cash sales for the business day. Transfer and POS payments remain securely logged under the bank record."
        />
        <Link
          href="/finance"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Finance
        </Link>
      </div>

      {/* Branch Selector for Multi-Shop / Admin Users */}
      {branches.length > 1 && !user.branchId && (
        <div className="surface-card p-4 flex flex-wrap items-center justify-between gap-3 border-primary/20 bg-muted/20">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Shop for Day Close:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {branches.map((b) => {
              const isCurrent = preview.branchId === b.id
              return (
                <Link
                  key={b.id}
                  href={`/finance/close?branchId=${b.id}${date ? `&date=${date}` : ""}`}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isCurrent
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-background border border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {b.name} ({b.code})
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Unclosed Days Warning Banner */}
      {preview.unclosed.length ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900/50 dark:bg-rose-500/10 dark:text-rose-100">
          <div className="flex items-center gap-2 font-bold text-rose-800 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4" />
            <span>
              Unclosed Prior Trading Days {preview.branchName ? `for ${preview.branchName}` : ""}
            </span>
          </div>
          <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
            Cash registers must be closed sequentially. Select a day below to submit its till count:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {preview.unclosed.map((day) => (
              <Link
                key={day}
                href={`/finance/close?branchId=${preview.branchId}&date=${day}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  day === preview.businessDate
                    ? "bg-rose-600 text-white shadow-sm"
                    : "bg-white/80 border border-rose-200 text-rose-900 hover:bg-rose-100 dark:bg-black/30 dark:border-rose-800 dark:text-rose-200"
                }`}
              >
                📅 {day} {day === preview.businessDate ? " (Active)" : ""}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Overview Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-5 border-l-4 border-l-emerald-500">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expected Cash in Till</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(preview.expectedCash)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {preview.branchName ? `${preview.branchName} · ` : ""}{preview.businessDate}
          </p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bank Transfers</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(preview.transferTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">Verified direct bank transfers</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">POS Terminal Sales</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(preview.posTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">Card terminal settlements</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Invoices Billed</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{preview.saleCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Completed sale tickets for day</p>
        </div>
      </div>

      {/* Till Count Form or Closed Notice */}
      {preview.alreadyClosed ? (
        <div className="surface-card p-6 border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold">
            <CheckCircle2 className="h-5 w-5" />
            <span>Trading Day Reconciled & Closed</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {preview.branchName || "This shop"} has already successfully closed the till for business date <strong>{preview.businessDate}</strong>.
          </p>
        </div>
      ) : (
        <div className="surface-card p-6 border-primary/20">
          <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
            <div>
              <h3 className="font-bold text-base">
                Physical Cash Count — {preview.branchName || "Shop"} ({preview.businessDate})
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Count the physical notes in the cash drawer and input the total counted cash amount below.
              </p>
            </div>
            <div className="rounded-lg bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              Expected: {formatCurrency(preview.expectedCash)}
            </div>
          </div>

          <ActionForm action={closeDay} submit="Reconcile & Close Day" className="space-y-4">
            <input type="hidden" name="branchId" value={preview.branchId} />
            <input type="hidden" name="businessDate" value={preview.businessDate} />
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Physical Cash Counted (₦) *
              </label>
              <Input
                name="countedCash"
                type="number"
                step="any"
                defaultValue={preview.expectedCash}
                required
                className="min-h-12 text-lg font-mono font-bold"
                placeholder="Enter physical cash in drawer"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Discrepancy Explanation or Closing Notes (Optional)
              </label>
              <Input
                name="notes"
                placeholder="Explain any shortfall, overage, petty cash payout, or closing remark"
              />
            </div>
          </ActionForm>
        </div>
      )}

      {/* Historical Closes Ledger */}
      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-bold text-base">Historical Day Close Audits</h3>
            <p className="text-xs text-muted-foreground">Log of past cash counts and variance records</p>
          </div>
          <a
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-primary hover:bg-muted"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(
              ["Business Day,Closed At,Shop,Expected Cash,Counted Cash,Variance,Transfer,POS,Sales Count,Notes", ...closes.map((row) =>
                [row.businessDate, formatDate(row.closeDate), row.branch, row.expectedCash, row.countedCash, row.variance, row.transferTotal, row.posTotal, row.saleCount, `"${row.notes || ""}"`].join(",")
              )].join("\n")
            )}`}
            download="day-close-audits.csv"
          >
            Export Audits CSV
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground bg-muted/40 text-xs uppercase tracking-wider">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Business Day</th>
                <th className="px-4 py-3">Shop</th>
                <th className="px-4 py-3">Expected Cash</th>
                <th className="px-4 py-3">Counted Cash</th>
                <th className="px-4 py-3">Variance</th>
                <th className="px-4 py-3">Transfers & POS</th>
                <th className="px-5 py-3">Closed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {closes.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 font-semibold">{row.businessDate}</td>
                  <td className="px-4 py-3 font-medium">{row.branch}</td>
                  <td className="px-4 py-3 font-mono">{formatCurrency(row.expectedCash)}</td>
                  <td className="px-4 py-3 font-mono font-semibold">{formatCurrency(row.countedCash)}</td>
                  <td className="px-4 py-3 font-mono">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${
                        row.variance === 0
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : row.variance < 0
                          ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }`}
                    >
                      {row.variance > 0 ? `+${formatCurrency(row.variance)}` : formatCurrency(row.variance)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    T: {formatCurrency(row.transferTotal)} · P: {formatCurrency(row.posTotal)}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{row.user}</td>
                </tr>
              ))}
              {closes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">No day closes recorded yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

