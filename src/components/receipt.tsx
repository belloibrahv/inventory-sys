import { formatCurrency, formatDateTime, money } from "@/lib/utils"

type Line = { name: string; imei?: string | null; quantity: number; amount: number; warranty?: string | null }

export function Receipt({
  company,
  invoiceNumber,
  branch,
  address,
  email,
  shopPhone,
  cashier,
  customer,
  phone,
  soldAt,
  items,
  total,
  paid,
  method,
  notes,
}: {
  company: string
  invoiceNumber: string
  branch: string
  address?: string | null
  email?: string | null
  shopPhone?: string | null
  cashier: string
  customer: string
  phone?: string | null
  soldAt: Date
  items: Line[]
  total: number
  paid: number
  method: string
  notes?: string | null
}) {
  const due = Math.max(0, total - paid)
  return (
    <section className="invoice mx-auto w-full max-w-[190mm] overflow-hidden bg-white text-slate-900">
      <header className="flex items-center justify-between gap-4 bg-[#001BCE] px-6 py-5 text-white">
        <div className="flex items-center gap-3">
          <img src="/brand/ab-mark.jpg" alt="" width={48} height={48} className="rounded-full bg-white" />
          <div>
            <p className="text-lg font-semibold tracking-tight">{company}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7CFF86]">Softskills Investment</p>
          </div>
        </div>
        <div className="text-right text-[11px] text-white/80">
          <p className="text-sm font-semibold text-white">SALES INVOICE</p>
          <p>{branch}</p>
          {address ? <p>{address}</p> : null}
          {shopPhone ? <p>{shopPhone}</p> : null}
          {email ? <p>{email}</p> : null}
        </div>
      </header>

      <div className="grid gap-4 border-b border-slate-200 px-6 py-4 text-sm md:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Bill to</p>
          <p className="mt-1 font-semibold">{customer}</p>
          {phone ? <p className="text-slate-600">{phone}</p> : null}
        </div>
        <div className="md:text-right">
          <p className="font-mono text-base font-semibold">{invoiceNumber}</p>
          <p className="text-slate-600">{formatDateTime(soldAt)}</p>
          <p className="text-slate-600">Served by {cashier}</p>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-6 py-2">Item</th>
            <th className="px-3 py-2">IMEI / serial</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-6 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.name}-${index}`} className="border-b border-slate-100">
              <td className="px-6 py-3">
                {item.name}
                {item.warranty ? <span className="block text-[10px] text-slate-500">{item.warranty}</span> : null}
              </td>
              <td className="px-3 py-3 font-mono text-xs">{item.imei ?? "—"}</td>
              <td className="px-3 py-3 text-right">{item.quantity}</td>
              <td className="px-6 py-3 text-right">{formatCurrency(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
        <div className="text-xs text-slate-500">
          <p>Payment: {method}</p>
          {notes ? <p className="mt-1">{notes}</p> : null}
          <p className="mt-3">Goods sold are recorded against this invoice. Later payments, returns, and swaps are posted separately. This invoice cannot be edited.</p>
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span>Total</span><span className="font-semibold">{formatCurrency(total)}</span></div>
          <div className="flex justify-between"><span>Paid</span><span>{formatCurrency(paid)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
            <span>Balance</span>
            <span>{formatCurrency(due)}</span>
          </div>
        </div>
      </div>

      <footer className="flex items-center justify-between bg-slate-50 px-6 py-3 text-[10px] uppercase tracking-[0.16em] text-slate-500">
        <span>Own The Future</span>
        <span>Thank you for buying from Abu Twins</span>
      </footer>
    </section>
  )
}
