import { getIncomingLots, getOpenPurchases } from "@/app/actions/incoming"
import { getProducts } from "@/app/actions/catalog"
import { getBranches, getSuppliers } from "@/app/actions/parties"
import { IncomingForm } from "@/app/(app)/incoming/incoming-form"
import { IncomingList } from "./incoming-list"
import { PageHeader, SectionCard } from "@/components/shared"
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
          title="Inbound Shipments"
          description="Pre-alert and track inbound consignments prior to delivery. Shipments remain In Transit until physical inspection, receiving, and authorization are finalized."
        />
        <div className="mt-5">
          <IncomingList lots={lots} canBook={canBook} isAdmin={isSuperAdmin(me.role)} />
        </div>
      </div>
      <SectionCard
        title="Register Inbound Consignment"
        description="Available inventory balances will not increment until warehouse receipt and receiving approval are confirmed."
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Intake personnel can register serialized assets (IMEI / Serial) or bulk quantities. Link consignments to Purchase Orders for automated AP and variance matching.
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
            Displaying authorized inbound consignments. Contact your system administrator to request receiving permissions or update visibility flags.
          </p>
        )}
      </SectionCard>
    </div>
  )
}
