import { notFound } from "next/navigation"
import { getCustomer } from "@/app/actions/parties"
import { collectPayment } from "@/app/actions/sales"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import { warrantyState } from "@/lib/warranty"
import { statusLabel } from "@/lib/status"

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const customer = await getCustomer(id)
  if (!customer) notFound()

  return (
    <div className="space-y-6">
      <PageHeader title={customer.name} description={`${customer.phone} · ${customer.branch.name}`} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Still owing</p>
          <p className="text-2xl font-semibold">{formatCurrency(money(customer.currentBalance))}</p>
          <p className="text-xs text-muted-foreground">Credit limit {formatCurrency(money(customer.creditLimit))}</p>
        </div>
        <div className="surface-card p-5 md:col-span-2">
          <h3 className="mb-3 font-semibold">Collect money</h3>
          <ActionForm action={collectPayment} submit="Record payment" className="grid gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
            <input type="hidden" name="customerId" value={customer.id} />
            <Input name="amount" type="number" placeholder="Amount" required />
            <Select name="method" defaultValue="TRANSFER">
              <option value="CASH">Cash</option>
              <option value="TRANSFER">Transfer</option>
              <option value="POS">POS</option>
            </Select>
          </ActionForm>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="surface-card p-5">
          <h3 className="mb-4 font-semibold">Money history</h3>
          <div className="space-y-3 text-sm">
            {customer.ledgerEntries.map((entry) => (
              <div key={entry.id} className="flex justify-between border-b border-border/70 pb-2">
                <div>
                  <p className="font-medium">{entry.description}</p>
                  <p className="text-xs text-muted-foreground">{entry.reference} · {formatDate(entry.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p>{formatCurrency(money(entry.amount))}</p>
                  <p className="text-xs text-muted-foreground">Bal {formatCurrency(money(entry.balance))}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="surface-card p-5">
          <h3 className="mb-4 font-semibold">Purchases</h3>
          <div className="space-y-3 text-sm">
            {customer.sales.map((sale) => (
              <div key={sale.id} className="flex justify-between gap-3">
                <a href={`/sales/${sale.id}`} className="font-medium text-primary">{sale.invoiceNumber}</a>
                <StatusBadge value={money(sale.paidAmount) >= money(sale.totalAmount) ? "SETTLED" : "DUE"} />
                <span>
                  {formatCurrency(money(sale.paidAmount))} / {formatCurrency(money(sale.totalAmount))}
                  {money(sale.totalAmount) - money(sale.paidAmount) > 0
                    ? ` · still ${formatCurrency(money(sale.totalAmount) - money(sale.paidAmount))}`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {customer.imeiRecords.length ? (
        <div className="surface-card p-5">
          <h3 className="mb-4 font-semibold">Devices & warranty</h3>
          <div className="space-y-3 text-sm">
            {customer.imeiRecords.map((row) => {
              const cover = row.sale ? warrantyState(row.sale.saleDate, row.product.warrantyDays) : null
              return (
                <div key={row.id} className="flex justify-between gap-3 border-b border-border/70 pb-2">
                  <div>
                    <a href={`/imei/${row.id}`} className="font-medium text-primary">{row.imei1}</a>
                    <p className="text-xs text-muted-foreground">{row.product.name} · {statusLabel(row.status)}</p>
                  </div>
                  <span className="text-right text-xs text-muted-foreground">{cover?.label ?? "Not on a sale"}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
