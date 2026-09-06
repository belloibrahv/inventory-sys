import { getPosLookups } from "@/app/actions/sales"
import { PosClient } from "./pos-client"

export default async function PosPage() {
  const data = await getPosLookups()
  return (
    <PosClient
      products={data.products}
      customers={data.customers}
      imeis={data.imeis}
      branches={data.branches}
      defaultBranchId={data.branchId}
      canOverrideFloor={data.canOverrideFloor}
    />
  )
}
