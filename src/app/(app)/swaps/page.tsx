import { getSwaps } from "@/app/actions/ops"
import { getProducts } from "@/app/actions/catalog"
import { getPosLookups } from "@/app/actions/sales"
import { PageHeader } from "@/components/shared"
import { SwapForm } from "./swap-form"
import { SwapsList } from "./swaps-list"

export default async function SwapsPage() {
  const [swaps, lookups, products] = await Promise.all([getSwaps(), getPosLookups(), getProducts()])
  return (
    <div className="page-split">
      <div>
        <PageHeader
          title="Swap Deal"
          description="Old device in, shop device out. Values, balance, approval, then stock moves."
        />
        <SwapsList swaps={swaps} />
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Start swap</h3>
        <SwapForm
          customers={lookups.customers.map((customer) => ({
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            branchId: customer.branchId,
          }))}
          models={[
            ...new Map(
              products
                .filter((product) => product.tracking !== "NONE")
                .map((product) => [
                  product.name.toLowerCase(),
                  { name: product.name, brand: product.brand.name, category: product.category.name },
                ])
            ).values(),
          ]}
          brands={[...new Set(products.map((product) => product.brand.name))].sort()}
          categories={[...new Set(products.map((product) => product.category.name))].sort()}
          branches={lookups.branches.map((branch) => ({ id: branch.id, name: branch.name }))}
          defaultBranchId={lookups.branchId}
        />
      </div>
    </div>
  )
}
