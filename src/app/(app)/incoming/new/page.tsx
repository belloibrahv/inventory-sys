import { redirect } from "next/navigation"
import { getOpenPurchases } from "@/app/actions/incoming"
import { getProducts } from "@/app/actions/catalog"
import { getBranches, getSuppliers } from "@/app/actions/parties"
import { FormScreen } from "@/components/shared"
import { can, isShopOwner } from "@/lib/permissions"
import { requireUser } from "@/lib/session"
import { IncomingForm } from "../incoming-form"

export default async function BookGoodsComingPage() {
  const me = await requireUser()
  if (!(isShopOwner(me.role) || (await can(me.role, "action.incoming")))) redirect("/incoming")
  const [products, branches, suppliers, purchases] = await Promise.all([getProducts(), getBranches(), getSuppliers(), getOpenPurchases()])
  return (
    <FormScreen
      title="Book goods coming"
      description="Scan IMEIs or type pieces. Stock rises only when they arrive and are received."
      backHref="/incoming"
    >
      <IncomingForm
        successHref="/incoming"
        products={products.map((product) => ({ id: product.id, name: product.name, tracking: product.tracking }))}
        branches={branches.filter((branch) => branch.isActive).map((branch) => ({ id: branch.id, name: branch.name, isHq: branch.isHq }))}
        suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
        purchases={purchases}
        defaultBranchId={me.branchId}
      />
    </FormScreen>
  )
}
