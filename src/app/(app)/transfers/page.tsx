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
          description="Send phones and items from one Abu Twins shop to another. The other shop must confirm they arrived before they sit on that shelf."
        />
        <TransfersList transfers={transfers} />
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-2 font-semibold">Send to another shop</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Pick the shop sending and the shop receiving. Use IMEIs for phones, or a quantity for cords and chargers.
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
