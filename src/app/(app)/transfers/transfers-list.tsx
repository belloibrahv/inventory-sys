"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Download, FileSpreadsheet } from "lucide-react"
import { toast } from "sonner"
import { receiveTransfer, rejectTransfer } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { StatusBadge } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { WorkflowSteps } from "@/components/workflow-steps"
import { ScanList } from "@/components/scan-field"
import { Button } from "@/components/ui/button"
import { downloadTable } from "@/lib/download-table"
import { formatShopWhen } from "@/lib/lagos-day"
import { formatCurrency, money } from "@/lib/utils"

type TransferRow = {
  id: string
  transferNumber: string
  status: string
  createdAt: Date
  sentAt: Date | null
  receivedAt: Date | null
  fromBranch: { code: string; name: string }
  toBranch: { code: string; name: string }
  items: Array<{
    productId: string
    product: { name: string; sku: string; costPrice: number }
    quantity: number
  }>
  imeis: Array<{ id: string; imei1: string; productId: string; name: string; costPrice: number }>
}

function pieceLines(transfer: TransferRow) {
  const phoneProductIds = new Set(transfer.imeis.map((row) => row.productId))
  return transfer.items.filter((item) => !phoneProductIds.has(item.productId))
}

function transferTotals(transfer: TransferRow) {
  const pieces = pieceLines(transfer)
  const phoneQty = transfer.imeis.length
  const pieceQty = pieces.reduce((sum, item) => sum + item.quantity, 0)
  const phoneCost = transfer.imeis.reduce((sum, row) => sum + money(row.costPrice), 0)
  const pieceCost = pieces.reduce((sum, item) => sum + item.quantity * money(item.product.costPrice), 0)
  return {
    qty: phoneQty + pieceQty,
    costValue: phoneCost + pieceCost,
  }
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

  function extractList(format: "csv" | "xlsx") {
    const rows: Array<Array<string | number>> = [
      [
        "Transfer number",
        "Status",
        "From",
        "To",
        "Item",
        "IMEI or item code",
        "Qty",
        "Unit cost",
        "Cost value",
        "When",
      ],
    ]
    for (const transfer of filtered) {
      const when = formatShopWhen(transfer.receivedAt ?? transfer.sentAt ?? transfer.createdAt)
      if (transfer.imeis.length) {
        for (const imei of transfer.imeis) {
          const unit = money(imei.costPrice)
          rows.push([
            transfer.transferNumber,
            transfer.status,
            transfer.fromBranch.name,
            transfer.toBranch.name,
            imei.name,
            imei.imei1,
            1,
            unit.toFixed(2),
            unit.toFixed(2),
            when,
          ])
        }
      }
      for (const item of pieceLines(transfer)) {
        const unit = money(item.product.costPrice)
        rows.push([
          transfer.transferNumber,
          transfer.status,
          transfer.fromBranch.name,
          transfer.toBranch.name,
          item.product.name,
          item.product.sku,
          item.quantity,
          unit.toFixed(2),
          (item.quantity * unit).toFixed(2),
          when,
        ])
      }
      if (!transfer.imeis.length && !pieceLines(transfer).length) {
        rows.push([
          transfer.transferNumber,
          transfer.status,
          transfer.fromBranch.name,
          transfer.toBranch.name,
          "",
          "",
          0,
          "0.00",
          "0.00",
          when,
        ])
      }
    }
    const stamp = new Date().toISOString().slice(0, 10)
    const stage = status === "all" ? "all" : status.toLowerCase()
    void downloadTable(rows, `shop-to-shop-transfers-${stage}-${stamp}.${format}`, format)
    toast.success(format === "xlsx" ? "Excel extracted for this list." : "CSV extracted for this list.")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
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
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!filtered.length} onClick={() => extractList("csv")}>
            <Download className="mr-1.5 h-4 w-4" /> Extract list (CSV)
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!filtered.length} onClick={() => extractList("xlsx")}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Extract list (Excel)
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {pager.pageRows.map((transfer) => {
          const when = transfer.receivedAt ?? transfer.sentAt ?? transfer.createdAt
          const open = transfer.status === "PENDING" || transfer.status === "IN_TRANSIT"
          const totals = transferTotals(transfer)
          return (
            <div key={transfer.id} className="surface-card p-5">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{transfer.transferNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    From {transfer.fromBranch.name} → To {transfer.toBranch.name}
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">Qty on this transfer: </span>
                    <strong className="tabular-nums">{totals.qty}</strong>
                    <span className="text-muted-foreground"> · Cost value: </span>
                    <strong className="tabular-nums">{formatCurrency(totals.costValue)}</strong>
                  </p>

                  <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Item</th>
                          <th className="px-3 py-2 font-semibold">IMEI or item code</th>
                          <th className="px-3 py-2 text-center font-semibold">Qty</th>
                          <th className="px-3 py-2 text-right font-semibold">Unit cost</th>
                          <th className="px-3 py-2 text-right font-semibold">Cost value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transfer.imeis.map((imei) => {
                          const unit = money(imei.costPrice)
                          return (
                            <tr key={imei.id} className="border-t border-border/70">
                              <td className="px-3 py-2 font-medium">{imei.name}</td>
                              <td className="px-3 py-2">
                                <Link href={`/imei/${imei.id}`} className="font-mono text-xs text-primary">
                                  {imei.imei1}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-center tabular-nums">1</td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(unit)}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-medium">
                                {formatCurrency(unit)}
                              </td>
                            </tr>
                          )
                        })}
                        {pieceLines(transfer).map((item) => {
                          const unit = money(item.product.costPrice)
                          return (
                            <tr key={`${item.productId}-${item.quantity}`} className="border-t border-border/70">
                              <td className="px-3 py-2 font-medium">{item.product.name}</td>
                              <td className="px-3 py-2 font-mono text-xs">{item.product.sku}</td>
                              <td className="px-3 py-2 text-center tabular-nums font-semibold">{item.quantity}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(unit)}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-medium">
                                {formatCurrency(item.quantity * unit)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {transfer.status === "PENDING" ? (
                    <p className="mt-2 text-xs text-amber-800">
                      Stock is still In shop at {transfer.fromBranch.name}. It leaves only when {transfer.toBranch.name} accepts.
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
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
