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
          title="Goods on the way"
          description="Book phones and pieces that have left the supplier but have not been counted into this shop yet. They stay Coming until someone says they have arrived."
        />
        <div className="mt-5">
          <IncomingList lots={lots} canBook={canBook} isAdmin={isSuperAdmin(me.role)} />
        </div>
      </div>
      <SectionCard
        title="Book goods still coming"
        description="Shop stock does not go up until someone confirms the carton has arrived."
      >
        <p className="mb-4 text-sm text-muted-foreground">
          Scan IMEIs or type how many pieces. You can attach this to a supplier bill if you already have one.
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
