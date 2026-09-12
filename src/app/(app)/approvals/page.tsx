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
      <PageHeader title="Waiting for yes" description={`${pending} waiting for you. Say yes or no to swaps, refunds, expenses, and stock counts.`} />
      <ApprovalsList rows={rows} canDecide={canDecide} />
    </div>
  )
}
