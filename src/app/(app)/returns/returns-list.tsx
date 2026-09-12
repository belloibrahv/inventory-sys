"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { completeReturn } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { StatusBadge } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Input } from "@/components/ui/input"
import { formatShopWhen } from "@/lib/lagos-day"
import { formatCurrency, money } from "@/lib/utils"

type ReturnRow = {
  id: string
  returnNumber: string
  status: string
  reason: string
  outcome: string
  faultClass: string
  refundAmount: unknown
  createdAt: Date
  approvedAt: Date | null
  completedAt: Date | null
  customer: { id: string; name: string }
  imei: { id: string; imei1: string } | null
  invoice: { id: string; invoiceNumber: string } | null
}

export function ReturnsList({ rows }: { rows: ReturnRow[] }) {
  const [status, setStatus] = useState("all")

  const filtered = useMemo(
    () => rows.filter((row) => (status === "all" ? true : row.status === status)),
    [rows, status]
  )

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { all: rows.length }
    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1
    }
    return byStatus
  }, [rows])

  const pager = usePagedRows(filtered, status)

  return (
    <div className="space-y-4">
      <WorkflowSteps
        activeKey={status}
        onSelect={setStatus}
        steps={[
          { key: "all", label: "All returns", count: counts.all, hint: "Every phone brought back" },
          { key: "PENDING", label: "Waiting", count: counts.PENDING ?? 0, hint: "Boss has not decided" },
          { key: "APPROVED", label: "Approved", count: counts.APPROVED ?? 0, hint: "Ready to finish" },
          { key: "COMPLETED", label: "Done", count: counts.COMPLETED ?? 0, hint: "Refund or replace applied" },
        ]}
      />

      <div className="space-y-3">
        {pager.pageRows.map((row) => {
          const when = row.completedAt ?? row.approvedAt ?? row.createdAt
          return (
            <div key={row.id} className="surface-card p-5">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">{row.returnNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    <Link href={`/customers/${row.customer.id}`} className="text-primary">
                      {row.customer.name}
                    </Link>
                    {" · "}
                    {row.imei ? (
                      <Link href={`/imei/${row.imei.id}`} className="text-primary">
                        {row.imei.imei1}
                      </Link>
                    ) : (
                      "No IMEI"
                    )}
                    {row.invoice ? (
                      <>
                        {" · "}
                        <Link href={`/sales/${row.invoice.id}`} className="text-primary">
                          {row.invoice.invoiceNumber}
                        </Link>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm">
                    {row.reason} → {row.outcome}
                    {row.refundAmount ? ` · ${formatCurrency(money(row.refundAmount))}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge value={row.status} />
                  <p className="mt-2 text-xs font-medium tabular-nums text-muted-foreground">
                    {row.completedAt ? "Finished" : row.approvedAt ? "Approved" : "Asked"} {formatShopWhen(when)}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Fault class: {row.faultClass}</p>
              {row.status === "PENDING" ? (
                <p className="mt-3 text-xs text-warning">
                  Waiting for the boss to say yes. Nobody can sell this IMEI until then.
                </p>
              ) : null}
              {row.status === "APPROVED" ? (
                <div className="mt-4 border-t border-border pt-4">
                  <ActionForm action={completeReturn} submit="Apply outcome" className="space-y-2">
                    <input type="hidden" name="id" value={row.id} />
                    {row.outcome === "REPLACEMENT" ? (
                      <Input name="replacementImei" placeholder="In-stock replacement IMEI" />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        This will{" "}
                        {row.outcome === "REFUND"
                          ? "give back cash from what they already paid"
                          : row.outcome === "REPAIR"
                            ? "open a repair job"
                            : row.outcome === "SEND_TO_SUPPLIER"
                              ? "send this phone back to the supplier. It will not stay in this shop"
                              : "post a credit note"}{" "}
                        without editing the original sale.
                      </p>
                    )}
                  </ActionForm>
                </div>
              ) : null}
            </div>
          )
        })}
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "No returns on the books yet."
              : "No return matches this stage. Tap another step above."}
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
              noun="returns"
            />
          </div>
        )}
      </div>
    </div>
  )
}
