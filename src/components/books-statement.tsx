import Link from "next/link"
import type { BooksCheck } from "@/app/actions/books-check"
import { booksCompareRows, booksMoneyLines, booksPeriodLabel, booksRangeTitle } from "@/lib/books-pack"
import { formatLagosStamp, formatWatLong } from "@/lib/lagos-day"
import { formatCurrency, formatDateTime } from "@/lib/utils"
import { ArrowRight, AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react"

function moneyOrCount(value: number, isMoney: boolean) {
  return isMoney ? formatCurrency(value) : String(value)
}

function movementClass(amount: number) {
  if (amount > 0) return "text-emerald-700"
  if (amount < 0) return "text-rose-700"
  return "text-slate-500"
}

export function BooksStatement({ data }: { data: BooksCheck }) {
  const period = booksPeriodLabel(data.range, data.from, data.to)
  const compared = booksPeriodLabel(data.range, data.priorFrom, data.priorTo)
  const compareRows = booksCompareRows(data)
  const moneyLines = booksMoneyLines(data)
  const openPapers = data.papers.filter((row) => !row.ok)

  return (
    <section className="books-statement mx-auto w-full max-w-[210mm] overflow-hidden bg-white text-slate-900 shadow-[0_18px_50px_rgba(0,27,206,0.12)]">
      <header className="relative overflow-hidden bg-[#001BCE] px-6 py-6 text-white">
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-[#18C020]/25" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-24 w-24 rounded-full bg-[#7CFF86]/15" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/brand/ab-mark.jpg" alt="" width={56} height={56} className="rounded-full bg-white ring-2 ring-[#7CFF86]" />
            <div>
              <p className="text-lg font-semibold tracking-tight">{data.company.name}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7CFF86]">Softskills Investment</p>
              <p className="mt-1 text-[11px] text-white/75">{data.company.address}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7CFF86]">Financial Audit Statement</p>
            <p className="mt-1 text-xl font-semibold">{booksRangeTitle(data.range)}</p>
            <p className="font-mono text-xs text-white/80">{data.statementRef}</p>
            <p className="text-[11px] text-white/70">Lagos time {formatLagosStamp(new Date(data.preparedAt))}</p>
          </div>
        </div>
        <div className="relative mt-5 grid gap-3 border-t border-white/15 pt-4 text-[12px] sm:grid-cols-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">Shop Location</p>
            <p className="font-semibold">{data.shopName}</p>
            <p className="text-white/70">{data.shopCode}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">Period Covered</p>
            <p className="font-semibold">{period}</p>
            <p className="text-white/70">Compared with {compared}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">Prepared By</p>
            <p className="font-semibold">{data.preparedBy}</p>
            <p className="text-white/70">{data.openCount === 0 ? "Books clean & balanced" : `${data.openCount} open issue(s)`}</p>
          </div>
        </div>
        {openPapers.length ? (
          <div className="relative mt-4 flex flex-wrap gap-2 border-t border-white/15 pt-3">
            {openPapers.map((row) =>
              row.href ? (
                <Link
                  key={row.label}
                  href={row.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-white px-3 py-1 text-[11px] font-semibold text-rose-800 shadow-xs hover:bg-rose-50 transition-colors"
                >
                  <AlertCircle className="h-3 w-3" />
                  {row.label} &rarr;
                </Link>
              ) : (
                <span
                  key={row.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-white px-3 py-1 text-[11px] font-semibold text-rose-800"
                >
                  <AlertCircle className="h-3 w-3" />
                  {row.label}
                </span>
              )
            )}
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-4 divide-x divide-slate-200 border-b border-slate-200">
        {[
          ["Sales volume", String(data.salesCount)],
          ["Payment received", formatCurrency(data.methodSum)],
          ["Total sales", formatCurrency(data.revenue)],
          ["Total expenditure", formatCurrency(data.moneyOut)],
        ].map(([label, value]) => (
          <div key={label} className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="px-6 py-5">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Comparative Performance Analysis</h3>
            <p className="text-[11px] text-slate-500">Performance variance against {compared}.</p>
          </div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#001BCE]">Executive Audit Pack</p>
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-2">Line Item</th>
              <th className="py-2 pr-2 text-right">Current Period</th>
              <th className="py-2 pr-2 text-right">Comparative</th>
              <th className="py-2 text-right">Variance</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map((row) => (
              <tr key={row.label} className="border-b border-slate-100">
                <td className="py-1.5 pr-2">{row.label}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums font-medium">{moneyOrCount(row.now, row.money)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{moneyOrCount(row.then, row.money)}</td>
                <td className={`py-1.5 text-right tabular-nums ${movementClass(row.change.amount)}`}>
                  {row.money ? formatCurrency(row.change.amount) : (row.change.amount > 0 ? `+${row.change.amount}` : row.change.amount)}
                  <span className="ml-1 text-[10px]">{row.change.value}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid border-t border-slate-200 md:grid-cols-2">
        <div className="border-b border-slate-200 px-6 py-5 md:border-b-0 md:border-r">
          <h3 className="text-sm font-semibold">Financial Reconciliation Summary</h3>
          <p className="mb-3 text-[11px] text-slate-500">Structured accounting breakdown. All figures verified to balance.</p>
          <div className="space-y-1.5 text-[12px]">
            {moneyLines.map((row) => (
              <div key={row.label} className={`flex justify-between gap-3 ${row.total ? "border-t border-slate-200 pt-1.5 font-semibold text-slate-900" : "text-slate-600"}`}>
                <span>{row.label}</span>
                <span className="tabular-nums text-slate-900">{formatCurrency(row.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold">Internal Audit Controls & Verifications</h3>
            <span className="text-[10px] text-slate-500 font-medium">Flags clear automatically when resolved</span>
          </div>
          <p className="mb-3 text-[11px] text-slate-500">Click any flagged item to open the relevant page. Follow the &ldquo;How to resolve&rdquo; steps below each flag — the red icon turns green automatically once the system detects the issue is fixed.</p>
          <div className="space-y-2">
            {data.papers.map((row, index) => {
              const content = (
                <div
                  className={`rounded-lg border text-[12px] transition-colors ${
                    row.ok
                      ? "border-emerald-200/80 bg-emerald-50/40 hover:bg-emerald-50"
                      : "border-rose-300 bg-rose-50/80 hover:bg-rose-100/80 cursor-pointer"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 p-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        {row.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                        )}
                        <p className={`font-semibold ${row.ok ? "text-emerald-950" : "text-rose-950 underline decoration-rose-400 underline-offset-2"}`}>
                          {index + 1}. {row.label}
                        </p>
                      </div>
                      <p className={`text-[11px] mt-0.5 ${row.ok ? "text-slate-600" : "text-rose-900"}`}>{row.detail}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        row.ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-600 text-white shadow-xs"
                      }`}
                    >
                      {row.ok ? "Verified" : "Action Required →"}
                    </span>
                  </div>
                  {!row.ok && row.fix ? (
                    <div className="mx-2 mb-2 rounded-md border border-rose-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-rose-700 mb-1">How to resolve this flag</p>
                      <p className="text-[11px] text-slate-700 leading-relaxed">{row.fix}</p>
                    </div>
                  ) : null}
                </div>
              )

              return row.href ? (
                <Link key={row.label} href={row.href} className="block group">
                  {content}
                </Link>
              ) : (
                <div key={row.label}>{content}</div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid border-t border-slate-200 md:grid-cols-2">
        <div className="border-b border-slate-200 px-6 py-5 md:border-b-0 md:border-r">
          <h3 className="text-sm font-semibold">Payments received by staff</h3>
          <div className="mt-3 space-y-1.5 text-[12px]">
            {data.byStaff.map((row) => (
              <p key={row.name} className="flex justify-between gap-3">
                <span>{row.name} · {row.count} sale{row.count === 1 ? "" : "s"}</span>
                <span className="tabular-nums font-medium">{formatCurrency(row.collected)}</span>
              </p>
            ))}
            {data.byStaff.length === 0 ? <p className="text-slate-500">No completed sales in this period.</p> : null}
          </div>
        </div>
        <div className="px-6 py-5">
          <h3 className="text-sm font-semibold">Receivables, payables, and cash drawer</h3>
          <div className="mt-3 space-y-1.5 text-[12px]">
            <p className="flex justify-between gap-3">
              <span className="text-slate-500">Receivables</span>
              <Link href="/customers" className="tabular-nums font-semibold text-primary hover:underline">
                {formatCurrency(data.customersOwe)}
              </Link>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-slate-500">Suppliers payment (Payables)</span>
              <Link href="/suppliers" className="tabular-nums font-semibold text-primary hover:underline">
                {formatCurrency(data.supplierOwed)}
              </Link>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-slate-500">Walk-in transactions</span>
              <span>{data.walkIns}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-slate-500">Expected cash in till</span>
              <span className="tabular-nums font-medium">{formatCurrency(data.expectedCash)}</span>
            </p>
            <p className="flex justify-between gap-3">
              <span className="text-slate-500">Cash remitted</span>
              <span className="tabular-nums">{data.countedCash == null ? "Not closed" : formatCurrency(data.countedCash)}</span>
            </p>
            <p className="flex justify-between gap-3 font-semibold">
              <span>Shortage / Overage</span>
              <span className={`tabular-nums ${data.variance && data.variance !== 0 ? "text-rose-600" : "text-emerald-700"}`}>
                {data.variance == null ? "Not closed" : formatCurrency(data.variance)}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 px-6 py-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Sales in this time</h3>
          <Link href="/sales" className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium">
            See all sales <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-2">Invoice</th>
              <th className="py-2 pr-2">Buyer</th>
              <th className="py-2 pr-2">Paid by</th>
              <th className="py-2 text-right">Paid</th>
            </tr>
          </thead>
          <tbody>
            {data.invoices.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="py-1.5 pr-2">
                  <span className="font-semibold text-slate-900">{row.invoice}</span>
                  <span className="block text-[10px] text-slate-500">{formatDateTime(row.when)} · {row.staff}</span>
                </td>
                <td className="py-1.5 pr-2 font-medium">{row.customer}</td>
                <td className="py-1.5 pr-2">{row.method}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold">{formatCurrency(row.paid)}</td>
              </tr>
            ))}
            {data.invoices.length === 0 ? (
              <tr><td colSpan={4} className="py-4 text-slate-500">No completed sales in this period.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="grid border-t border-slate-200 md:grid-cols-2">
        <div className="border-b border-slate-200 px-6 py-5 md:border-b-0 md:border-r">
          <h3 className="text-sm font-semibold">Days we closed</h3>
          <table className="mt-3 w-full text-[11px]">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-2">Day</th>
                <th className="py-2 pr-2 text-right">Total sales</th>
                <th className="py-2 text-right">Shortage / Overage</th>
              </tr>
            </thead>
            <tbody>
              {data.closes.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2">
                    <Link href={`/finance/close?date=${row.day}`} className="hover:underline font-medium text-primary">
                      {formatWatLong(row.day)}
                    </Link>
                    <span className="block text-[10px] text-slate-500">{row.staff}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{formatCurrency(row.totalSales ?? row.expected)}</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">
                    <span className={row.variance === 0 ? "text-emerald-700" : "text-rose-700"}>
                      {row.variance === 0 ? "Balanced" : (row.variance > 0 ? `+${formatCurrency(row.variance)}` : formatCurrency(row.variance))}
                    </span>
                  </td>
                </tr>
              ))}
              {data.closes.length === 0 ? (
                <tr><td colSpan={3} className="py-4 text-slate-500">No till close in this period.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">IMEI list against shop count</h3>
            <Link href="/inventory" className="text-[11px] text-primary hover:underline font-medium">
              Open Shop stock →
            </Link>
          </div>
          <table className="mt-3 w-full text-[11px]">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-2">Item</th>
                <th className="py-2 pr-2 text-right">Shop count / IMEI count</th>
                <th className="py-2 text-right">Do they agree?</th>
              </tr>
            </thead>
            <tbody>
              {data.imeiRows.map((row) => (
                <tr key={`${row.product}-${row.shop}`} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 font-medium">{row.product}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-mono">{row.shopQty} / {row.imeis}</td>
                  <td className="py-1.5 text-right tabular-nums font-bold">
                    <span className={row.delta === 0 ? "text-emerald-700" : "text-rose-600"}>
                      {row.delta === 0 ? "✓ Match" : row.delta > 0 ? `${row.delta} extra` : `${Math.abs(row.delta)} missing`}
                    </span>
                  </td>
                </tr>
              ))}
              {data.imeiRows.length === 0 ? (
                <tr><td colSpan={3} className="py-4 text-slate-500">No phone or serial item in this shop.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auditor Verification & Sign-Off Block */}
      <div className="border-t border-slate-200 bg-slate-50/60 px-6 py-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-900">Auditor Certification & Statutory Attestation</p>
            <p>
              I have examined the underlying cash registers, daily till reconciliations, serialized asset ledgers, and authorized disbursements for the stated period. In my professional opinion, this statement presents fairly, in all material respects, the financial position and inventory valuation of the enterprise.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 border-t border-slate-200 px-6 py-8 sm:grid-cols-3">
        {[
          ["Prepared by (Internal Auditor)", data.preparedBy],
          ["Verified by (Financial Accountant)", ""],
          ["Approved by (Managing Director)", ""],
        ].map(([title, name]) => (
          <div key={title}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
            {name ? <p className="mt-1 text-sm font-medium">{name}</p> : <p className="mt-1 h-5" />}
            <div className="mt-8 border-b border-slate-400" />
            <p className="mt-1 text-[10px] text-slate-500">Signature and date</p>
          </div>
        ))}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-6 py-3 text-[10px] text-slate-500">
        <p>{data.company.phone} · {data.company.email}</p>
        <p>Software by Techvaults Limited · Certified Financial &amp; Inventory Audit Statement.</p>
      </footer>
    </section>
  )
}

