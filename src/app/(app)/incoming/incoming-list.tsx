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
    expectedQuantity?: number
    receivedQuantity?: number | null
    identity: "IMEI" | "SERIAL" | "NONE"
    identifiers: string | null
    suggestedCost?: number
    catalogCost?: number
    billCost?: number | null
    product: { name: string; brand?: { name: string }; costPrice?: number }
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
          { key: "all", label: "All Consignments", count: counts.all, hint: "All registered shipments" },
          { key: "COMING", label: "In Transit", count: counts.COMING ?? 0, hint: "En route / Pending receipt" },
          {
            key: "PENDING_APPROVAL",
            label: "Pending Approval",
            count: counts.PENDING_APPROVAL ?? 0,
            hint: "Received; awaits supervisor sign-off",
          },
          { key: "ARRIVED", label: "Received & Stocked", count: counts.ARRIVED ?? 0, hint: "Verified and stocked" },
          { key: "CANCELLED", label: "Cancelled", count: counts.CANCELLED ?? 0, hint: "Shipment voided" },
        ]}
      />

      <div className="space-y-3">
        {lots.length === 0 ? (
          <EmptyState
            title="No inbound consignments found"
            hint="Register an inbound consignment on the right. Serial numbers or quantity counts will remain en route until warehouse intake."
          />
        ) : null}
        {pager.pageRows.map((lot) => (
          <div key={lot.id} className="surface-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{lot.lotNumber}</p>
                <p className="text-sm text-muted-foreground">
                  Destination: {lot.branch.name}
                  {lot.supplier ? ` · Supplier: ${lot.supplier.name}` : ""}
                  {lot.purchase ? ` · PO #${lot.purchase.invoiceNumber}` : ""}
                  {lot.expectedDate ? ` · ETA: ${formatShopWhen(lot.expectedDate)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={lot.visible ? "info" : "muted"}>
                    {lot.visible ? "Published" : "Restricted"}
                  </Badge>
                  <StatusBadge value={lot.status} />
                </div>
                <p className="text-xs font-medium tabular-nums text-muted-foreground">
                  Registered {formatShopWhen(lot.createdAt)}
                </p>
              </div>
            </div>
            <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              {lot.items.map((item) => {
                const expected = item.expectedQuantity && item.expectedQuantity > 0 ? item.expectedQuantity : item.quantity
                const received = item.receivedQuantity
                const short = received != null ? expected - received : 0
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0">{item.product.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {received != null ? (
                        <>
                          Expected: {expected} · Received: {received}
                          {short !== 0 ? (
                            <span className="text-warning">
                              {" "}
                              · {short > 0 ? `Variance: -${short}` : `Surplus: +${-short}`}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {expected} units ·{" "}
                          {item.identity === "IMEI" ? "Phone, IMEI" : item.identity === "SERIAL" ? "Serial" : "No number"}
                        </>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
            {lot.status === "PENDING_APPROVAL" ? (
              <p className="mt-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
                Intake is counted. A manager must say yes on Needs approval before these units sit on Shop stock.
              </p>
            ) : null}
            {lot.status === "ARRIVED" &&
            lot.items.some((item) => {
              const expected = item.expectedQuantity && item.expectedQuantity > 0 ? item.expectedQuantity : item.quantity
              return item.receivedQuantity != null && item.receivedQuantity !== expected
            }) ? (
              <p className="mt-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
                This consignment arrived with receiving variances against expected PO quantities. Variance logs have been generated.
              </p>
            ) : null}
            {lot.notes ? <p className="mt-2 text-xs text-muted-foreground">{lot.notes}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {canBook && lot.status === "COMING" ? <PreviewIncomingModal lot={lot} /> : null}
              {isAdmin && lot.status === "COMING" ? (
                <ActionForm
                  action={setIncomingVisible}
                  submit={lot.visible ? "Restrict Visibility" : "Publish to Branch Staff"}
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
            No consignments match this status filter. Select another stage above.
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
              noun="consignments"
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
