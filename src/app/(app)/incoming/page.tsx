import { getIncomingLots, getOpenPurchases, setIncomingVisible } from "@/app/actions/incoming"
import { getProducts } from "@/app/actions/catalog"
import { getBranches, getSuppliers } from "@/app/actions/parties"
import { IncomingForm } from "@/app/(app)/incoming/incoming-form"
import { PreviewIncomingModal } from "./preview-incoming-modal"
import { ActionForm } from "@/components/action-form"
import { EmptyState, PageHeader, SectionCard, StatusBadge } from "@/components/shared"
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
          description="Book cartons before they reach Ibadan. They stay as Coming until someone checks what landed and says yes."
        />
        <div className="mt-5 space-y-3">
          {lots.length === 0 ? (
            <EmptyState
              title="You cannot see anything on the way"
              hint="Book a carton on the right. Its IMEIs or piece counts will wait here until the boxes land."
            />
          ) : null}
          {lots.map((lot) => (
            <div key={lot.id} className="surface-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{lot.lotNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    Going to {lot.branch.name}
                    {lot.supplier ? ` · ${lot.supplier.name}` : ""}
                    {lot.purchase ? ` · order ${lot.purchase.invoiceNumber}` : ""}
                    {lot.expectedDate ? ` · due ${lot.expectedDate.toLocaleDateString("en-NG")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={lot.visible ? "info" : "muted"}>{lot.visible ? "Shown to staff" : "Hidden"}</Badge>
                  <StatusBadge value={lot.status} />
                </div>
              </div>
              <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                {lot.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{item.product.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.quantity} ·{" "}
                      {item.identity === "IMEI" ? "by IMEI" : item.identity === "SERIAL" ? "by serial" : "piece count"}
                    </span>
                  </li>
                ))}
              </ul>
              {lot.notes ? <p className="mt-2 text-xs text-muted-foreground">{lot.notes}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {canBook && lot.status === "COMING" ? (
                  <PreviewIncomingModal lot={lot} />
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
      <SectionCard
        title="Book a carton before it arrives"
        description="Shop stock does not go up until somebody confirms the goods have landed."
      >
        <p className="mb-4 text-sm text-muted-foreground">
          The main admin or Goods intake can scan phone numbers (IMEIs), scan serials, or enter a simple piece count. Tie the list to a
          supplier order where you can, so you can find a missing unit later.
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
            You can see lists the main admin has shown. Ask the main admin to let you book goods, or to show a hidden list.
          </p>
        )}
      </SectionCard>
    </div>
  )
}
