import Link from "next/link"
import { closeDay, getDayClosePreview, getDayCloses } from "@/app/actions/day-close"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { formatCurrency, formatDate } from "@/lib/utils"

export default async function DayClosePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const [preview, closes] = await Promise.all([getDayClosePreview(undefined, date), getDayCloses()])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Close the day"
        description="Count the till against cash sales for that business day. Transfer and POS stay on the bank record. Sell now stays locked until older days with sales are closed."
      />
      <p className="text-sm">
        <Link href="/finance" className="text-primary">Back to money in and out</Link>
      </p>
      {preview.unclosed.length ? (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-950 dark:bg-rose-500/10 dark:text-rose-100">
          <p className="font-medium">These days still need a till count</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {preview.unclosed.map((day) => (
              <Link
                key={day}
                href={`/finance/close?date=${day}`}
                className={`rounded-lg px-3 py-2 min-h-11 inline-flex items-center ${day === preview.businessDate ? "bg-rose-200 font-medium" : "bg-white/70 dark:bg-black/20"}`}
              >
                {day}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Cash expected</p>
          <p className="text-2xl font-semibold">{formatCurrency(preview.expectedCash)}</p>
          <p className="text-xs text-muted-foreground">{preview.businessDate}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Transfers</p>
          <p className="text-2xl font-semibold">{formatCurrency(preview.transferTotal)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">POS</p>
          <p className="text-2xl font-semibold">{formatCurrency(preview.posTotal)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Sales this day</p>
          <p className="text-2xl font-semibold">{preview.saleCount}</p>
        </div>
      </div>
      {preview.alreadyClosed ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          This shop already closed {preview.businessDate}.
        </p>
      ) : (
        <div className="surface-card p-5">
          <h3 className="mb-3 font-semibold">Count the cash for {preview.businessDate}</h3>
          <ActionForm action={closeDay} submit="Close this day" className="space-y-3">
            <input type="hidden" name="branchId" value={preview.branchId} />
            <input type="hidden" name="businessDate" value={preview.businessDate} />
            <Input name="countedCash" type="number" defaultValue={preview.expectedCash} required className="min-h-12" />
            <Input name="notes" placeholder="Shortfall, leftover, or notes" />
          </ActionForm>
        </div>
      )}
      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h3 className="font-semibold">Past closes</h3>
          <a
            className="text-sm text-primary"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(
              ["Business day,Closed at,Shop,Expected cash,Counted,Variance,Transfer,POS,Sales", ...closes.map((row) =>
                [row.businessDate, formatDate(row.closeDate), row.branch, row.expectedCash, row.countedCash, row.variance, row.transferTotal, row.posTotal, row.saleCount].join(",")
              )].join("\n")
            )}`}
            download="day-close.csv"
          >
            Download CSV
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-y border-border">
                <th className="px-5 py-3">Business day</th>
                <th className="px-3 py-3">Shop</th>
                <th className="px-3 py-3">Expected</th>
                <th className="px-3 py-3">Counted</th>
                <th className="px-5 py-3">Variance</th>
              </tr>
            </thead>
            <tbody>
              {closes.map((row) => (
                <tr key={row.id} className="border-b border-border/70">
                  <td className="px-5 py-3">{row.businessDate}</td>
                  <td className="px-3 py-3">{row.branch}</td>
                  <td className="px-3 py-3">{formatCurrency(row.expectedCash)}</td>
                  <td className="px-3 py-3">{formatCurrency(row.countedCash)}</td>
                  <td className="px-5 py-3">{formatCurrency(row.variance)}</td>
                </tr>
              ))}
              {closes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-muted-foreground">No day close yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
