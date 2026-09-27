import { redirect } from "next/navigation"
import { createRepair } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { FormScreen } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { can } from "@/lib/permissions"
import { requireUser } from "@/lib/session"

export default async function OpenRepairPage() {
  const user = await requireUser()
  // Opening a repair is workshop work. Anyone else who reaches this address
  // goes back to the list they can read.
  if (!(await can(user.role, "action.repair"))) redirect("/repairs")
  return (
    <FormScreen title="Open a repair" description="Scan the phone, say what is wrong. The job starts at Take in." backHref="/repairs">
      <ActionForm action={createRepair} submit="Open this repair" successMessage="Repair opened." successHref="/repairs" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="repair-imei">IMEI or serial number</Label>
            <Input id="repair-imei" name="imei1" className="font-mono" placeholder="Scan or type" required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repair-issue">What is wrong</Label>
            <Input id="repair-issue" name="issue" placeholder="Screen cracked, not charging" required />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="repair-notes">Notes when taking it in (optional)</Label>
          <Textarea id="repair-notes" name="notes" placeholder="Scratches, missing SIM tray, passcode given" />
        </div>
      </ActionForm>
    </FormScreen>
  )
}
