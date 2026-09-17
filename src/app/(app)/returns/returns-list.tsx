"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { completeReturn } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { StatusBadge } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatShopWhen } from "@/lib/lagos-day"
import { formatCurrency, money } from "@/lib/utils"

type DeviceRef = {
  id: string
  imei1: string
  serialNumber?: string | null
  productName?: string
}

type ReturnRow = {
  id: string
  returnNumber: string
  status: string
  reason: string
  outcome: string
  faultClass: string
  returnValue: number | null
  refundAmount: unknown
  replacementValue: number | null
  balanceAmount: number | null
  createdAt: Date
  approvedAt: Date | null
  completedAt: Date | null
  customer: { id: string; name: string }
  imei: DeviceRef | null
  replacementImei: DeviceRef | null
  invoice: { id: string; invoiceNumber: string } | null
}

type StockUnit = {
  id: string
  imei1: string
  serialNumber: string | null
  branchId: string
  product: { name: string; sellingPrice: number }
}

function deviceLabel(row: { imei1: string; serialNumber?: string | null }) {
  if (row.serialNumber && row.serialNumber !== row.imei1) return `${row.imei1} · serial ${row.serialNumber}`
  return row.imei1
}

function outcomeLabel(outcome: string) {
  if (outcome === "REPLACEMENT") return "Replace from our stock"
  if (outcome === "REFUND") return "Refund"
  if (outcome === "CREDIT_NOTE") return "Credit note"
  if (outcome === "SEND_TO_SUPPLIER") return "Send back to the supplier"
  if (outcome === "REPAIR") return "Repair"
  return outcome
}

export function ReturnsList({ rows, stock }: { rows: ReturnRow[]; stock: StockUnit[] }) {
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
          const returnValue = row.returnValue ?? money(row.refundAmount)
          const balance = row.balanceAmount ?? 0
          const receivable = Math.max(balance, 0)
          const payable = Math.max(-balance, 0)
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
                        {deviceLabel(row.imei)}
                        {row.imei.productName ? ` · ${row.imei.productName}` : ""}
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
                    {outcomeLabel(row.outcome)}
                    {returnValue ? ` · Return value ${formatCurrency(returnValue)}` : ""}
                  </p>
                  {row.outcome === "REPLACEMENT" ? (
                    <p className="mt-1 text-sm">
                      {row.replacementImei
                        ? `Replacement: ${deviceLabel(row.replacementImei)}${row.replacementImei.productName ? ` · ${row.replacementImei.productName}` : ""}`
                        : "Replacement not locked yet"}
                      {row.replacementValue != null ? ` · Replacement value ${formatCurrency(row.replacementValue)}` : ""}
                    </p>
                  ) : null}
                  {row.outcome === "REPLACEMENT" && row.balanceAmount != null ? (
                    <p className="mt-1 text-sm font-medium">
                      {receivable > 0
                        ? `Receivable (customer pays us): ${formatCurrency(receivable)}`
                        : payable > 0
                          ? `Payable (we pay / refund the customer): ${formatCurrency(payable)}`
                          : "Balance: even"}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <StatusBadge value={row.status} />
                  <p className="mt-2 text-xs font-medium tabular-nums text-muted-foreground">
                    {row.completedAt ? "Finished" : row.approvedAt ? "Approved" : "Asked"} {formatShopWhen(when)}
                  </p>
                </div>
              </div>
              {row.status === "PENDING" ? (
                <p className="mt-3 text-sm text-warning">
                  Waiting for approval. Stock and money do not move until Needs approval says yes.
                </p>
              ) : null}
              {row.status === "APPROVED" ? (
                <div className="mt-4 border-t border-border pt-4">
                  <ActionForm action={completeReturn} submit="Apply outcome" className="space-y-2">
                    <input type="hidden" name="id" value={row.id} />
                    {row.outcome === "REPLACEMENT" ? (
                      <>
                        {!row.replacementImei ? (
                          <Select name="replacementImeiId" required emptyLabel="No In shop unit is ready.">
                            <option value="">Pick the shop item to give out</option>
                            {stock.map((unit) => (
                              <option key={unit.id} value={unit.id}>
                                {deviceLabel(unit)} · {unit.product.name} · {formatCurrency(unit.product.sellingPrice)}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <input type="hidden" name="replacementImeiId" value={row.replacementImei.id} />
                        )}
                        <Input
                          name="paidAmount"
                          type="number"
                          defaultValue={receivable > 0 ? receivable : payable}
                          placeholder={
                            receivable > 0
                              ? "Amount received from customer"
                              : payable > 0
                                ? "Amount paid to customer"
                                : "0"
                          }
                        />
                        <Select name="method" defaultValue="CASH">
                          <option value="CASH">Cash</option>
                          <option value="TRANSFER">Transfer</option>
                          <option value="POS">POS</option>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                          Stock moves on Apply. Collect Receivable or pay Payable so the books match the event.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
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
