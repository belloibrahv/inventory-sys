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
          description="Move phones and goods from one of our shops to another, like Iwo Road to Challenge. The shop that gets them must confirm what landed."
        />
        <TransfersList transfers={transfers} />
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-2 font-semibold">Send goods to another of our shops</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Do not pick phones one by one on this screen. Put the IMEIs and accessory counts in the file, then send the
          list.
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
