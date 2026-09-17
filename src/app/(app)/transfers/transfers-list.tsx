"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { receiveTransfer, rejectTransfer } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { StatusBadge } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { WorkflowSteps } from "@/components/workflow-steps"
import { ScanList } from "@/components/scan-field"
import { formatShopWhen } from "@/lib/lagos-day"

type TransferRow = {
  id: string
  transferNumber: string
  status: string
  createdAt: Date
  sentAt: Date | null
  receivedAt: Date | null
  fromBranch: { code: string; name: string }
  toBranch: { code: string; name: string }
  items: Array<{ product: { name: string }; quantity: number }>
  imeis: Array<{ id: string; imei1: string }>
}

export function TransfersList({ transfers }: { transfers: TransferRow[] }) {
  const [status, setStatus] = useState("all")

  const filtered = useMemo(
    () => transfers.filter((transfer) => (status === "all" ? true : transfer.status === status)),
    [transfers, status]
  )

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { all: transfers.length }
    for (const transfer of transfers) {
      byStatus[transfer.status] = (byStatus[transfer.status] ?? 0) + 1
    }
    return byStatus
  }, [transfers])

  const pager = usePagedRows(filtered, status)

  return (
    <div className="space-y-4">
      <WorkflowSteps
        activeKey={status}
        onSelect={setStatus}
        steps={[
          { key: "all", label: "All", count: counts.all },
          { key: "PENDING", label: "Waiting for accept", count: counts.PENDING ?? 0 },
          { key: "IN_TRANSIT", label: "On the way", count: counts.IN_TRANSIT ?? 0 },
          { key: "RECEIVED", label: "Accepted", count: counts.RECEIVED ?? 0 },
          { key: "CANCELLED", label: "Rejected", count: counts.CANCELLED ?? 0 },
        ]}
      />

      <div className="space-y-3">
        {pager.pageRows.map((transfer) => {
          const when = transfer.receivedAt ?? transfer.sentAt ?? transfer.createdAt
          const open = transfer.status === "PENDING" || transfer.status === "IN_TRANSIT"
          return (
            <div key={transfer.id} className="surface-card p-5">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">{transfer.transferNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    From {transfer.fromBranch.name} → To {transfer.toBranch.name}
                    {transfer.items.map((item) => ` · ${item.product.name} × ${item.quantity}`).join("")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    {transfer.imeis.map((imei) => (
                      <Link key={imei.id} href={`/imei/${imei.id}`} className="text-primary">
                        {imei.imei1}
                      </Link>
                    ))}
                  </div>
                  {transfer.status === "PENDING" ? (
                    <p className="mt-2 text-xs text-amber-800">
                      Stock is still In shop at {transfer.fromBranch.name}. It leaves only when {transfer.toBranch.name} accepts.
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <StatusBadge value={transfer.status} />
                  <p className="mt-2 text-xs font-medium tabular-nums text-muted-foreground">
                    {transfer.status === "RECEIVED"
                      ? "Accepted"
                      : transfer.status === "CANCELLED"
                        ? "Rejected"
                        : transfer.status === "PENDING"
                          ? "Submitted"
                          : "Sent"}{" "}
                    {formatShopWhen(when)}
                  </p>
                </div>
              </div>
              {open ? (
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">
                    {transfer.toBranch.name} accepts or rejects this transfer.
                  </p>
                  <ActionForm
                    action={receiveTransfer}
                    submit="Accept transfer"
                    successMessage="Transfer accepted. Stock is now In shop at the receiving branch."
                    enterDoesNotSubmit
                    className="space-y-2"
                    confirmModal={{
                      title: "Accept this transfer?",
                      description: `Stock will leave ${transfer.fromBranch.name} and land In shop at ${transfer.toBranch.name}.`,
                      confirmLabel: "Accept transfer",
                      tone: "warning",
                    }}
                  >
                    <input type="hidden" name="id" value={transfer.id} />
                    {transfer.imeis.length ? (
                      <ScanList name="imeis" />
                    ) : (
                      <p className="text-sm text-muted-foreground">No IMEI on this transfer. Confirm the pieces arrived.</p>
                    )}
                  </ActionForm>
                  <ActionForm
                    action={rejectTransfer}
                    submit="Reject transfer"
                    successMessage="Transfer rejected. Stock stays In shop at the sending branch."
                    variant="outline"
                    className="space-y-2"
                    confirmModal={{
                      title: "Reject this transfer?",
                      description:
                        transfer.status === "PENDING"
                          ? `Nothing leaves ${transfer.fromBranch.name}. The In shop record stays as it is.`
                          : `Stock returns to ${transfer.fromBranch.name}.`,
                      confirmLabel: "Reject transfer",
                      tone: "danger",
                    }}
                  >
                    <input type="hidden" name="id" value={transfer.id} />
                  </ActionForm>
                </div>
              ) : transfer.status === "RECEIVED" ? (
                <p className="mt-2 text-xs text-success">In shop at {transfer.toBranch.name}.</p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Rejected. Stock stayed at {transfer.fromBranch.name}.</p>
              )}
            </div>
          )
        })}
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            {transfers.length === 0
              ? "No shop-to-shop transfers yet."
              : "Nothing in this stage. Tap another stage above."}
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
              noun="transfers"
            />
          </div>
        )}
      </div>
    </div>
  )
}
