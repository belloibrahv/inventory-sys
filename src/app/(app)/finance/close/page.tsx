import Link from "next/link"
import { closeDay, getDayClosePreview, getDayCloses } from "@/app/actions/day-close"
import { getBranches } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { requireUser } from "@/lib/session"
import { viewBranchFilter } from "@/lib/branch-scope"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Store, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react"

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
          title="Close the day"
          description="Count the cash in the till. Match it to cash sales on the system. Transfer and POS money stay on the bank side."
        />
        <Link
          href="/finance"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Money in & out
        </Link>
      </div>

      {/* Branch Selector for Multi-Shop / Admin Users */}
      {branches.length > 1 && !user.branchId && (
        <div className="surface-card p-4 flex flex-wrap items-center justify-between gap-3 border-primary/20 bg-muted/20">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Which shop are you closing?</span>
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
        <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          <div className="flex items-center gap-2 font-bold text-danger">
            <AlertTriangle className="h-4 w-4" />
            <span>
              Old days not closed yet {preview.branchName ? `for ${preview.branchName}` : ""}
            </span>
          </div>
          <p className="mt-1 text-xs text-danger">
            Close the days one after the other, oldest first. Pick a day below and count that day's till:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {preview.unclosed.map((day) => (
              <Link
                key={day}
                href={`/finance/close?branchId=${preview.branchId}&date=${day}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  day === preview.businessDate
                    ? "bg-danger text-white shadow-sm"
                    : "bg-white/80 border border-danger/30 text-danger hover:bg-danger-soft dark:bg-black/30"
                }`}
              >
                📅 {day} {day === preview.businessDate ? " (you are here)" : ""}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Overview Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-5 border-l-4 border-l-emerald-500">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What the till should have</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(preview.expectedCash)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {preview.branchName ? `${preview.branchName} · ` : ""}{preview.businessDate}
          </p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Money sent to the bank</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(preview.transferTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">Customers who paid straight into the bank</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">POS machine</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(preview.posTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">Customers who paid with a card</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sales on that day</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{preview.saleCount}</p>
          <p className="text-xs text-muted-foreground mt-1">How many sales were finished on that day</p>
        </div>
      </div>

      {/* Till Count Form or Closed Notice */}
      {preview.alreadyClosed ? (
        <div className="surface-card p-6 border-success/30 bg-success-soft">
          <div className="flex items-center gap-2 text-success font-bold">
            <CheckCircle2 className="h-5 w-5" />
            <span>This day is counted and closed</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {preview.branchName || "This shop"} has already counted the till and closed <strong>{preview.businessDate}</strong>.
          </p>
        </div>
      ) : (
        <div className="surface-card p-6 border-primary/20">
          <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
            <div>
              <h3 className="font-bold text-base">
                Count the money in the till — {preview.branchName || "Shop"} ({preview.businessDate})
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Count the notes inside the drawer, then type the total you counted below.
              </p>
            </div>
            <div className="rounded-lg bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              Should be: {formatCurrency(preview.expectedCash)}
            </div>
          </div>

          <ActionForm action={closeDay} submit="Count is correct, close the day" className="space-y-4">
            <input type="hidden" name="branchId" value={preview.branchId} />
            <input type="hidden" name="businessDate" value={preview.businessDate} />
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Money you counted in the till (₦) *
              </label>
              <Input
                name="countedCash"
                type="number"
                step="any"
                defaultValue={preview.expectedCash}
                required
                className="min-h-12 text-lg font-mono font-bold"
                placeholder="Type the money you counted"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                Note (you can leave this empty)
              </label>
              <Input
                name="notes"
                placeholder="If the money is short or plenty, say why. Example: ₦2,000 used to buy fuel."
              />
            </div>
          </ActionForm>
        </div>
      )}

      {/* Historical Closes Ledger */}
      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-bold text-base">Days you have closed before</h3>
            <p className="text-xs text-muted-foreground">Every till count kept, with what was short or plenty</p>
          </div>
          <a
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-primary hover:bg-muted"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(
              ["Shop day,Closed at,Shop,Should be,You counted,Short or plenty,Transfer,POS,How many sales,Note", ...closes.map((row) =>
                [row.businessDate, formatDate(row.closeDate), row.branch, row.expectedCash, row.countedCash, row.variance, row.transferTotal, row.posTotal, row.saleCount, `"${row.notes || ""}"`].join(",")
              )].join("\n")
            )}`}
            download="day-close-audits.csv"
          >
            Download as CSV
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground bg-muted/40 text-xs uppercase tracking-wider">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Shop day</th>
                <th className="px-4 py-3">Shop</th>
                <th className="px-4 py-3">Should be</th>
                <th className="px-4 py-3">You counted</th>
                <th className="px-4 py-3">Short or plenty</th>
                <th className="px-4 py-3">Transfer & POS</th>
                <th className="px-5 py-3">Who closed it</th>
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
                          ? "bg-success-soft text-success"
                          : row.variance < 0
                          ? "bg-danger-soft text-danger"
                          : "bg-warning-soft text-warning"
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
                  <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">No day has been closed yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

