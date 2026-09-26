import { notFound } from "next/navigation"
import { getCustomer } from "@/app/actions/parties"
import { collectPayment } from "@/app/actions/sales"
import { ActionForm } from "@/components/action-form"
import { CollectMoneyFields } from "@/components/collect-money-fields"
import { PageHeader, StatusBadge } from "@/components/shared"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import { warrantyState } from "@/lib/warranty"
import { statusLabel } from "@/lib/status"
import { prisma } from "@/lib/prisma"

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const customer = await getCustomer(id)
  if (!customer) notFound()
  const banks = await prisma.bankAccount.findMany({
    where: { isActive: true, branchId: customer.branchId },
    orderBy: [{ bankName: "asc" }, { accountNumber: "asc" }],
    select: { id: true, bankName: true, accountNumber: true, accountName: true },
  })

  return (
    <div className="space-y-6">
      <PageHeader backHref="/customers" title={customer.name} description={`${customer.phone} · ${customer.branch.name}`} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Still owing</p>
          <p className="text-2xl font-semibold">{formatCurrency(money(customer.currentBalance))}</p>
          <p className="text-xs text-muted-foreground">Credit limit {formatCurrency(money(customer.creditLimit))}</p>
        </div>
        <div className="surface-card p-5 md:col-span-2">
          <h3 className="mb-3 font-semibold">Collect money</h3>
          <ActionForm action={collectPayment} submit="Record payment" className="grid gap-3 md:grid-cols-1 md:items-end">
            <input type="hidden" name="customerId" value={customer.id} />
            <CollectMoneyFields banks={banks} allowSplit />
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
              <div key={sale.id} className="flex items-start justify-between gap-3 border-b border-border/70 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <a href={`/sales/${sale.id}`} className="whitespace-nowrap font-medium text-primary hover:underline">{sale.invoiceNumber}</a>
                  <div className="mt-1">
                    <StatusBadge value={money(sale.paidAmount) >= money(sale.totalAmount) ? "SETTLED" : "DUE"} />
                  </div>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className="font-medium">{formatCurrency(money(sale.totalAmount))}</p>
                  {money(sale.totalAmount) - money(sale.paidAmount) > 0 ? (
                    <p className="text-xs text-warning">Still {formatCurrency(money(sale.totalAmount) - money(sale.paidAmount))}</p>
                  ) : (
                    <p className="text-xs text-success">Paid</p>
                  )}
                </div>
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
