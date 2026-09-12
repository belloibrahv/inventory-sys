"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { approveRequest, rejectRequest } from "@/app/actions/finance"
import { ActionForm } from "@/components/action-form"
import { FilterChips } from "@/components/filter-chips"
import { StatusBadge } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { formatShopWhen } from "@/lib/lagos-day"
import { recordKindLabel } from "@/lib/shop-speak"
import { statusLabel } from "@/lib/status"

function entityHref(type: string) {
  if (type === "Swap") return "/swaps"
  if (type === "Return") return "/returns"
  if (type === "Expense") return "/expenses"
  if (type === "Reconciliation") return "/reconciliation"
  return "/approvals"
}

type ApprovalRow = {
  id: string
  type: string
  entityType: string
  reason: string | null
  status: string
  requestedAt: Date
  requester: { name: string | null }
}

type ApprovalFilter = "all" | "PENDING" | "APPROVED" | "REJECTED"

export function ApprovalsList({
  rows,
  canDecide,
}: {
  rows: ApprovalRow[]
  canDecide: boolean
}) {
  const [status, setStatus] = useState<ApprovalFilter>("PENDING")

  const filtered = useMemo(
    () => rows.filter((row) => (status === "all" ? true : row.status === status)),
    [rows, status]
  )

  const counts = useMemo(
    () => ({
      all: rows.length,
      PENDING: rows.filter((row) => row.status === "PENDING").length,
      APPROVED: rows.filter((row) => row.status === "APPROVED").length,
      REJECTED: rows.filter((row) => row.status === "REJECTED").length,
    }),
    [rows]
  )

  const pager = usePagedRows(filtered, status)

  return (
    <div className="space-y-4">
      <div className="surface-card p-4">
        <FilterChips
          label="Decision"
          activeKey={status}
          onSelect={(key) => setStatus(key as ApprovalFilter)}
          chips={[
            { key: "all", label: "All requests", count: counts.all },
            { key: "PENDING", label: "Waiting", count: counts.PENDING, tone: "warning" },
            { key: "APPROVED", label: "Approved", count: counts.APPROVED, tone: "success" },
            { key: "REJECTED", label: "Rejected", count: counts.REJECTED, tone: "danger" },
          ]}
        />
      </div>

      <div className="space-y-3">
        {pager.pageRows.map((row) => (
          <div
            key={row.id}
            className="surface-card flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="font-semibold">
                <Link href={entityHref(row.entityType)} className="text-primary">
                  {statusLabel(row.type)}
                </Link>
                {" · "}
                {recordKindLabel(row.entityType)}
              </p>
              <p className="text-sm text-muted-foreground">
                {row.reason} · {row.requester.name}
              </p>
              <p className="mt-1 text-xs font-medium tabular-nums text-muted-foreground">
                Asked {formatShopWhen(row.requestedAt)}
              </p>
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
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "Nothing is waiting for a yes or no."
              : "No request matches this filter. Tap another chip above."}
          </p>
        ) : (
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
              noun="requests"
            />
          </div>
        )}
      </div>
    </div>
  )
}
