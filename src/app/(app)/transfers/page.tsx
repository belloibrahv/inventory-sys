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
          title="Shop to shop (Stock Transfer)"
          description="From one Abu Twins branch to another. Stock stays In shop at the sending branch until the receiving branch accepts."
        />
        <TransfersList transfers={transfers} />
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-1 font-semibold">Start a stock transfer</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          From branch, To branch, select the items, then submit. Wait for accept or reject before the sending In shop record changes.
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
