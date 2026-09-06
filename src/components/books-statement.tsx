import type { BooksCheck } from "@/app/actions/books-check"
import { booksCompareRows, booksMoneyLines, booksPeriodLabel, booksRangeTitle } from "@/lib/books-pack"
import { formatLagosStamp, formatWatLong } from "@/lib/lagos-day"
import { formatCurrency, formatDateTime } from "@/lib/utils"

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
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7CFF86]">Statement of account</p>
            <p className="mt-1 text-xl font-semibold">{booksRangeTitle(data.range)}</p>
            <p className="font-mono text-xs text-white/80">{data.statementRef}</p>
            <p className="text-[11px] text-white/70">Lagos time {formatLagosStamp(new Date(data.preparedAt))}</p>
          </div>
        </div>
        <div className="relative mt-5 grid gap-3 border-t border-white/15 pt-4 text-[12px] sm:grid-cols-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">Shop</p>
            <p className="font-semibold">{data.shopName}</p>
            <p className="text-white/70">{data.shopCode}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">This period</p>
            <p className="font-semibold">{period}</p>
            {data.range !== "day" ? <p className="text-white/70">{data.from} to {data.to}</p> : null}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">
              {data.comparePicked ? "Compared with (picked)" : "Compared with (previous)"}
            </p>
            <p className="font-semibold">{compared}</p>
          </div>
        </div>
      </header>

      <div className={`flex items-start justify-between gap-4 border-b px-6 py-4 ${data.openCount ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Accountant verdict</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{data.verdict}</p>
        </div>
        <p className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${data.openCount ? "bg-rose-600 text-white" : "bg-[#18C020] text-white"}`}>
          {data.openCount ? `${data.openCount} to clear` : "Clean"}
        </p>
      </div>

      <div className="grid grid-cols-4 divide-x divide-slate-200 border-b border-slate-200">
        {[
          ["Sales", String(data.salesCount)],
          ["Collected", formatCurrency(data.collected)],
          ["Posted", formatCurrency(data.revenue)],
          ["Money out", formatCurrency(data.moneyOut)],
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
            <h3 className="text-sm font-semibold">Period comparison</h3>
            <p className="text-[11px] text-slate-500">This period against {compared}.</p>
          </div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#001BCE]">Bank working paper</p>
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-2">Line</th>
              <th className="py-2 pr-2 text-right">This period</th>
              <th className="py-2 pr-2 text-right">Compared</th>
              <th className="py-2 text-right">Movement</th>
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
          <h3 className="text-sm font-semibold">Money add-up</h3>
          <p className="mb-3 text-[11px] text-slate-500">Read top to bottom. The system already added these.</p>
          <div className="space-y-1.5 text-[12px]">
            {moneyLines.map((row) => (
              <div key={row.label} className={`flex justify-between gap-3 ${row.total ? "border-t border-slate-200 pt-1.5 font-semibold" : "text-slate-600"}`}>
                <span>{row.label}</span>
                <span className="tabular-nums text-slate-900">{formatCurrency(row.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 py-5">
          <h3 className="text-sm font-semibold">Working paper</h3>
          <p className="mb-3 text-[11px] text-slate-500">A pass is already proved. A fail needs a person.</p>
          <div className="space-y-2">
            {data.papers.map((row, index) => (
              <div key={row.label} className="flex items-start justify-between gap-3 text-[12px]">
                <div>
                  <p className="font-medium">{index + 1}. {row.label}</p>
                  <p className="text-slate-500">{row.detail}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                  {row.ok ? "Pass" : "Fail"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid border-t border-slate-200 md:grid-cols-2">
        <div className="border-b border-slate-200 px-6 py-5 md:border-b-0 md:border-r">
          <h3 className="text-sm font-semibold">Who collected</h3>
          <div className="mt-3 space-y-1.5 text-[12px]">
            {data.byStaff.map((row) => (
              <p key={row.name} className="flex justify-between gap-3">
                <span>{row.name} · {row.count} sale{row.count === 1 ? "" : "s"}</span>
                <span className="tabular-nums">{formatCurrency(row.collected)}</span>
              </p>
            ))}
            {data.byStaff.length === 0 ? <p className="text-slate-500">No completed sales in this period.</p> : null}
          </div>
        </div>
        <div className="px-6 py-5">
          <h3 className="text-sm font-semibold">Position still open</h3>
          <div className="mt-3 space-y-1.5 text-[12px]">
            <p className="flex justify-between gap-3"><span className="text-slate-500">Customers still owe</span><span className="tabular-nums">{formatCurrency(data.customersOwe)}</span></p>
            <p className="flex justify-between gap-3"><span className="text-slate-500">We still owe suppliers</span><span className="tabular-nums">{formatCurrency(data.supplierOwed)}</span></p>
            <p className="flex justify-between gap-3"><span className="text-slate-500">Walk-in sales</span><span>{data.walkIns}</span></p>
            <p className="flex justify-between gap-3"><span className="text-slate-500">Till expected</span><span className="tabular-nums">{formatCurrency(data.expectedCash)}</span></p>
            <p className="flex justify-between gap-3"><span className="text-slate-500">Till counted</span><span className="tabular-nums">{data.countedCash == null ? "Not closed" : formatCurrency(data.countedCash)}</span></p>
            <p className="flex justify-between gap-3 font-semibold"><span>Till variance</span><span className="tabular-nums">{data.variance == null ? "Not closed" : formatCurrency(data.variance)}</span></p>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 px-6 py-5">
        <h3 className="text-sm font-semibold">Invoices in this period</h3>
        <table className="mt-3 w-full text-[11px]">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-2">Invoice</th>
              <th className="py-2 pr-2">Buyer</th>
              <th className="py-2 pr-2">Method</th>
              <th className="py-2 text-right">Paid</th>
            </tr>
          </thead>
          <tbody>
            {data.invoices.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="py-1.5 pr-2">
                  <span className="font-medium">{row.invoice}</span>
                  <span className="block text-[10px] text-slate-500">{formatDateTime(row.when)} · {row.staff}</span>
                </td>
                <td className="py-1.5 pr-2">{row.customer}</td>
                <td className="py-1.5 pr-2">{row.method}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.paid)}</td>
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
          <h3 className="text-sm font-semibold">Till closes</h3>
          <table className="mt-3 w-full text-[11px]">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-2">Day</th>
                <th className="py-2 pr-2 text-right">Expected</th>
                <th className="py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {data.closes.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2">{formatWatLong(row.day)}<span className="block text-[10px] text-slate-500">{row.staff}</span></td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(row.expected)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.variance)}</td>
                </tr>
              ))}
              {data.closes.length === 0 ? (
                <tr><td colSpan={3} className="py-4 text-slate-500">No till close in this period.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-5">
          <h3 className="text-sm font-semibold">IMEI vs shop count</h3>
          <table className="mt-3 w-full text-[11px]">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-2">Product</th>
                <th className="py-2 pr-2 text-right">Shop</th>
                <th className="py-2 text-right">Gap</th>
              </tr>
            </thead>
            <tbody>
              {data.imeiRows.map((row) => (
                <tr key={`${row.product}-${row.shop}`} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2">{row.product}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{row.shopQty} / {row.imeis}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.delta === 0 ? "Match" : row.delta > 0 ? `+${row.delta}` : row.delta}</td>
                </tr>
              ))}
              {data.imeiRows.length === 0 ? (
                <tr><td colSpan={3} className="py-4 text-slate-500">No serialized stock in this shop.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 border-t border-slate-200 px-6 py-8 sm:grid-cols-3">
        {[
          ["Prepared by", data.preparedBy],
          ["Checked by records", ""],
          ["Owner / CEO", ""],
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
        <p>Software by Techvaults Limited · This pack does not change any invoice.</p>
      </footer>
    </section>
  )
}
