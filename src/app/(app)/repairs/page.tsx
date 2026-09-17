import { createRepair, getRepairs } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { can } from "@/lib/permissions"
import { requireUser } from "@/lib/session"
import { RepairsList } from "./repairs-list"

export default async function RepairsPage() {
  const user = await requireUser()
  const canOpen = await can(user.role, "action.repair")
  const rows = await getRepairs()
  return (
    <div className="page-split">
      <div>
        <PageHeader
          title="Repairs"
          description="Take the phone, find the fault, fix it, give it back."
        />
        <RepairsList rows={rows} />
      </div>
      {canOpen ? (
        <div className="surface-card p-5">
          <h3 className="mb-4 font-semibold">Open repair</h3>
          <ActionForm action={createRepair} className="space-y-3">
            <Input name="imei1" placeholder="IMEI" required />
            <Input name="issue" placeholder="Issue" required />
            <Textarea name="notes" placeholder="Intake notes" />
          </ActionForm>
        </div>
      ) : (
        <div className="surface-card p-5 text-sm text-muted-foreground">
          <h3 className="mb-2 font-semibold text-foreground">Looking only</h3>
          <p>You can read every repair on this page. Opening a new repair is for the workshop. Ask the main admin if that must change.</p>
        </div>
      )}
    </div>
  )
}
