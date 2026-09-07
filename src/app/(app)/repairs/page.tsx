import Link from "next/link"
import { advanceRepair, createRepair, getRepairs } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency, money } from "@/lib/utils"
import { statusLabel } from "@/lib/status"

const stages = ["PENDING", "DIAGNOSING", "REPAIRING", "WAITING_PARTS", "COMPLETED", "DELIVERED"]

export default async function RepairsPage() {
  const rows = await getRepairs()
  return (
    <div className="page-split">
      <div>
        <PageHeader title="Repairs" description="Take the phone, find the fault, wait for parts if needed, repair, then give it back to the customer or put it back in the shop." />
        <WorkflowSteps current={1} steps={["Take in", "Find fault", "Wait for parts", "Repair", "Give back"]} />
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="surface-card p-5">
              <div className="flex justify-between">
                <div>
                  <p className="font-semibold">{row.repairNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.imei.product.name} · <Link href={`/imei/${row.imei.id}`} className="text-primary">{row.imei.imei1}</Link>
                  </p>
                  <p className="mt-1 text-sm">{row.issue}</p>
                  {row.customer ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.customer.name}
                      {row.repairCost ? ` · charge ${formatCurrency(money(row.repairCost))} on deliver` : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Shop phone. When you finish, it goes back into shop stock.</p>
                  )}
                </div>
                <StatusBadge value={row.status} />
              </div>
              {row.status !== "DELIVERED" && row.status !== "CANCELLED" ? (
                <div className="mt-4 border-t border-border pt-4">
                  <ActionForm action={advanceRepair} submit="Update repair" className="grid gap-2 md:grid-cols-2">
                    <input type="hidden" name="id" value={row.id} />
                    <Select name="status" defaultValue={row.status}>
                      {stages.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
                    </Select>
                    <Input name="repairCost" type="number" placeholder="Repair cost" defaultValue={row.repairCost ? String(row.repairCost) : ""} />
                    <Textarea name="diagnosis" placeholder="What you found on this phone" defaultValue={row.diagnosis ?? ""} className="md:col-span-2" />
                  </ActionForm>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Open repair</h3>
        <ActionForm action={createRepair} className="space-y-3">
          <Input name="imei1" placeholder="IMEI" required />
          <Input name="issue" placeholder="Issue" required />
          <Textarea name="notes" placeholder="Intake notes" />
        </ActionForm>
      </div>
    </div>
  )
}
