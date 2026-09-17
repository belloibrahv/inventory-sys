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
          title="Shop to shop"
          description="Send to another Abu Twins shop. They must confirm arrival."
        />
        <TransfersList transfers={transfers} />
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-2 font-semibold">Send to another shop</h3>
        <p className="mb-4 text-sm text-muted-foreground">IMEIs for phones. Piece count for cords.</p>
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
