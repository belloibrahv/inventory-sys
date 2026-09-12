import Link from "next/link"
import { getBooksCheck, type BooksRange } from "@/app/actions/books-check"
import { BooksPdfButton } from "@/components/books-pdf-button"
import { BooksStatement } from "@/components/books-statement"
import { ExportCsv } from "@/components/export-csv"
import { PageHeader, StatCard, StatGrid } from "@/components/shared"
import { PrintButton } from "@/components/print-button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { booksCsvRows, booksPeriodLabel } from "@/lib/books-pack"
import { formatWatLong, shiftWatDay } from "@/lib/lagos-day"
import { formatCurrency } from "@/lib/utils"

function asRange(value?: string): BooksRange {
  return value === "week" || value === "month" ? value : "day"
}

export default async function BooksCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; date?: string; range?: string; compare?: string }>
}) {
  const { shop, date, range, compare } = await searchParams
  const data = await getBooksCheck(shop, date, asRange(range), compare)
  if (!data) {
    return <p className="text-sm text-muted-foreground">You cannot open Check the books.</p>
  }

  const period = booksPeriodLabel(data.range, data.from, data.to)
  const compared = booksPeriodLabel(data.range, data.priorFrom, data.priorTo)
  const query = (next: { date?: string; range?: string; compare?: string }) => {
    const params = new URLSearchParams({
      shop: data.shopId,
      date: next.date ?? data.businessDate,
      range: next.range ?? data.range,
    })
    const compareValue = next.compare ?? compare
    if (compareValue) params.set("compare", compareValue)
    return `/audit/books?${params.toString()}`
  }

  return (
    <div className="audit-pack space-y-6">
      <div className="books-chrome space-y-6 print:hidden">
        <PageHeader
          title="Check the books"
          description="Bank-style statement for the owner, accountant, and records checker. Open any previous day, compare it with another period, then print or download."
          actions={
            <div className="flex flex-wrap gap-2">
              <BooksPdfButton data={data} />
              <PrintButton label="Print / Save PDF" />
              <ExportCsv
                filename={`${data.statementRef}.csv`}
                label="Download CSV"
                rows={booksCsvRows(data)}
              />
            </div>
          }
        />
        <p className="text-sm">
          <Link href="/audit" className="text-primary">Who did what</Link>
          {" · "}
          <Link href="/finance/close" className="text-primary">Close the day</Link>
          {" · "}
          <Link href="/reports" className="text-primary">Reports</Link>
        </p>

        <form className="surface-card grid gap-3 p-4 md:grid-cols-[1fr_150px_160px_160px_auto] md:items-end">
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
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Compare with</span>
            <Input name="compare" type="date" defaultValue={compare && /^\d{4}-\d{2}-\d{2}$/.test(compare) ? compare : ""} />
          </label>
          <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Recalculate
          </button>
        </form>
        <p className="text-xs text-muted-foreground">
          Leave Compare with empty to use the previous {data.range === "day" ? "day" : data.range === "week" ? "7 days" : "month"}.
          Now showing {period} against {compared}.
        </p>

        <div>
          <p className="mb-2 text-sm font-medium">Open a previous day</p>
          <div className="flex flex-wrap gap-2">
            {data.recentDays.map((row) => {
              const active = data.range === "day" && data.businessDate === row.day
              return (
                <Link
                  key={row.day}
                  href={query({ date: row.day, range: "day" })}
                  className={`rounded-full border px-3 py-1.5 text-xs ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
                >
                  <span className="font-medium">{formatWatLong(row.day)}</span>
                  <span className="ml-1 opacity-80">{row.sales} sale{row.sales === 1 ? "" : "s"}{row.closed ? " · closed" : ""}</span>
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Link href={query({ compare: shiftWatDay(data.businessDate, -1) })} className="rounded-full border border-border px-3 py-1.5">
            Compare with yesterday
          </Link>
          <Link href={query({ compare: shiftWatDay(data.businessDate, -7) })} className="rounded-full border border-border px-3 py-1.5">
            Compare with same day last week
          </Link>
          <Link href={query({ date: shiftWatDay(data.businessDate, -1), range: "day" })} className="rounded-full border border-border px-3 py-1.5">
            Open previous day
          </Link>
        </div>

        <StatGrid>
          <StatCard
            label="Payments received"
            value={formatCurrency(data.collected)}
            hint={`Against ${formatCurrency(data.compare.priorCollected)} · ${data.compare.collected.value}`}
            tone="success"
          />
          <StatCard
            label="Revenue posted"
            value={formatCurrency(data.revenue)}
            hint={`Against ${formatCurrency(data.compare.priorRevenue)} · ${data.compare.revenue.value}`}
          />
          <StatCard
            label="Sales"
            value={String(data.salesCount)}
            hint={`Against ${data.compare.priorCount} · ${data.compare.count.value}`}
          />
          <StatCard
            label="Things still to clear"
            value={String(data.openCount)}
            hint={
              data.openCount
                ? "Each one is listed below and links to where it is fixed"
                : "Nothing is waiting on a person"
            }
            tone={data.openCount ? "danger" : "success"}
          />
        </StatGrid>
      </div>

      <BooksStatement data={data} />
    </div>
  )
}
