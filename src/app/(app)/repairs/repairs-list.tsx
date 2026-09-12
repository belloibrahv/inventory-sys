"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { advanceRepair } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { StatusBadge } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatShopWhen } from "@/lib/lagos-day"
import { statusLabel } from "@/lib/status"
import { formatCurrency, money } from "@/lib/utils"

const stages = ["PENDING", "DIAGNOSING", "REPAIRING", "WAITING_PARTS", "COMPLETED", "DELIVERED"]

type RepairRow = {
  id: string
  repairNumber: string
  status: string
  issue: string
  diagnosis: string | null
  repairCost: unknown
  createdAt: Date
  completedAt: Date | null
  imei: { id: string; imei1: string; product: { name: string } }
  customer: { name: string } | null
}

export function RepairsList({ rows }: { rows: RepairRow[] }) {
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
        className="lg:grid-cols-3 xl:grid-cols-6"
        steps={[
          { key: "all", label: "All repairs", count: counts.all, hint: "Every job on the bench" },
          { key: "PENDING", label: "Take in", count: counts.PENDING ?? 0, hint: "Just opened" },
          { key: "DIAGNOSING", label: "Find fault", count: counts.DIAGNOSING ?? 0, hint: "Checking" },
          { key: "WAITING_PARTS", label: "Wait for parts", count: counts.WAITING_PARTS ?? 0, hint: "Parts not yet" },
          { key: "REPAIRING", label: "Repair", count: counts.REPAIRING ?? 0, hint: "On the bench" },
          { key: "DELIVERED", label: "Give back", count: counts.DELIVERED ?? 0, hint: "Back with buyer" },
        ]}
      />

      <div className="space-y-3">
        {pager.pageRows.map((row) => {
          const when = row.completedAt ?? row.createdAt
          return (
            <div key={row.id} className="surface-card p-5">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">{row.repairNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.imei.product.name} ·{" "}
                    <Link href={`/imei/${row.imei.id}`} className="text-primary">
                      {row.imei.imei1}
                    </Link>
                  </p>
                  <p className="mt-1 text-sm">{row.issue}</p>
                  {row.customer ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.customer.name}
                      {row.repairCost ? ` · charge ${formatCurrency(money(row.repairCost))} on deliver` : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      This is a shop phone. When you finish, it goes back into shop stock.
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <StatusBadge value={row.status} />
                  <p className="mt-2 text-xs font-medium tabular-nums text-muted-foreground">
                    {row.completedAt ? "Finished" : "Opened"} {formatShopWhen(when)}
                  </p>
                </div>
              </div>
              {row.status !== "DELIVERED" && row.status !== "CANCELLED" ? (
                <div className="mt-4 border-t border-border pt-4">
                  <ActionForm action={advanceRepair} submit="Update repair" className="grid gap-2 md:grid-cols-2">
                    <input type="hidden" name="id" value={row.id} />
                    <Select name="status" defaultValue={row.status}>
                      {stages.map((item) => (
                        <option key={item} value={item}>
                          {statusLabel(item)}
                        </option>
                      ))}
                    </Select>
                    <Input
                      name="repairCost"
                      type="number"
                      placeholder="Repair cost"
                      defaultValue={row.repairCost ? String(row.repairCost) : ""}
                    />
                    <Textarea
                      name="diagnosis"
                      placeholder="What you found wrong with this phone"
                      defaultValue={row.diagnosis ?? ""}
                      className="md:col-span-2"
                    />
                  </ActionForm>
                </div>
              ) : null}
            </div>
          )
        })}
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "No repairs on the books yet."
              : "No repair matches this stage. Tap another step above."}
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
              noun="repairs"
            />
          </div>
        )}
      </div>
    </div>
  )
}
