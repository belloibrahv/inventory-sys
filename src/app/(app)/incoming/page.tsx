import { getIncomingLots, getOpenPurchases, markIncomingArrived, setIncomingVisible } from "@/app/actions/incoming"
import { getProducts } from "@/app/actions/catalog"
import { getBranches, getSuppliers } from "@/app/actions/parties"
import { IncomingForm } from "@/app/(app)/incoming/incoming-form"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { can, isSuperAdmin } from "@/lib/permissions"
import { requireUser } from "@/lib/session"

export default async function IncomingPage() {
  const me = await requireUser()
  const [lots, products, branches, suppliers, purchases] = await Promise.all([
    getIncomingLots(),
    getProducts(),
    getBranches(),
    getSuppliers(),
    getOpenPurchases(),
  ])
  const canBook = isSuperAdmin(me.role) || (await can(me.role, "action.incoming"))
  const activeShops = branches.filter((branch) => branch.isActive)

  return (
    <div className="page-split">
      <div>
        <PageHeader
          title="Goods on the way"
          description="Book phones, serial items, and pieces with no number before they reach Ibadan. They stay as Coming until someone confirms they have arrived. Super Admin can show a list to staff who have this screen."
        />
        <div className="space-y-3">
          {lots.length === 0 ? (
            <div className="surface-card p-5 text-sm text-muted-foreground">No goods on the way that you can see.</div>
          ) : null}
          {lots.map((lot) => (
            <div key={lot.id} className="surface-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{lot.lotNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    Going to {lot.branch.name}
                    {lot.supplier ? ` · ${lot.supplier.name}` : ""}
                    {lot.purchase ? ` · order ${lot.purchase.invoiceNumber}` : ""}
                    {lot.expectedDate ? ` · due ${lot.expectedDate.toLocaleDateString("en-NG")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={lot.visible ? "info" : "muted"}>{lot.visible ? "Shown to staff" : "Hidden"}</Badge>
                  <StatusBadge value={lot.status} />
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {lot.items.map((item) => (
                  <li key={item.id}>
                    {item.product.name} × {item.quantity}
                    {item.identity === "IMEI" ? " · IMEIs" : item.identity === "SERIAL" ? " · serials" : " · no number"}
                  </li>
                ))}
              </ul>
              {lot.notes ? <p className="mt-2 text-xs text-muted-foreground">{lot.notes}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {canBook && lot.status === "COMING" ? (
                  <ActionForm action={markIncomingArrived} submit="They have arrived. Add to shop" buttonClassName="" size="sm">
                    <input type="hidden" name="id" value={lot.id} />
                  </ActionForm>
                ) : null}
                {isSuperAdmin(me.role) && lot.status === "COMING" ? (
                  <ActionForm
                    action={setIncomingVisible}
                    submit={lot.visible ? "Hide from other staff" : "Show to staff who can open this page"}
                    variant="outline"
                    size="sm"
                    buttonClassName=""
                  >
                    <input type="hidden" name="id" value={lot.id} />
                    <input type="hidden" name="visible" value={lot.visible ? "false" : "true"} />
                  </ActionForm>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-2 font-semibold">Book before arrival</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Super Admin or Goods intake can scan IMEIs, serials, or enter a simple piece count. Tie the list to a supplier order when you can. Stock in the shops does not go up until arrival is confirmed.
        </p>
        {canBook ? (
          <IncomingForm
            key={lots[0]?.id ?? "empty"}
            products={products.map((product) => ({ id: product.id, name: product.name, tracking: product.tracking }))}
            branches={activeShops.map((branch) => ({ id: branch.id, name: branch.name, isHq: branch.isHq }))}
            suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
            purchases={purchases}
            defaultBranchId={me.branchId}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            You can see lists Super Admin has shown. Ask Super Admin to let you book goods, or to show a hidden list.
          </p>
        )}
      </div>
    </div>
  )
}
