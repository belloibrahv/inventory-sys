"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { receiveTransfer } from "@/app/actions/ops"
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
          {
            key: "all",
            label: "All sends",
            count: counts.all,
            hint: "Every shop-to-shop move",
          },
          {
            key: "PENDING",
            label: "Waiting to leave",
            count: counts.PENDING ?? 0,
            hint: "Listed, not yet on the road",
          },
          {
            key: "IN_TRANSIT",
            label: "On the way",
            count: counts.IN_TRANSIT ?? 0,
            hint: "Going to the other shop",
          },
          {
            key: "RECEIVED",
            label: "In that shop",
            count: counts.RECEIVED ?? 0,
            hint: "Confirmed on arrival",
          },
        ]}
      />

      <div className="space-y-3">
        {pager.pageRows.map((transfer) => {
          const when = transfer.receivedAt ?? transfer.sentAt ?? transfer.createdAt
          return (
            <div key={transfer.id} className="surface-card p-5">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">{transfer.transferNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {transfer.fromBranch.code} → {transfer.toBranch.code}
                    {transfer.items.map((item) => ` · ${item.product.name} × ${item.quantity}`).join("")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    {transfer.imeis.map((imei) => (
                      <Link key={imei.id} href={`/imei/${imei.id}`} className="text-primary">
                        {imei.imei1}
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <StatusBadge value={transfer.status} />
                  <p className="mt-2 text-xs font-medium tabular-nums text-muted-foreground">
                    {transfer.receivedAt ? "Arrived" : transfer.sentAt ? "Sent" : "Booked"} {formatShopWhen(when)}
                  </p>
                </div>
              </div>
              {transfer.status !== "RECEIVED" ? (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-2 text-sm text-muted-foreground">
                    {transfer.toBranch.name} must scan or paste every IMEI from the list that actually arrived.
                  </p>
                  <ActionForm action={receiveTransfer} submit="Confirm arrival" className="space-y-2">
                    <input type="hidden" name="id" value={transfer.id} />
                    {transfer.imeis.length ? (
                      <ScanList name="imeis" />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nothing on this send has a unique number. Just confirm how many accessories arrived.
                      </p>
                    )}
                  </ActionForm>
                </div>
              ) : (
                <p className="mt-2 text-xs text-success">Live at {transfer.toBranch.name}.</p>
              )}
            </div>
          )
        })}
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            {transfers.length === 0
              ? "No shop-to-shop sends yet."
              : "No send matches this filter. Tap another stage above."}
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
              noun="sends"
            />
          </div>
        )}
      </div>
    </div>
  )
}
