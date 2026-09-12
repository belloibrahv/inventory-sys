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
          description="Book cartons before they reach Ibadan. They stay as Coming until someone checks what landed and says yes."
        />
        <div className="mt-5">
          <IncomingList lots={lots} canBook={canBook} isAdmin={isSuperAdmin(me.role)} />
        </div>
      </div>
      <SectionCard
        title="Book a carton before it arrives"
        description="Shop stock does not go up until somebody confirms the goods have landed."
      >
        <p className="mb-4 text-sm text-muted-foreground">
          The main admin or Goods intake can scan phone numbers (IMEIs), scan serials, or enter a simple piece count. Tie
          the list to a supplier order where you can, so you can find a missing unit later.
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
            You can see lists the main admin has shown. Ask the main admin to let you book goods, or to show a hidden
            list.
          </p>
        )}
      </SectionCard>
    </div>
  )
}
