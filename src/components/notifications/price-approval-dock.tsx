"use client"

import { useState } from "react"
import Link from "next/link"
import { BadgeCheck, ChevronDown, ChevronUp, X } from "lucide-react"
import { toast } from "sonner"
import { decidePriceRequest, type PendingPriceRequest } from "@/app/actions/price-requests"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useNotifications } from "@/store/notifications"
import { cn, formatCurrency } from "@/lib/utils"

const SHOWN = 2

/**
 * Price approvals waiting on the CEO or the main admin, on whatever screen
 * they are on. Answering here is the whole job: the seller's till picks the
 * answer up by itself within a few seconds.
 */
export function PriceApprovalDock() {
  const pending = useNotifications((state) => state.pricePending)
  const [collapsed, setCollapsed] = useState(false)
  if (pending.length === 0) return null

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-[400px] lg:bottom-4 print:hidden"
      role="region"
      aria-label="Price approvals waiting"
    >
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="flex items-center justify-between gap-2 self-end rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg"
        aria-expanded={!collapsed}
      >
        <BadgeCheck className="h-4 w-4" />
        {pending.length} price approval{pending.length === 1 ? "" : "s"} waiting
        {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {collapsed ? null : (
        <>
          {pending.slice(0, SHOWN).map((row) => (
            <ApprovalCard key={row.id} row={row} />
          ))}
          {pending.length > SHOWN ? (
            <Link
              href="/approvals"
              className="self-end rounded-full bg-card px-3 py-1.5 text-xs font-medium text-primary shadow ring-1 ring-border"
            >
              See all {pending.length} on Needs approval
            </Link>
          ) : null}
        </>
      )}
    </div>
  )
}

export function ApprovalCard({ row, flat = false }: { row: PendingPriceRequest; flat?: boolean }) {
  const refresh = useNotifications((state) => state.refresh)
  const dropPriceRequest = useNotifications((state) => state.dropPriceRequest)
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null)
  const [declining, setDeclining] = useState(false)
  const [note, setNote] = useState("")
  const flagged = row.summary.lines.filter((line) => line.underFloor || line.underCost)
  const lines = flagged.length ? flagged : row.summary.lines

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "decline")
    try {
      const result = await decidePriceRequest({ id: row.id, approve, note: approve ? undefined : note })
      if ("error" in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success(approve ? `Approved. ${row.seller}'s till can finish the sale.` : `Declined. ${row.seller} has been told.`)
      }
      dropPriceRequest(row.id)
      refresh()
    } catch {
      toast.error("The shop system did not answer. Check the network and try again.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <article
      className={cn("rounded-xl border border-border bg-card p-4 text-sm", flat ? "" : "shadow-2xl ring-1 ring-primary/20")}
      aria-label={`Price approval ${row.requestNumber}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Price approval · {row.shop}</p>
          <p className="mt-0.5 font-semibold leading-snug">
            {row.seller}
            {row.customerName ? <span className="font-normal text-muted-foreground"> · for {row.customerName}</span> : null}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning tabular-nums">
          {row.minutesLeft} min left
        </span>
      </header>

      <ul className="mt-3 space-y-2">
        {lines.map((line, index) => (
          <li key={`${line.name}-${index}`} className="rounded-lg bg-muted/60 px-3 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate font-medium">
                {line.quantity > 1 ? `${line.quantity} × ` : ""}
                {line.name}
              </p>
              <p className="shrink-0 font-semibold tabular-nums">{formatCurrency(line.asked)}</p>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              Standard {formatCurrency(line.standard)} · lowest {formatCurrency(line.floor)}
              {line.unit ? ` · ${line.unit}` : ""}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {line.underFloor ? (
                <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                  {formatCurrency(line.floor - line.asked)} under the lowest price
                </span>
              ) : null}
              {line.underCost ? (
                <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">Under cost</span>
              ) : null}
            </div>
            {line.reason ? <p className="mt-1 text-xs italic text-foreground/80">“{line.reason}”</p> : null}
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs tabular-nums">
        {row.summary.orderDiscount > 0 ? (
          <p className="flex justify-between text-muted-foreground">
            <span>Order discount{row.summary.discountReason ? ` · “${row.summary.discountReason}”` : ""}</span>
            <span>−{formatCurrency(row.summary.orderDiscount)}</span>
          </p>
        ) : null}
        <p className="flex justify-between text-sm font-semibold">
          <span>Sale total</span>
          <span>{formatCurrency(row.summary.total)}</span>
        </p>
        {row.margin ? (
          <p className={cn("flex justify-between", row.margin.kept < 0 ? "text-danger" : "text-success")}>
            <span>We keep</span>
            <span>{formatCurrency(row.margin.kept)}</span>
          </p>
        ) : null}
      </div>

      {declining ? (
        <div className="mt-3 space-y-2">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why, for the seller (optional)"
            aria-label="Why this price is declined"
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={busy !== null} onClick={() => setDeclining(false)}>
              <X className="mr-1 h-4 w-4" /> Back
            </Button>
            <Button type="button" variant="destructive" className="flex-1" disabled={busy !== null} onClick={() => void decide(false)}>
              {busy === "decline" ? "Declining" : "Decline"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="outline" className="flex-1" disabled={busy !== null} onClick={() => setDeclining(true)}>
            Decline
          </Button>
          <Button type="button" className="flex-1" disabled={busy !== null} onClick={() => void decide(true)}>
            {busy === "approve" ? "Approving" : "Approve"}
          </Button>
        </div>
      )}
    </article>
  )
}
