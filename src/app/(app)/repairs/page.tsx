import { createRepair, getRepairs } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { RepairsList } from "./repairs-list"

export default async function RepairsPage() {
  const rows = await getRepairs()
  return (
    <div className="page-split">
      <div>
        <PageHeader
          title="Repairs"
          description="Take the phone, find the fault, wait for parts if needed, fix it, then give it back."
        />
        <RepairsList rows={rows} />
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
