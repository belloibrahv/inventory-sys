import Link from "next/link"
import { getTransfers, receiveTransfer } from "@/app/actions/ops"
import { getPosLookups } from "@/app/actions/sales"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Textarea } from "@/components/ui/textarea"
import { TransferForm } from "./transfer-form"

export default async function TransfersPage() {
  const [transfers, lookups] = await Promise.all([getTransfers(), getPosLookups()])
  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <div>
        <PageHeader title="Send to another shop" description="Phones leave this shop only after you pick the IMEIs. The other shop must confirm they arrived." />
        <WorkflowSteps current={0} steps={["Pick IMEIs", "On the way", "Other shop confirms", "Now in that shop"]} />
        <div className="space-y-3">
          {transfers.map((transfer) => (
            <div key={transfer.id} className="surface-card p-5">
              <div className="flex justify-between">
                <div>
                  <p className="font-semibold">{transfer.transferNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {transfer.fromBranch.code} → {transfer.toBranch.code} · {transfer.items[0]?.product.name} × {transfer.items[0]?.quantity}
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
                    {transfer.toBranch.name} must paste the IMEIs that actually arrived.
                  </p>
                  <ActionForm action={receiveTransfer} submit="Confirm arrival" className="space-y-2">
                    <input type="hidden" name="id" value={transfer.id} />
                    <Textarea
                      name="imeis"
                      placeholder={transfer.imeis.map((item) => item.imei1).join("\n") || "No serials. Accessory quantity only"}
                    />
                  </ActionForm>
                </div>
              ) : (
                <p className="mt-2 text-xs text-emerald-700">Live at {transfer.toBranch.name}.</p>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Dispatch transfer</h3>
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
