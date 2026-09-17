import { getIncomingLots, getOpenPurchases } from "@/app/actions/incoming"
import { getProducts } from "@/app/actions/catalog"
import { getBranches, getSuppliers } from "@/app/actions/parties"
import { IncomingForm } from "@/app/(app)/incoming/incoming-form"
import { IncomingList } from "./incoming-list"
import { PageHeader, SectionCard } from "@/components/shared"
import { can, isShopOwner } from "@/lib/permissions"
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
  const canBook = isShopOwner(me.role) || (await can(me.role, "action.incoming"))
  const activeShops = branches.filter((branch) => branch.isActive)

  return (
    <div className="page-split">
      <div>
        <PageHeader
          title="Goods on the way"
          description="Left the supplier. Not counted into this shop yet."
        />
        <div className="mt-5">
          <IncomingList lots={lots} canBook={canBook} isAdmin={isShopOwner(me.role)} />
        </div>
      </div>
      <SectionCard
        title="Book goods still coming"
        description="Scan IMEIs or type pieces. Stock rises only when they arrive."
      >
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
          <p className="text-sm text-muted-foreground">You can read goods on the way. A goods intake person books new cartons.</p>
        )}
      </SectionCard>
    </div>
  )
}
