import Link from "next/link"
import { notFound } from "next/navigation"
import { reverseSupplierPayment } from "@/app/actions/access"
import { bookPurchaseAsComing } from "@/app/actions/incoming"
import { getPurchase, payPurchase, receivePurchaseImeis } from "@/app/actions/ops"
import { ExportCsv } from "@/components/export-csv"
import { isSuperAdmin } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { ScanList } from "@/components/scan-field"
import { statusLabel } from "@/lib/status"
import { formatCurrency, formatDate, formatDateTime, money } from "@/lib/utils"

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [me, purchase] = await Promise.all([requireUser(), getPurchase(id)])
  if (!purchase) notFound()
  const item = purchase.items[0]
  const remaining = item ? item.quantity - item.receivedQty : 0
  const due = money(purchase.totalAmount) - money(purchase.paidAmount)
  const step =
    purchase.status === "RECEIVED" && due <= 0
      ? 3
      : purchase.status === "RECEIVED" || purchase.status === "PARTIAL_RECEIVED"
        ? 2
        : purchase.incomingLots.some((lot) => lot.status === "COMING")
          ? 1
          : 0
  const origin = [purchase.originCity || purchase.supplier.city, purchase.originCountry || purchase.supplier.country]
    .filter(Boolean)
    .join(", ")
  const { trace } = purchase
  const csvRows = [
    ["IMEI or serial", "Status", "Shop", "Invoice", "Sold at", "Customer"],
    ...purchase.imeiRecords.map((row) => [
      row.imei1,
      statusLabel(row.status),
      row.branch.name,
      row.sale?.invoiceNumber ?? "",
      row.sale?.saleDate ? formatDateTime(row.sale.saleDate) : "",
      row.customer?.name ?? "",
    ]),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={purchase.invoiceNumber}
        description={`${purchase.supplier.name}${origin ? ` from ${origin}` : ""} → ${purchase.branch.name} · ${formatDate(purchase.createdAt)}`}
      />
      <WorkflowSteps
        current={step}
        steps={["Expected from supplier", "Booked as Coming", "Checked in this shop", "Pay the supplier"]}
      />
      <div className="surface-card space-y-2 p-5 text-sm">
        <p>
          This bill is the trail for missing products. Expected is what the supplier sent. Recorded is what was scanned here.
          Sold on the system already has an invoice. Still in shop is what the system still believes is on the shelf.
        </p>
        {trace.shortVsBill > 0 ? (
          <p className="text-amber-800">
            {trace.shortVsBill} unit{trace.shortVsBill === 1 ? "" : "s"} on this bill were never scanned. They may still be in a carton, or they arrived and left without a number on this system.
          </p>
        ) : null}
        {trace.inShop > 0 ? (
          <p>
            Count the shelf against Still in shop ({trace.inShop}). If the shelf is short, those units may have been sold without recording. Do not type a new shop number by hand. Use Stock count.
          </p>
        ) : null}
        {trace.tracking === "NONE" ? (
          <p className="text-muted-foreground">
            This item has no unique number. Sold on the system is every completed till sale of this item in this shop since the bill date, which can mix more than one carton.
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge value={purchase.status} />
          <p className="mt-3 text-sm">Value {formatCurrency(money(purchase.totalAmount))}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Expected from supplier</p>
          <p className="text-2xl font-semibold">{trace.expected}</p>
          <p className="text-sm text-muted-foreground">{item?.product.name}</p>
          {origin ? <p className="mt-2 text-sm text-muted-foreground">{origin}</p> : null}
          {purchase.expectedDate ? <p className="text-sm text-muted-foreground">Due {formatDate(purchase.expectedDate)}</p> : null}
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Recorded on the system</p>
          <p className="text-2xl font-semibold">{trace.recorded}</p>
          <p className="text-sm text-muted-foreground">Never scanned {trace.shortVsBill}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Supplier still owed</p>
          <p className="text-2xl font-semibold">{formatCurrency(due)}</p>
          <p className="text-xs text-muted-foreground">Paid {formatCurrency(money(purchase.paidAmount))}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Coming</p>
          <p className="text-2xl font-semibold">{trace.coming}</p>
          <p className="text-sm text-muted-foreground">Booked, not yet In shop.</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Still in shop</p>
          <p className="text-2xl font-semibold">{trace.inShop}</p>
          <p className="text-sm text-muted-foreground">What the system says is on the shelf.</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Sold on the system</p>
          <p className="text-2xl font-semibold">{trace.sold}</p>
          <p className="text-sm text-muted-foreground">Sold today (Lagos day) {trace.soldToday}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Other known places</p>
          <p className="text-2xl font-semibold">{trace.inTransit + trace.backToSupplier + trace.otherKnown}</p>
          <p className="text-sm text-muted-foreground">
            Shop to shop {trace.inTransit}
            {" · back to supplier "}
            {trace.backToSupplier}
            {" · return, repair, or other "}
            {trace.otherKnown}
          </p>
        </div>
      </div>
      {purchase.status !== "RECEIVED" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="surface-card p-5">
            <h3 className="mb-2 font-semibold">Book as coming</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Scan the IMEIs on the waybill. They stay as Coming until someone confirms they are in the shop. Stock does not rise yet.
            </p>
            <ActionForm action={bookPurchaseAsComing} submit="Book as goods on the way" className="space-y-3">
              <input type="hidden" name="id" value={purchase.id} />
              <ScanList name="imeis" required={item?.product.tracking !== "NONE"} />
            </ActionForm>
          </div>
          <div className="surface-card p-5">
            <h3 className="mb-2 font-semibold">Already in this shop</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Use this only if the boxes are on the counter now. Receiving stock does not pay the supplier.
            </p>
            <ActionForm action={receivePurchaseImeis} submit={`Add ${remaining} unit(s) to shop`} className="space-y-3">
              <input type="hidden" name="id" value={purchase.id} />
              <ScanList name="imeis" required={false} />
            </ActionForm>
          </div>
        </div>
      ) : (
        <div className="surface-card p-5 text-sm text-emerald-700">
          Goods received into {purchase.branch.name}. These units can now be sold, sent Shop to shop, or later sent back to this supplier if they fail.
        </div>
      )}
      {purchase.imeiRecords.length ? (
        <div className="surface-card overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
            <div>
              <h3 className="font-semibold">Every unit from this bill</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Search this list by IMEI on Goods from supplier or in the top bar. Sold rows have the invoice. In shop rows with no matching phone on the shelf may have left without recording.
              </p>
            </div>
            <ExportCsv filename={`${purchase.invoiceNumber}-units.csv`} rows={csvRows} label="Download this bill as CSV" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">IMEI or serial</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Shop</th>
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Sold at</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                </tr>
              </thead>
              <tbody>
                {purchase.imeiRecords.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-5 py-3">
                      <Link href={`/imei/${row.id}`} className="font-medium text-primary">
                        {row.imei1}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge value={row.status} />
                    </td>
                    <td className="px-5 py-3">{row.branch.name}</td>
                    <td className="px-5 py-3">
                      {row.sale ? (
                        <Link href={`/sales/${row.sale.id}`} className="text-primary">
                          {row.sale.invoiceNumber}
                        </Link>
                      ) : (
                        "No invoice"
                      )}
                    </td>
                    <td className="px-5 py-3">{row.sale?.saleDate ? formatDateTime(row.sale.saleDate) : "Not sold on the system"}</td>
                    <td className="px-5 py-3">{row.customer?.name ?? "No named buyer"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="surface-card p-5 text-sm text-muted-foreground">
          No unique numbers are tied to this bill yet. Book Coming IMEIs or confirm arrival so each unit can be traced later.
        </div>
      )}
      {due > 0 ? (
        <div className="surface-card p-5">
          <h3 className="mb-2 font-semibold">Pay supplier</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Goods and IMEIs stay as received. This only records money leaving the shop.
          </p>
          <ActionForm action={payPurchase} submit="Send payment" className="grid gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
            <input type="hidden" name="id" value={purchase.id} />
            <Input name="amount" type="number" defaultValue={due} required />
            <Select name="method" defaultValue="TRANSFER">
              <option value="TRANSFER">Transfer</option>
              <option value="CASH">Cash</option>
              <option value="POS">POS</option>
            </Select>
          </ActionForm>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">This supplier bill is fully paid.</p>
      )}
      {isSuperAdmin(me.role) && money(purchase.paidAmount) > 0 ? (
        <div className="surface-card p-5">
          <h3 className="mb-2 font-semibold">Undo last supplier payment</h3>
          <p className="mb-3 text-sm text-muted-foreground">Super Admin only. Stock and IMEIs stay as received.</p>
          <ActionForm action={reverseSupplierPayment} submit="Reverse last payment" variant="outline">
            <input type="hidden" name="id" value={purchase.id} />
          </ActionForm>
        </div>
      ) : null}
    </div>
  )
}
