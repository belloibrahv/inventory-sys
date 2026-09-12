import Link from "next/link"
import { notFound } from "next/navigation"
import { reverseInvoicePayment } from "@/app/actions/access"
import { attachSaleCustomer, collectInvoicePayment, getSale } from "@/app/actions/sales"
import { getSettings } from "@/app/actions/finance"
import { getCustomers } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { PrintButton } from "@/components/print-button"
import { ReceiptPdfButton } from "@/components/receipt-pdf-button"
import { AutoPrint } from "@/components/auto-print"
import { Receipt } from "@/components/receipt"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { isSuperAdmin } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { formatCurrency, formatDateTime, money } from "@/lib/utils"
import { statusLabel } from "@/lib/status"
import { warrantyState } from "@/lib/warranty"

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ receipt?: string }>
}) {
  const { id } = await params
  // The till sends the cashier straight here after a sale, asking for the
  // receipt to print itself.
  const { receipt } = await searchParams
  const [me, sale, settings, customers] = await Promise.all([requireUser(), getSale(id), getSettings(), getCustomers()])
  if (!sale) notFound()
  const due = money(sale.totalAmount) - money(sale.paidAmount)
  const company = settings.find((row) => row.key === "company.name")?.value || "Abu Twins"
  const branchCustomers = customers.filter(
    (row) => row.branchId === sale.branchId && !row.name.toLowerCase().includes("walk-in")
  )

  const receiptData = {
    company,
    invoiceNumber: sale.invoiceNumber,
    branch: sale.branch.name,
    address: settings.find((row) => row.key === "company.address")?.value || sale.branch.address,
    shopPhone: settings.find((row) => row.key === "company.phone")?.value || sale.branch.phone,
    email: settings.find((row) => row.key === "company.email")?.value,
    cashier: sale.user.name ?? "Staff",
    customer: sale.customer?.name ?? null,
    customerPhone: sale.customer?.phone ?? null,
    soldAt: formatDateTime(sale.saleDate),
    items: sale.items.map((item) => ({
      name: item.product.name,
      imei: item.imei?.imei1,
      quantity: item.quantity,
      amount: money(item.totalPrice),
      warranty: warrantyState(sale.saleDate, item.product.warrantyDays).label,
    })),
    total: money(sale.totalAmount),
    paid: money(sale.paidAmount),
    method: statusLabel(sale.paymentMethod),
    notes: sale.notes,
  }

  return (
    <>
      <AutoPrint when={receipt === "1"} />
    <div className="space-y-6">
      <PageHeader
        title={sale.invoiceNumber}
        description={`${sale.branch.name} · ${formatDateTime(sale.saleDate)} · posted by ${sale.user.name}`}
        actions={
          <>
            <ReceiptPdfButton data={receiptData} />
            <PrintButton label="Print invoice" />
          </>
        }
      />
      <div className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning print:hidden">
        This sale cannot be changed. Staff cannot edit items, IMEIs, or prices. Collect any remaining money below.
      </div>
      <div className="grid gap-4 md:grid-cols-3 print:hidden">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Customer</p>
          <p className="font-semibold">
            {sale.customer ? (
              <Link href={`/customers/${sale.customer.id}`} className="text-primary">{sale.customer.name}</Link>
            ) : (
              "Walk-in. Put a buyer name on it before anybody can return it"
            )}
          </p>
          <p className="text-sm text-muted-foreground">{sale.customer?.phone}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge value={sale.status} />
          <p className="mt-2 text-sm text-muted-foreground">{statusLabel(sale.paymentMethod)}{sale.isWholesale ? " · wholesale" : ""}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Amount paid</p>
          <p className="text-2xl font-semibold">{formatCurrency(money(sale.paidAmount))}</p>
          <p className="text-sm text-muted-foreground">
            of {formatCurrency(money(sale.totalAmount))}
            {due > 0 ? ` · still due ${formatCurrency(due)}` : " · settled"}
          </p>
        </div>
      </div>
      <div className="surface-card overflow-hidden print:hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">IMEI</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id} className="border-b border-border/70">
                <td className="px-4 py-3">{item.product.name}</td>
                <td className="px-4 py-3">
                  {item.imei ? (
                    <Link href={`/imei/${item.imei.id}`} className="text-primary">{item.imei.imei1}</Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">{formatCurrency(money(item.totalPrice))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sale.payments.length ? (
        <div className="surface-card p-5 print:hidden">
          <h3 className="mb-3 font-semibold">Payments</h3>
          <div className="space-y-2 text-sm">
            {sale.payments.map((payment) => (
              <div key={payment.id} className="flex justify-between border-b border-border/70 pb-2">
                <span>{payment.method}{payment.notes ? ` · ${payment.notes}` : ""}</span>
                <span>{formatCurrency(money(payment.amount))}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {!sale.customerId ? (
        <div className="surface-card p-5 print:hidden">
          <h3 className="mb-2 font-semibold">Attach named buyer</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Items, IMEIs, and prices stay as they are. Warranty and returns need a customer name. Any unpaid balance becomes what this customer owes.
          </p>
          <ActionForm action={attachSaleCustomer} submit="Attach buyer" className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="saleId" value={sale.id} />
            <Select name="customerId" defaultValue="" className="md:col-span-2">
              <option value="">Add a new customer below, or pick one from this shop</option>
              {branchCustomers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.phone}
                </option>
              ))}
            </Select>
            <Input name="name" placeholder="Full name" />
            <Input name="phone" placeholder="Phone" />
          </ActionForm>
        </div>
      ) : null}
      {isSuperAdmin(me.role) && sale.payments.length ? (
        <div className="surface-card p-5 print:hidden">
          <h3 className="mb-2 font-semibold">Undo the last money collected</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Main admin only. Items and IMEIs stay as they are. The last money collected is taken off the record.
          </p>
          <ActionForm action={reverseInvoicePayment} submit="Reverse last payment" variant="outline">
            <input type="hidden" name="saleId" value={sale.id} />
          </ActionForm>
        </div>
      ) : null}
      {due > 0 && sale.customerId ? (
        <div className="surface-card p-5 print:hidden">
          <h3 className="mb-3 font-semibold">Collect the rest of the money</h3>
          <ActionForm action={collectInvoicePayment} submit="Save this payment" className="grid gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
            <input type="hidden" name="saleId" value={sale.id} />
            <Input name="amount" type="number" defaultValue={due} required />
            <Select name="method" defaultValue="TRANSFER">
              <option value="CASH">Cash</option>
              <option value="TRANSFER">Transfer</option>
              <option value="POS">POS</option>
            </Select>
          </ActionForm>
        </div>
      ) : null}
      <div className="surface-card overflow-hidden print:border-0 print:shadow-none">
        <Receipt
          company={company}
          invoiceNumber={sale.invoiceNumber}
          branch={sale.branch.name}
          address={settings.find((row) => row.key === "company.address")?.value || sale.branch.address}
          shopPhone={settings.find((row) => row.key === "company.phone")?.value || sale.branch.phone}
          email={settings.find((row) => row.key === "company.email")?.value}
          cashier={sale.user.name ?? "Staff"}
          customer={sale.customer?.name ?? "Walk-in"}
          phone={sale.customer?.phone}
          soldAt={sale.saleDate}
          items={sale.items.map((item) => ({
            name: item.product.name,
            imei: item.imei?.imei1,
            quantity: item.quantity,
            amount: money(item.totalPrice),
            warranty: warrantyState(sale.saleDate, item.product.warrantyDays).label,
          }))}
          total={money(sale.totalAmount)}
          paid={money(sale.paidAmount)}
          method={statusLabel(sale.paymentMethod)}
          notes={sale.notes}
        />
      </div>
    </div>
    </>
  )
}
