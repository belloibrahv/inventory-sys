"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Package, Smartphone } from "lucide-react"
import { completeReturn } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { StatusBadge } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { formatShopWhen } from "@/lib/lagos-day"
import { formatCurrency, money } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type DeviceRef = {
  id: string
  imei1: string
  serialNumber?: string | null
  productName?: string
}

type SaleItemRef = {
  id: string
  productName: string
  quantity: number
}

type ReturnRow = {
  id: string
  returnNumber: string
  status: string
  reason: string
  outcome: string
  faultClass: string
  notes: string | null
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
  saleItem: SaleItemRef | null
  invoice: { id: string; invoiceNumber: string } | null
}

type StockUnit = {
  id: string
  imei1: string
  serialNumber: string | null
  branchId: string
  product: { name: string; sellingPrice: number }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function reasonLabel(reason: string) {
  if (reason === "FAULTY") return "Faulty"
  if (reason === "WARRANTY") return "Under warranty"
  if (reason === "CUSTOMER_DISSATISFACTION") return "Customer not satisfied"
  if (reason === "DAMAGED") return "Damaged"
  if (reason === "WRONG_PRODUCT") return "Wrong product"
  if (reason === "SUPPLIER_RETURN") return "Send toward supplier"
  return reason
}

/** Parse the quantity from notes written by the invoice path, e.g. "Item: X · Qty: 3 · ..." */
function parseReturnQty(notes: string | null): number | null {
  if (!notes) return null
  const match = notes.match(/Qty:\s*(\d+)/)
  return match ? Number(match[1]) : null
}

// ─── Item summary chip ────────────────────────────────────────────────────────

function ItemChip({ row }: { row: ReturnRow }) {
  if (row.imei) {
    return (
      <span className="inline-flex items-center gap-1 text-sm">
        <Smartphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Link href={`/imei/${row.imei.id}`} className="text-primary hover:underline">
          {deviceLabel(row.imei)}
          {row.imei.productName ? ` · ${row.imei.productName}` : ""}
        </Link>
      </span>
    )
  }
  if (row.saleItem) {
    const qty = parseReturnQty(row.notes)
    return (
      <span className="inline-flex items-center gap-1 text-sm">
        <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span>{row.saleItem.productName}</span>
        {qty && qty > 1 ? (
          <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">
            ×{qty}
          </span>
        ) : null}
      </span>
    )
  }
  return <span className="text-sm text-muted-foreground">No item recorded</span>
}

// ─── Type tag ─────────────────────────────────────────────────────────────────

function TypeTag({ row }: { row: ReturnRow }) {
  const isInvoice = !row.imei && !!row.saleItem
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        isInvoice
          ? "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-400"
          : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-400"
      )}
    >
      {isInvoice ? (
        <><Package className="h-3 w-3" /> Item</>
      ) : (
        <><Smartphone className="h-3 w-3" /> Phone</>
      )}
    </span>
  )
}

// ─── Balance row ──────────────────────────────────────────────────────────────

function BalanceLine({ row }: { row: ReturnRow }) {
  if (row.outcome !== "REPLACEMENT" || row.balanceAmount == null) return null
  const balance = row.balanceAmount ?? 0
  const receivable = Math.max(balance, 0)
  const payable = Math.max(-balance, 0)
  return (
    <p
      className={cn(
        "mt-1 text-sm font-medium",
        receivable > 0 ? "text-amber-600 dark:text-amber-400" : payable > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
      )}
    >
      {receivable > 0
        ? `Receivable (customer pays us): ${formatCurrency(receivable)}`
        : payable > 0
          ? `Payable (we refund the customer): ${formatCurrency(payable)}`
          : "Balance: even"}
    </p>
  )
}

// ─── Apply form (shown when status === APPROVED) ──────────────────────────────

function ApplyForm({ row, stock }: { row: ReturnRow; stock: StockUnit[] }) {
  const returnValue = row.returnValue ?? money(row.refundAmount)
  const balance = row.balanceAmount ?? 0
  const receivable = Math.max(balance, 0)
  const payable = Math.max(-balance, 0)

  return (
    <div className="mt-4 border-t border-border pt-4">
      <ActionForm action={completeReturn} submit="Apply outcome" className="space-y-3">
        <input type="hidden" name="id" value={row.id} />

        {row.outcome === "REPLACEMENT" ? (
          <>
            {!row.replacementImei ? (
              <Select name="replacementImeiId" required emptyLabel="No In shop unit is ready.">
                <option value="">Pick the item to give out</option>
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
                  ? "Amount received from customer (₦)"
                  : payable > 0
                    ? "Amount paid to customer (₦)"
                    : "0"
              }
            />
            <Select name="method" defaultValue="CASH">
              <option value="CASH">Cash</option>
              <option value="TRANSFER">Transfer</option>
              <option value="POS">POS</option>
            </Select>
            <p className="text-sm text-muted-foreground">
              Stock moves on Apply. Collect the receivable or pay the payable so the books match the event.
            </p>
          </>
        ) : (
          <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            This will{" "}
            {row.outcome === "REFUND"
              ? `refund ${returnValue != null ? formatCurrency(returnValue) : "the return value"} from what was already paid`
              : row.outcome === "REPAIR"
                ? "open a repair job for this phone"
                : row.outcome === "SEND_TO_SUPPLIER"
                  ? "send this phone back to the supplier — it will not stay in this shop"
                  : "post a credit note against what the customer owes"}{" "}
            without editing the original invoice.
          </p>
        )}
      </ActionForm>
    </div>
  )
}

// ─── Main list ────────────────────────────────────────────────────────────────

export function ReturnsList({ rows, stock }: { rows: ReturnRow[]; stock: StockUnit[] }) {
  const [status, setStatus] = useState("all")

  const filtered = useMemo(
    () => rows.filter((row) => (status === "all" ? true : row.status === status)),
    [rows, status]
  )

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { all: rows.length }
    for (const row of rows) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1
    return byStatus
  }, [rows])

  const pager = usePagedRows(filtered, status)

  return (
    <div className="space-y-4">
      <WorkflowSteps
        activeKey={status}
        onSelect={setStatus}
        steps={[
          { key: "all",       label: "All returns", count: counts.all,              hint: "Every item brought back" },
          { key: "PENDING",   label: "Waiting",     count: counts.PENDING   ?? 0,   hint: "Waiting for approval" },
          { key: "APPROVED",  label: "Approved",    count: counts.APPROVED  ?? 0,   hint: "Ready to finish" },
          { key: "COMPLETED", label: "Done",        count: counts.COMPLETED ?? 0,   hint: "Refund or replace applied" },
        ]}
      />

      <div className="space-y-3">
        {pager.pageRows.map((row) => {
          const when = row.completedAt ?? row.approvedAt ?? row.createdAt
          const returnValue = row.returnValue ?? money(row.refundAmount)

          return (
            <div key={row.id} className="surface-card p-5">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  {/* Return number + type tag */}
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{row.returnNumber}</p>
                    <TypeTag row={row} />
                  </div>

                  {/* Customer + device/item + invoice link */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                    <Link href={`/customers/${row.customer.id}`} className="text-primary hover:underline">
                      {row.customer.name}
                    </Link>
                    <span className="text-muted-foreground/40">·</span>
                    <ItemChip row={row} />
                    {row.invoice ? (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <Link href={`/sales/${row.invoice.id}`} className="text-primary hover:underline">
                          {row.invoice.invoiceNumber}
                        </Link>
                      </>
                    ) : null}
                  </div>

                  {/* Outcome + return value */}
                  <p className="text-sm">
                    <span className="font-medium">{outcomeLabel(row.outcome)}</span>
                    <span className="text-muted-foreground"> · {reasonLabel(row.reason)}</span>
                    {returnValue != null ? (
                      <span className="text-muted-foreground"> · Return value {formatCurrency(returnValue)}</span>
                    ) : null}
                  </p>

                  {/* Replacement line */}
                  {row.outcome === "REPLACEMENT" && (
                    <p className="text-sm text-muted-foreground">
                      {row.replacementImei
                        ? `Replacement: ${deviceLabel(row.replacementImei)}${row.replacementImei.productName ? ` · ${row.replacementImei.productName}` : ""}${row.replacementValue != null ? ` · ${formatCurrency(row.replacementValue)}` : ""}`
                        : "Replacement not locked yet"}
                    </p>
                  )}

                  {/* Balance */}
                  <BalanceLine row={row} />
                </div>

                {/* Status + timestamp */}
                <div className="shrink-0 text-right">
                  <StatusBadge value={row.status} />
                  <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                    {row.completedAt ? "Finished" : row.approvedAt ? "Approved" : "Asked"}{" "}
                    {formatShopWhen(when)}
                  </p>
                </div>
              </div>

              {/* Waiting notice */}
              {row.status === "PENDING" && (
                <p className="mt-3 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
                  Waiting for approval. Stock and money do not move until Needs approval says yes.
                </p>
              )}

              {/* Apply form for approved returns */}
              {row.status === "APPROVED" && <ApplyForm row={row} stock={stock} />}
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
