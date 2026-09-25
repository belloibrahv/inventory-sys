import Link from "next/link"
import { notFound } from "next/navigation"
import { reverseSupplierPayment } from "@/app/actions/access"
import { bookPurchaseAsComing } from "@/app/actions/incoming"
import { getPurchase, payPurchase, receivePurchaseImeis } from "@/app/actions/ops"
import { ExportCsv } from "@/components/export-csv"
import { prisma } from "@/lib/prisma"
import { isShopOwner } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { ScanList } from "@/components/scan-field"
import { statusLabel } from "@/lib/status"
import { formatCurrency, formatDate, formatDateTime, money } from "@/lib/utils"
import { isOpeningStockPurchase, purchaseBalance } from "@/lib/purchase-money"

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [me, purchase] = await Promise.all([requireUser(), getPurchase(id)])
  if (!purchase) notFound()
  const opening = await prisma.openingStock.findUnique({
    where: { purchaseId: purchase.id },
    select: { status: true, branchId: true },
  })
  const isOpening = isOpeningStockPurchase({
    invoiceNumber: purchase.invoiceNumber,
    openingStock: opening,
  })
  const item = purchase.items[0]
  const remaining = item ? item.quantity - item.receivedQty : 0
  const billMoney = purchaseBalance(purchase.totalAmount, purchase.paidAmount, purchase.returnedAmount)
  const due = isOpening ? 0 : billMoney.owed
  const surplus = isOpening ? 0 : billMoney.surplus
  const step = isOpening
    ? (opening?.status === "CLOSED" ? 2 : 1)
    : purchase.status === "RECEIVED" && due <= 0
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
        backHref="/purchases"
        title={purchase.invoiceNumber}
        description={
          isOpening
            ? `Opening stock · ${purchase.branch.name} · ${formatDate(purchase.createdAt)}`
            : `${purchase.supplier.name}${origin ? ` from ${origin}` : ""} · ${purchase.branch.name} · ${formatDate(purchase.createdAt)}`
        }
      />
      {isOpening ? (
        <div className="surface-card space-y-3 p-5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Opening stock {formatCurrency(money(purchase.totalAmount))}</p>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Value only. Not a bill to pay.
            </span>
          </div>
          {purchase.notes ? <p className="text-muted-foreground">{purchase.notes}</p> : null}
          {opening ? (
            <p className="text-sm">
              {opening.status === "OPEN" ? "Still being counted. " : "Closed. "}
              <Link href={`/opening-stock?branchId=${opening.branchId}`} className="font-medium text-primary hover:underline">
                {opening.status === "OPEN" ? "Count and close" : "See opening stock"}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
      <WorkflowSteps
        current={step}
        steps={
          isOpening
            ? ["Loaded", "Counted", "Closed"]
            : ["On the bill", "Coming", "In this shop", "Paid"]
        }
      />
      {trace.shortVsBill > 0 || trace.tracking === "NONE" ? (
        <div className="surface-card space-y-2 p-5 text-sm">
          {trace.shortVsBill > 0 ? (
            <p className="text-warning">
              {trace.shortVsBill} unit{trace.shortVsBill === 1 ? "" : "s"} on this bill were never scanned.
            </p>
          ) : null}
          {trace.tracking === "NONE" ? (
            <p className="text-muted-foreground">This item has no unique number. Sold can mix more than one carton.</p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge value={purchase.status} />
          <p className="mt-3 text-sm">Value {formatCurrency(money(purchase.totalAmount))}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">On the supplier bill</p>
          <p className="text-2xl font-semibold">{trace.expected}</p>
          <p className="text-sm text-muted-foreground">{item?.product.name}</p>
          {origin ? <p className="mt-2 text-sm text-muted-foreground">{origin}</p> : null}
          {purchase.expectedDate ? <p className="text-sm text-muted-foreground">Due {formatDate(purchase.expectedDate)}</p> : null}
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Scanned into the shop</p>
          <p className="text-2xl font-semibold">{trace.recorded}</p>
          <p className="text-sm text-muted-foreground">Never scanned {trace.shortVsBill}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">{isOpening ? "Not a bill to pay" : surplus > 0 ? "Value owing (+)" : "Value owing (-)"}</p>
          <p className="text-xl font-semibold text-success">
            {isOpening ? "Value only" : formatCurrency(surplus > 0 ? surplus : due)}
          </p>
          {isOpening ? null : (
            <p className="text-xs text-muted-foreground">
              Paid {formatCurrency(money(purchase.paidAmount))}
              {billMoney.sentBack > 0 ? ` · sent back ${formatCurrency(billMoney.sentBack)}` : ""}
            </p>
          )}
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Coming</p>
          <p className="text-2xl font-semibold">{trace.coming}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Still on our shelf</p>
          <p className="text-2xl font-semibold">{trace.inShop}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Sold</p>
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
            <p className="mb-4 text-sm text-muted-foreground">Scan the waybill. Stock does not rise yet.</p>
            <ActionForm action={bookPurchaseAsComing} submit="Book as goods on the way" enterDoesNotSubmit className="space-y-3">
              <input type="hidden" name="id" value={purchase.id} />
              <ScanList name="imeis" kind={item?.product.tracking === "SERIAL" ? "SERIAL" : "IMEI"} required={item?.product.tracking !== "NONE"} />
            </ActionForm>
          </div>
          <div className="surface-card p-5">
            <h3 className="mb-2 font-semibold">Already in this shop</h3>
            <p className="mb-4 text-sm text-muted-foreground">Boxes on the counter now. This does not pay the supplier.</p>
            <ActionForm action={receivePurchaseImeis} submit={`Add ${remaining} unit(s) to shop`} enterDoesNotSubmit className="space-y-3">
              <input type="hidden" name="id" value={purchase.id} />
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Unit cost on this carton (₦)</span>
                <Input
                  name="costPrice"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={item ? money(item.costPrice) : 0}
                  required
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Price list now {item ? formatCurrency(money(item.product.costPrice)) : "—"}. If you change it, write why below.
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Note if the cost changed</span>
                <Input name="costNote" placeholder="Example: supplier invoice showed a new cost" />
              </label>
              <ScanList name="imeis" kind={item?.product.tracking === "SERIAL" ? "SERIAL" : "IMEI"} required={false} />
            </ActionForm>
          </div>
        </div>
      ) : (
        <div className="surface-card p-5 text-sm text-success">
          Goods received into {purchase.branch.name}.
        </div>
      )}
      {purchase.imeiRecords.length ? (
        <div className="surface-card overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
            <div>
              <h3 className="font-semibold">Every unit from this bill</h3>
              <p className="mt-1 text-sm text-muted-foreground">Sold rows have the invoice.</p>
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
          No unique numbers on this bill yet. Book Coming IMEIs or confirm arrival.
        </div>
      )}
      {isOpening ? null : due > 0 ? (
        <div className="surface-card p-5">
          <h3 className="mb-2 font-semibold">Pay supplier</h3>
          <p className="mb-4 text-sm text-muted-foreground">This records money leaving. Goods stay as received.</p>
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
      ) : surplus > 0 ? (
        <p className="text-sm text-muted-foreground">
          This house owes us {formatCurrency(surplus)} after send-backs. Do not pay more on this bill.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">This supplier bill is fully paid.</p>
      )}
      {!isOpening && isShopOwner(me.role) && money(purchase.paidAmount) > 0 ? (
        <div className="surface-card p-5">
          <h3 className="mb-2 font-semibold">Undo last supplier payment</h3>
          <p className="mb-3 text-sm text-muted-foreground">Stock and IMEIs stay. Who did what keeps this.</p>
          <ActionForm action={reverseSupplierPayment} submit="Reverse last payment" variant="outline">
            <input type="hidden" name="id" value={purchase.id} />
          </ActionForm>
        </div>
      ) : null}
    </div>
  )
}
