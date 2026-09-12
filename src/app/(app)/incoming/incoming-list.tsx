"use client"

import { useMemo, useState } from "react"
import { setIncomingVisible } from "@/app/actions/incoming"
import { PreviewIncomingModal } from "./preview-incoming-modal"
import { ActionForm } from "@/components/action-form"
import { EmptyState, StatusBadge } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Badge } from "@/components/ui/badge"
import { formatShopWhen } from "@/lib/lagos-day"

type IncomingLot = {
  id: string
  lotNumber: string
  status: string
  visible: boolean
  expectedDate: Date | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
  branch: { name: string }
  supplier: { name: string } | null
  purchase: { invoiceNumber: string } | null
  items: Array<{
    id: string
    productId: string
    quantity: number
    identity: "IMEI" | "SERIAL" | "NONE"
    identifiers: string | null
    product: { name: string; brand?: { name: string } }
  }>
}

export function IncomingList({
  lots,
  canBook,
  isAdmin,
}: {
  lots: IncomingLot[]
  canBook: boolean
  isAdmin: boolean
}) {
  const [status, setStatus] = useState("all")

  const filtered = useMemo(
    () => lots.filter((lot) => (status === "all" ? true : lot.status === status)),
    [lots, status]
  )

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { all: lots.length }
    for (const lot of lots) {
      byStatus[lot.status] = (byStatus[lot.status] ?? 0) + 1
    }
    return byStatus
  }, [lots])

  const pager = usePagedRows(filtered, status)

  return (
    <div className="space-y-4">
      <WorkflowSteps
        activeKey={status}
        onSelect={setStatus}
        steps={[
          { key: "all", label: "All cartons", count: counts.all, hint: "Everything booked" },
          { key: "COMING", label: "Still coming", count: counts.COMING ?? 0, hint: "Not landed yet" },
          { key: "ARRIVED", label: "In shop", count: counts.ARRIVED ?? 0, hint: "Checked in" },
          { key: "CANCELLED", label: "Cancelled", count: counts.CANCELLED ?? 0, hint: "Not coming" },
        ]}
      />

      <div className="space-y-3">
        {lots.length === 0 ? (
          <EmptyState
            title="You cannot see anything on the way"
            hint="Book a carton on the right. Its IMEIs or piece counts will wait here until the boxes land."
          />
        ) : null}
        {pager.pageRows.map((lot) => (
          <div key={lot.id} className="surface-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{lot.lotNumber}</p>
                <p className="text-sm text-muted-foreground">
                  Going to {lot.branch.name}
                  {lot.supplier ? ` · ${lot.supplier.name}` : ""}
                  {lot.purchase ? ` · order ${lot.purchase.invoiceNumber}` : ""}
                  {lot.expectedDate ? ` · due ${formatShopWhen(lot.expectedDate)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={lot.visible ? "info" : "muted"}>
                    {lot.visible ? "Shown to staff" : "Hidden"}
                  </Badge>
                  <StatusBadge value={lot.status} />
                </div>
                <p className="text-xs font-medium tabular-nums text-muted-foreground">
                  Booked {formatShopWhen(lot.createdAt)}
                </p>
              </div>
            </div>
            <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              {lot.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">{item.product.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.quantity} ·{" "}
                    {item.identity === "IMEI" ? "by IMEI" : item.identity === "SERIAL" ? "by serial" : "piece count"}
                  </span>
                </li>
              ))}
            </ul>
            {lot.notes ? <p className="mt-2 text-xs text-muted-foreground">{lot.notes}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {canBook && lot.status === "COMING" ? <PreviewIncomingModal lot={lot} /> : null}
              {isAdmin && lot.status === "COMING" ? (
                <ActionForm
                  action={setIncomingVisible}
                  submit={lot.visible ? "Hide from other staff" : "Show to staff who can open this page"}
                  variant="outline"
                  size="sm"
                  buttonClassName=""
                >
                  <input type="hidden" name="id" value={lot.id} />
                  <input type="hidden" name="visible" value={lot.visible ? "false" : "true"} />
                </ActionForm>
              ) : null}
            </div>
          </div>
        ))}
        {lots.length > 0 && filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            No carton matches this stage. Tap another step above.
          </p>
        ) : null}
        {filtered.length > 0 ? (
          <div className="surface-card overflow-hidden">
            <TablePager
              page={pager.page}
              pageCount={pager.pageCount}
              pageSize={pager.pageSize}
              total={pager.total}
              start={pager.start}
              end={pager.end}
              onPageChange={pager.setPage}
              onPageSizeChange={pager.setPageSize}
              noun="cartons"
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
