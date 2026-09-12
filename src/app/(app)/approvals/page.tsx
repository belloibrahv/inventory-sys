import Link from "next/link"
import { approveRequest, getApprovals, rejectRequest } from "@/app/actions/finance"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { canApprove } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { recordKindLabel } from "@/lib/shop-speak"
import { statusLabel } from "@/lib/status"
import { formatDateTime } from "@/lib/utils"

function entityHref(type: string) {
  if (type === "Swap") return "/swaps"
  if (type === "Return") return "/returns"
  if (type === "Expense") return "/expenses"
  if (type === "Reconciliation") return "/reconciliation"
  return "/approvals"
}

export default async function ApprovalsPage() {
  const me = await requireUser()
  const [rows, canDecide] = await Promise.all([getApprovals(), canApprove(me.role)])
  const pending = rows.filter((row) => row.status === "PENDING").length
  return (
    <div className="space-y-6">
      <PageHeader title="Waiting for yes" description={`${pending} waiting for you. Say yes or no to swaps, refunds, expenses, and stock counts.`} />
      <WorkflowSteps current={pending ? 1 : 2} steps={["Staff asked", "You check", "Done"]} />
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="surface-card flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">
                <Link href={entityHref(row.entityType)} className="text-primary">{statusLabel(row.type)}</Link>
                {" · "}{recordKindLabel(row.entityType)}
              </p>
              <p className="text-sm text-muted-foreground">{row.reason} · {row.requester.name} · {formatDateTime(row.requestedAt)}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge value={row.status} />
              {row.status === "PENDING" && canDecide ? (
                <>
                  <ActionForm action={approveRequest} submit="Approve" size="sm" buttonClassName="">
                    <input type="hidden" name="id" value={row.id} />
                  </ActionForm>
                  <ActionForm action={rejectRequest} submit="Reject" size="sm" variant="outline" buttonClassName="">
                    <input type="hidden" name="id" value={row.id} />
                  </ActionForm>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
