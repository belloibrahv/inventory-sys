import { notFound } from "next/navigation"
import { reverseSupplierPayment } from "@/app/actions/access"
import { bookPurchaseAsComing } from "@/app/actions/incoming"
import { getPurchase, payPurchase, receivePurchaseImeis } from "@/app/actions/ops"
import { isSuperAdmin } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { ScanList } from "@/components/scan-field"
import { formatCurrency, formatDate, money } from "@/lib/utils"

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [me, purchase] = await Promise.all([requireUser(), getPurchase(id)])
  if (!purchase) notFound()
  const item = purchase.items[0]
  const remaining = item ? item.quantity - item.receivedQty : 0
  const due = money(purchase.totalAmount) - money(purchase.paidAmount)
  const step = purchase.status === "RECEIVED" ? 4 : purchase.status === "PARTIAL_RECEIVED" ? 3 : 2

  return (
    <div className="space-y-6">
      <PageHeader
        title={purchase.invoiceNumber}
        description={`${purchase.supplier.name} → ${purchase.branch.name} · ${formatDate(purchase.createdAt)}`}
      />
      <WorkflowSteps
        current={step}
        steps={["Order raised", "Coming", "Scan and check", "In shop", "Pay supplier"]}
      />
      <div className="grid gap-4 md:grid-cols-4">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge value={purchase.status} />
          <p className="mt-3 text-sm">Value {formatCurrency(money(purchase.totalAmount))}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Expected</p>
          <p className="text-2xl font-semibold">{item?.quantity ?? 0}</p>
          <p className="text-sm text-muted-foreground">{item?.product.name}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Units still expected</p>
          <p className="text-2xl font-semibold">{remaining}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Supplier still owed</p>
          <p className="text-2xl font-semibold">{formatCurrency(due)}</p>
          <p className="text-xs text-muted-foreground">Paid {formatCurrency(money(purchase.paidAmount))}</p>
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
          Goods received. These units can now be sold or sent to another shop from {purchase.branch.name}.
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
