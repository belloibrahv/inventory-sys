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
        title="Needs approval"
        description={`${pending} waiting. Say yes or no to Swap Deal values, refunds, shop expenses, stock counts, and goods received.`}
      />
      <ApprovalsList rows={rows} canDecide={canDecide} />
    </div>
  )
}
