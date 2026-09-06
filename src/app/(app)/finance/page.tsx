import Link from "next/link"
import { getFinance } from "@/app/actions/finance"
import { PageHeader } from "@/components/shared"
import { formatCurrency, formatDate, money } from "@/lib/utils"

export default async function FinancePage() {
  const data = await getFinance()
  return (
    <div className="space-y-6">
      <PageHeader title="Money in & out" description="Cash and bank movements, what customers owe us, and what we owe suppliers." />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Money in</p>
          <p className="text-2xl font-semibold">{formatCurrency(data.inflow)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Money out</p>
          <p className="text-2xl font-semibold">{formatCurrency(data.outflow)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Difference</p>
          <p className="text-2xl font-semibold">{formatCurrency(data.net)}</p>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="surface-card p-5">
          <h3 className="mb-4 font-semibold">Money that moved</h3>
          <div className="space-y-3 text-sm">
            {data.entries.map((entry) => (
              <div key={entry.id} className="flex justify-between border-b border-border/70 pb-2">
                <div>
                  <p className="font-medium">{entry.description}</p>
                  <p className="text-xs text-muted-foreground">{entry.account} · {entry.branch.code} · {formatDate(entry.createdAt)}</p>
                </div>
                <p>{formatCurrency(money(entry.amount))}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="surface-card p-5">
          <h3 className="mb-4 font-semibold">Customers who still owe us</h3>
          <div className="space-y-3 text-sm">
            {data.debtors.map((customer) => (
              <div key={customer.id} className="flex justify-between">
                <Link href={`/customers/${customer.id}`} className="text-primary">{customer.name}</Link>
                <span className="font-medium">{formatCurrency(money(customer.currentBalance))}</span>
              </div>
            ))}
            {data.debtors.length === 0 ? <p className="text-muted-foreground">No customer is owing us.</p> : null}
          </div>
        </div>
        <div className="surface-card p-5 xl:col-span-2">
          <h3 className="mb-4 font-semibold">Suppliers we still owe</h3>
          <div className="space-y-3 text-sm">
            {data.creditors.map((row) => (
              <div key={row.id} className="flex justify-between">
                <Link href={`/suppliers/${row.id}`} className="text-primary">{row.name}</Link>
                <span className="font-medium">{formatCurrency(row.owed)}</span>
              </div>
            ))}
            {data.creditors.length === 0 ? <p className="text-muted-foreground">We do not owe any supplier.</p> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
