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
          title="Swaps"
          description="A buyer brings an old phone. Agree what it is worth, wait for yes, hand over the new phone, settle the money, then print the bill."
        />
        <SwapsList swaps={swaps} />
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Start swap</h3>
        <SwapForm
          customers={lookups.customers.map((customer) => ({ id: customer.id, name: customer.name }))}
          products={products.map((product) => ({ id: product.id, name: product.name }))}
          imeis={lookups.imeis.map((item) => ({
            id: item.id,
            imei1: item.imei1,
            branchId: item.branchId,
            product: { name: item.product.name },
          }))}
          branches={lookups.branches.map((branch) => ({ id: branch.id, name: branch.name }))}
          defaultBranchId={lookups.branchId}
        />
      </div>
    </div>
  )
}
