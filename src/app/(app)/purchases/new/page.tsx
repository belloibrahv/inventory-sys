import { getProducts } from "@/app/actions/catalog"
import { getBranches, getSuppliers } from "@/app/actions/parties"
import { FormScreen } from "@/components/shared"
import { requireUser } from "@/lib/session"
import { PurchaseForm } from "../purchase-form"

export default async function BookExpectedGoodsPage() {
  const me = await requireUser()
  const [suppliers, products, branches] = await Promise.all([getSuppliers(), getProducts(), getBranches()])
  const houses = suppliers.filter((row) => row.kind !== "NEIGHBOR" && row.name !== "Opening stock")
  return (
    <FormScreen
      title="Book expected goods"
      description="A supplier carton on its way. After saving, the bill opens so you can scan its IMEIs."
      backHref="/purchases"
    >
      <PurchaseForm
        suppliers={houses.map((row) => ({ id: row.id, name: row.name, country: row.country, city: row.city }))}
        branches={branches.filter((row) => row.isActive).map((row) => ({ id: row.id, name: row.name }))}
        products={products.map((row) => ({ id: row.id, name: row.name }))}
        defaultBranchId={me.branchId}
      />
    </FormScreen>
  )
}
