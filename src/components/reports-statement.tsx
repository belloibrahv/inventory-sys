import type { ReportsPack } from "@/lib/reports-pack"
import { reportsKpis } from "@/lib/reports-pack"
import { formatLagosStamp } from "@/lib/lagos-day"
import { formatCurrency } from "@/lib/utils"

export function ReportsStatement({ data }: { data: ReportsPack }) {
  const kpis = reportsKpis(data)

  return (
    <section className="reports-statement mx-auto hidden w-full max-w-[210mm] overflow-hidden bg-white text-slate-900 print:block">
      <header className="relative overflow-hidden bg-[#001BCE] px-6 py-5 text-white">
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[#18C020]/25" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-20 w-20 rounded-full bg-[#7CFF86]/15" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/brand/ab-mark.jpg" alt="" width={52} height={52} className="rounded-full bg-white ring-2 ring-[#7CFF86]" />
            <div>
              <p className="text-lg font-semibold tracking-tight">{data.company.name}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7CFF86]">Softskills Investment</p>
              <p className="mt-1 text-[11px] text-white/75">{data.company.address}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7CFF86]">Report for the boss</p>
            <p className="mt-1 text-xl font-semibold">How the shops are doing</p>
            <p className="font-mono text-xs text-white/80">{data.statementRef}</p>
            <p className="text-[11px] text-white/70">Lagos time {formatLagosStamp(new Date(data.preparedAt))}</p>
          </div>
        </div>
        <div className="relative mt-4 grid gap-3 border-t border-white/15 pt-3 text-[12px] sm:grid-cols-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">Which shops</p>
            <p className="font-semibold">{data.scope}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">Written by</p>
            <p className="font-semibold">{data.preparedBy}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">What is inside</p>
            <p className="font-semibold">Every finished record you are allowed to see</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-4 divide-x divide-slate-200 border-b border-slate-200">
        {kpis.map((row) => (
          <div key={row.label} className="px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{row.label}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">
              {row.money ? formatCurrency(row.value) : String(row.value)}
            </p>
          </div>
        ))}
      </div>

      <div className="px-6 py-4">
        <h3 className="text-sm font-semibold">Shop by shop</h3>
        <table className="mt-2 w-full text-[11px]">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="py-1.5 pr-2">Shop</th>
              <th className="py-1.5 pr-2 text-right">Sales</th>
              <th className="py-1.5 pr-2 text-right">Revenue</th>
              <th className="py-1.5 text-right">Collected</th>
            </tr>
          </thead>
          <tbody>
            {data.byShop.map((row) => (
              <tr key={row.name} className="border-b border-slate-100">
                <td className="py-1.5 pr-2 font-medium">{row.name}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{row.tickets}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatCurrency(row.revenue)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(row.collected)}</td>
              </tr>
            ))}
            {data.byShop.length === 0 ? (
              <tr><td colSpan={4} className="py-3 text-slate-500">No completed sales in this scope.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="grid border-t border-slate-200 md:grid-cols-2">
        <div className="border-b border-slate-200 px-6 py-4 md:border-b-0 md:border-r">
          <h3 className="text-sm font-semibold">Customers still owe us</h3>
          <table className="mt-2 w-full text-[11px]">
            <tbody>
              {data.debtors.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-1 pr-2">{row.name} · {row.shop}</td>
                  <td className="py-1 text-right tabular-nums font-medium">{formatCurrency(row.amount)}</td>
                </tr>
              ))}
              {data.debtors.length === 0 ? (
                <tr><td colSpan={2} className="py-3 text-slate-500">No customer owes us anything.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4">
          <h3 className="text-sm font-semibold">Supplier bills we have not paid</h3>
          <table className="mt-2 w-full text-[11px]">
            <tbody>
              {data.creditors.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-1 pr-2">{row.invoice} · {row.supplier} · {row.shop}</td>
                  <td className="py-1 text-right tabular-nums font-medium">{formatCurrency(row.owed)}</td>
                </tr>
              ))}
              {data.creditors.length === 0 ? (
                <tr><td colSpan={2} className="py-3 text-slate-500">We have paid every supplier bill.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-slate-200 px-6 py-4">
        <h3 className="text-sm font-semibold">Items running low</h3>
        <table className="mt-2 w-full text-[11px]">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="py-1.5 pr-2">Item</th>
              <th className="py-1.5 pr-2">Shop</th>
              <th className="py-1.5 text-right">On shelf / lowest allowed</th>
            </tr>
          </thead>
          <tbody>
            {data.lowStock.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="py-1.5 pr-2">{row.product}</td>
                <td className="py-1.5 pr-2">{row.shop}</td>
                <td className="py-1.5 text-right tabular-nums">{row.quantity} / {row.min}</td>
              </tr>
            ))}
            {data.lowStock.length === 0 ? (
              <tr><td colSpan={3} className="py-3 text-slate-500">No item is running low.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-6 py-3 text-[10px] text-slate-500">
        <p>{data.company.phone} · {data.company.email}</p>
        <p>Software by Techvaults Limited · This paper does not change any sale.</p>
      </footer>
    </section>
  )
}
