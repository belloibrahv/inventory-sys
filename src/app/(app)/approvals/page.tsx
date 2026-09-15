import { getApprovals } from "@/app/actions/finance"
import { PageHeader } from "@/components/shared"
import { canApprove } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { ApprovalsList } from "./approvals-list"

export default async function ApprovalsPage() {
  const me = await requireUser()
  const [rows, canDecide] = await Promise.all([getApprovals(), canApprove(me.role)])
  const pending = rows.filter((row) => row.status === "PENDING").length
  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval Workflow Queue"
        description={`${pending} pending authorization${pending === 1 ? "" : "s"}. Review and authorize or reject trade-in valuations, refunds, OPEX disbursements, inventory reconciliations, and receiving.`}
      />
      <ApprovalsList rows={rows} canDecide={canDecide} />
    </div>
  )
}
