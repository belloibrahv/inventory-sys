import { formatCurrency, formatDateTime, money } from "@/lib/utils"

type Line = { name: string; imei?: string | null; quantity: number; amount: number; warranty?: string | null }

export function Receipt({
  company,
  invoiceNumber,
  branch,
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
    <section className="receipt mx-auto w-full max-w-[148mm] bg-white p-6 text-slate-900">
      <div className="border-b border-slate-200 pb-4 text-center">
        <img src="/brand/ab-mark.jpg" alt="" width={40} height={40} className="mx-auto rounded-full" />
        <p className="mt-2 text-lg font-semibold tracking-tight">{company}</p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#18C020]">Own The Future</p>
        <p className="text-xs text-slate-500">{branch}</p>
        <p className="mt-2 font-mono text-sm">{invoiceNumber}</p>
        <p className="text-xs text-slate-500">{formatDateTime(soldAt)}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <p>Customer<br /><span className="text-sm font-medium">{customer}</span></p>
        <p className="text-right">Cashier<br /><span className="text-sm font-medium">{cashier}</span></p>
        {phone ? <p className="col-span-2">{phone}</p> : null}
      </div>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="py-2">Item</th>
            <th className="py-2">IMEI</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.name}-${index}`} className="border-b border-slate-100">
              <td className="py-2">{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ""}</td>
              <td className="py-2 font-mono text-xs">
                {item.imei ?? "—"}
                {item.warranty ? <span className="block text-[10px] text-slate-500">{item.warranty}</span> : null}
              </td>
              <td className="py-2 text-right">{formatCurrency(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between"><span>Total</span><span className="font-semibold">{formatCurrency(total)}</span></div>
        <div className="flex justify-between"><span>Paid ({method})</span><span>{formatCurrency(paid)}</span></div>
        <div className="flex justify-between"><span>Balance</span><span>{formatCurrency(due)}</span></div>
      </div>
      {notes ? <p className="mt-3 text-xs text-slate-500">{notes}</p> : null}
      <p className="mt-6 text-center text-[11px] text-slate-500">
        This invoice cannot be edited. Returns, swaps, and later payments are recorded separately.
      </p>
    </section>
  )
}
