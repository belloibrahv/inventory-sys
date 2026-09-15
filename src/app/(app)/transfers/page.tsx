import { getTransfers } from "@/app/actions/ops"
import { getPosLookups } from "@/app/actions/sales"
import { PageHeader } from "@/components/shared"
import { TransferForm } from "./transfer-form"
import { TransfersList } from "./transfers-list"

export default async function TransfersPage() {
  const [transfers, lookups] = await Promise.all([getTransfers(), getPosLookups()])
  return (
    <div className="page-split">
      <div>
        <PageHeader
          title="Inter-Branch Stock Transfers"
          description="Dispatch and track inventory movements between company branch locations. Receiving branches must confirm intake verification before stock is released to local inventory."
        />
        <TransfersList transfers={transfers} />
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-2 font-semibold">Initiate Inter-Branch Transfer</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Select origin and destination locations, then specify serialized assets (IMEI) or standard SKU transfer quantities.
        </p>
        <TransferForm
          branches={lookups.branches}
          products={lookups.products}
          imeis={lookups.imeis}
          defaultFromId={lookups.branchId}
        />
      </div>
    </div>
  )
}
