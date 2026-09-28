import { getApprovals } from "@/app/actions/finance"
import { getPendingPriceRequests, getRecentPriceDecisions } from "@/app/actions/price-requests"
import { PageHeader } from "@/components/shared"
import { canApprove, isShopOwner } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { ApprovalsList } from "./approvals-list"
import { PriceRequestsPanel } from "./price-requests-panel"

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ price?: string }> }) {
  const me = await requireUser()
  const { price } = await searchParams
  const owner = isShopOwner(me.role)
  const [rows, canDecide, pendingPrices, decisions] = await Promise.all([
    getApprovals(),
    canApprove(me.role),
    owner ? getPendingPriceRequests() : Promise.resolve([]),
    owner ? getRecentPriceDecisions() : Promise.resolve([]),
  ])
  const pending = rows.filter((row) => row.status === "PENDING").length + pendingPrices.length
  return (
    <div className="space-y-8">
      <PageHeader
        title="Needs approval"
        description={`${pending} waiting. Say yes or no.`}
      />
      {owner ? <PriceRequestsPanel initialPending={pendingPrices} decisions={decisions} focusId={price} /> : null}
      <ApprovalsList rows={rows} canDecide={canDecide} />
    </div>
  )
}
