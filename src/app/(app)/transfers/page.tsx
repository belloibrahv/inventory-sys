import Link from "next/link"
import { getTransfers, receiveTransfer } from "@/app/actions/ops"
import { getPosLookups } from "@/app/actions/sales"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { ScanList } from "@/components/scan-field"
import { TransferForm } from "./transfer-form"

export default async function TransfersPage() {
  const [transfers, lookups] = await Promise.all([getTransfers(), getPosLookups()])
  return (
    <div className="page-split">
      <div>
        <PageHeader
          title="Shop to shop"
          description="Move phones and accessories that already belong to Abu Twins from one of our shops to another, such as Iwo Road to Challenge. Upload a CSV of the IMEIs and accessory lines. The receiving shop must confirm what arrived. This is not goods from a supplier, and it is not buying from a neighboring dealer."
        />
        <WorkflowSteps current={0} steps={["Upload the CSV", "On the way to our other shop", "That shop confirms", "Now in that shop"]} />
        <div className="space-y-3">
          {transfers.map((transfer) => (
            <div key={transfer.id} className="surface-card p-5">
              <div className="flex justify-between">
                <div>
                  <p className="font-semibold">{transfer.transferNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {transfer.fromBranch.code} → {transfer.toBranch.code}
                    {transfer.items.map((item) => ` · ${item.product.name} × ${item.quantity}`).join("")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    {transfer.imeis.map((imei) => (
                      <Link key={imei.id} href={`/imei/${imei.id}`} className="text-primary">
                        {imei.imei1}
                      </Link>
                    ))}
                  </div>
                </div>
                <StatusBadge value={transfer.status} />
              </div>
              {transfer.status !== "RECEIVED" ? (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-2 text-sm text-muted-foreground">
                    {transfer.toBranch.name} must scan or paste every IMEI from the list that actually arrived.
                  </p>
                  <ActionForm action={receiveTransfer} submit="Confirm arrival" className="space-y-2">
                    <input type="hidden" name="id" value={transfer.id} />
                    {transfer.imeis.length ? (
                      <ScanList name="imeis" />
                    ) : (
                      <p className="text-sm text-muted-foreground">No unique numbers on this send. Confirm the accessory quantity only.</p>
                    )}
                  </ActionForm>
                </div>
              ) : (
                <p className="mt-2 text-xs text-success">Live at {transfer.toBranch.name}.</p>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-2 font-semibold">Send a CSV between our shops</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Do not pick phones one by one on this screen. Put the IMEIs and accessory counts in the file, then send the list.
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
