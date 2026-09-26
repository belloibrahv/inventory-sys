"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { approveRequest, rejectRequest } from "@/app/actions/finance"
import { ActionForm } from "@/components/action-form"
import { FilterChips } from "@/components/filter-chips"
import { StatusBadge } from "@/components/shared"
import { DataTable, type DataColumn } from "@/components/data-table"
import { formatShopWhen } from "@/lib/lagos-day"
import { recordKindLabel } from "@/lib/shop-speak"
import { statusLabel } from "@/lib/status"

function entityHref(type: string) {
  if (type === "Swap") return "/swaps"
  if (type === "Return") return "/returns"
  if (type === "Expense") return "/expenses"
  if (type === "Reconciliation") return "/reconciliation"
  if (type === "IncomingLot") return "/incoming"
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

  const columns: DataColumn<ApprovalRow>[] = [
    {
      id: "what",
      header: "Request",
      sortValue: (row) => statusLabel(row.type),
      cell: (row) => (
        <div>
          <Link href={entityHref(row.entityType)} className="font-medium text-primary hover:underline">
            {statusLabel(row.type)}
          </Link>
          <p className="text-xs text-muted-foreground">{recordKindLabel(row.entityType)}</p>
        </div>
      ),
    },
    { id: "reason", header: "Reason", hideBelow: "lg", cell: (row) => <span className="line-clamp-2 max-w-md">{row.reason || "—"}</span> },
    { id: "who", header: "Asked by", sortValue: (row) => row.requester.name ?? "", cell: (row) => row.requester.name ?? "Staff" },
    {
      id: "when",
      header: "When",
      hideBelow: "xl",
      sortValue: (row) => new Date(row.requestedAt).getTime(),
      cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatShopWhen(row.requestedAt)}</span>,
    },
    {
      id: "decide",
      header: "",
      align: "right",
      cell: (row) =>
        row.status === "PENDING" && canDecide ? <Decide id={row.id} /> : <StatusBadge value={row.status} />,
    },
  ]

  return (
    <DataTable
      rows={filtered}
      columns={columns}
      rowKey={(row) => row.id}
      noun="requests"
      filterKey={status}
      initialSort={{ id: "when", dir: "desc" }}
      searchText={(row) => [statusLabel(row.type), recordKindLabel(row.entityType), row.reason, row.requester.name].filter(Boolean).join(" ")}
      searchPlaceholder="Search request, reason or who asked"
      filters={
        <FilterChips
          label="Decision"
          activeKey={status}
          onSelect={(key) => setStatus(key as ApprovalFilter)}
          chips={[
            { key: "PENDING", label: "Waiting", count: counts.PENDING, tone: "warning" },
            { key: "APPROVED", label: "Approved", count: counts.APPROVED, tone: "success" },
            { key: "REJECTED", label: "Rejected", count: counts.REJECTED, tone: "danger" },
            { key: "all", label: "All", count: counts.all },
          ]}
        />
      }
      card={(row) => ({
        title: statusLabel(row.type),
        subtitle: `${recordKindLabel(row.entityType)} · ${row.requester.name ?? "Staff"} · ${formatShopWhen(row.requestedAt)}`,
        badge: row.status === "PENDING" && canDecide ? undefined : <StatusBadge value={row.status} />,
        meta: (
          <div className="w-full space-y-2">
            {row.reason ? <p>{row.reason}</p> : null}
            {row.status === "PENDING" && canDecide ? <Decide id={row.id} /> : null}
          </div>
        ),
      })}
      empty={rows.length === 0 ? "Nothing is waiting for a decision." : "No request matches this filter."}
    />
  )
}

function Decide({ id }: { id: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <ActionForm action={approveRequest} submit="Approve" successMessage="Approved." size="sm" buttonClassName="">
        <input type="hidden" name="id" value={id} />
      </ActionForm>
      <ActionForm action={rejectRequest} submit="Reject" successMessage="Rejected." size="sm" variant="outline" buttonClassName="">
        <input type="hidden" name="id" value={id} />
      </ActionForm>
    </div>
  )
}
