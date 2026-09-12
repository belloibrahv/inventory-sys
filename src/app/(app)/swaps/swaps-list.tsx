"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { completeSwap } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { StatusBadge } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatShopWhen } from "@/lib/lagos-day"
import { formatCurrency, money } from "@/lib/utils"

type SwapRow = {
  id: string
  swapNumber: string
  status: string
  tradeValue: unknown
  balanceAmount: unknown
  createdAt: Date
  approvedAt: Date | null
  completedAt: Date | null
  customer: { name: string }
  oldImei: { imei1: string; product: { name: string } }
  newProduct: { name: string }
  invoice: { id: string; invoiceNumber: string } | null
}

export function SwapsList({ swaps }: { swaps: SwapRow[] }) {
  const [status, setStatus] = useState("all")

  const filtered = useMemo(
    () => swaps.filter((swap) => (status === "all" ? true : swap.status === status)),
    [swaps, status]
  )

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { all: swaps.length }
    for (const swap of swaps) {
      byStatus[swap.status] = (byStatus[swap.status] ?? 0) + 1
    }
    return byStatus
  }, [swaps])

  const pager = usePagedRows(filtered, status)

  return (
    <div className="space-y-4">
      <WorkflowSteps
        activeKey={status}
        onSelect={setStatus}
        steps={[
          { key: "all", label: "All swaps", count: counts.all, hint: "Every trade-in" },
          { key: "PENDING", label: "Waiting", count: counts.PENDING ?? 0, hint: "Need a yes" },
          { key: "APPROVED", label: "Approved", count: counts.APPROVED ?? 0, hint: "Collect the balance" },
          { key: "COMPLETED", label: "Done", count: counts.COMPLETED ?? 0, hint: "Invoice closed" },
        ]}
      />

      <div className="space-y-3">
        {pager.pageRows.map((swap) => {
          const when = swap.completedAt ?? swap.approvedAt ?? swap.createdAt
          return (
            <div key={swap.id} className="surface-card p-5">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">{swap.swapNumber}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {swap.customer.name} trades {swap.oldImei.imei1} ({swap.oldImei.product.name}) for{" "}
                    {swap.newProduct.name}
                  </p>
                  <p className="mt-1 text-sm">
                    Trade {formatCurrency(money(swap.tradeValue))} · customer pays{" "}
                    {formatCurrency(money(swap.balanceAmount))}
                  </p>
                  {swap.invoice ? (
                    <p className="mt-2 text-sm">
                      Closed on{" "}
                      <Link href={`/sales/${swap.invoice.id}`} className="text-primary">
                        {swap.invoice.invoiceNumber}
                      </Link>
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <StatusBadge value={swap.status} />
                  <p className="mt-2 text-xs font-medium tabular-nums text-muted-foreground">
                    {swap.completedAt ? "Finished" : swap.approvedAt ? "Approved" : "Started"}{" "}
                    {formatShopWhen(when)}
                  </p>
                </div>
              </div>
              {swap.status === "PENDING" ? (
                <p className="mt-3 text-xs text-warning">
                  Waiting for the CEO or the manager to say yes. Only they can collect the money now.
                </p>
              ) : null}
              {swap.status === "APPROVED" || swap.status === "PENDING" ? (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-2 text-sm font-medium">Collect the difference and finish</p>
                  <ActionForm action={completeSwap} submit="Collect & invoice" className="grid gap-2 md:grid-cols-3">
                    <input type="hidden" name="id" value={swap.id} />
                    <Input name="paidAmount" type="number" defaultValue={money(swap.balanceAmount)} />
                    <Select name="method" defaultValue="TRANSFER">
                      <option value="CASH">Cash</option>
                      <option value="TRANSFER">Transfer</option>
                      <option value="POS">POS</option>
                    </Select>
                  </ActionForm>
                </div>
              ) : null}
            </div>
          )
        })}
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            {swaps.length === 0
              ? "No swaps on the books yet."
              : "No swap matches this stage. Tap another step above."}
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
              noun="swaps"
            />
          </div>
        )}
      </div>
    </div>
  )
}
