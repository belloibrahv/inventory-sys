"use client"

import { useEffect } from "react"
import type { PendingPriceRequest } from "@/app/actions/price-requests"
import { ApprovalCard } from "@/components/notifications/price-approval-dock"
import { useNotifications } from "@/store/notifications"
import { cn, formatCurrency, formatDateTime } from "@/lib/utils"

type Decision = {
  id: string
  requestNumber: string
  status: string
  shop: string
  seller: string
  decidedBy: string | null
  note: string | null
  total: number
  at: string
}

const STATUS: Record<string, { label: string; tone: string }> = {
  APPROVED: { label: "Approved, not sold yet", tone: "bg-success-soft text-success" },
  USED: { label: "Approved and sold", tone: "bg-success-soft text-success" },
  DECLINED: { label: "Declined", tone: "bg-danger-soft text-danger" },
  EXPIRED: { label: "Lapsed", tone: "bg-muted text-muted-foreground" },
  CANCELLED: { label: "Withdrawn", tone: "bg-muted text-muted-foreground" },
}

/**
 * Price approvals on Needs approval: what waits now (live, the same cards as
 * the dock) and the last answers given, so the CEO and the main admin can see
 * who approved what.
 */
export function PriceRequestsPanel({
  initialPending,
  decisions,
  focusId,
}: {
  initialPending: PendingPriceRequest[]
  decisions: Decision[]
  focusId?: string
}) {
  const loaded = useNotifications((state) => state.loaded)
  const livePending = useNotifications((state) => state.pricePending)
  const pending = loaded ? livePending : initialPending

  useEffect(() => {
    if (!focusId) return
    document.getElementById(`price-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [focusId])

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Price approvals</h2>
        <p className="text-sm text-muted-foreground">
          Sellers ask from the till when a price goes under the lowest allowed or under cost. The first answer decides; the till
          picks it up by itself.
        </p>
      </div>
      {pending.length === 0 ? (
        <p className="surface-card px-4 py-4 text-sm text-muted-foreground">No price approval is waiting.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pending.map((row) => (
            <div key={row.id} id={`price-${row.id}`} className={cn(focusId === row.id && "rounded-xl ring-2 ring-primary")}>
              <ApprovalCard row={row} flat />
            </div>
          ))}
        </div>
      )}
      {decisions.length ? (
        <div className="surface-card overflow-hidden">
          <p className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent answers
          </p>
          <ul className="divide-y divide-border">
            {decisions.map((row) => {
              const status = STATUS[row.status] ?? { label: row.status, tone: "bg-muted text-muted-foreground" }
              return (
                <li key={row.id} id={`price-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {row.seller} · {row.shop} · <span className="tabular-nums">{formatCurrency(row.total)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.requestNumber} · {formatDateTime(row.at)}
                      {row.decidedBy ? ` · by ${row.decidedBy}` : ""}
                      {row.note ? ` · “${row.note}”` : ""}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status.tone)}>{status.label}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
