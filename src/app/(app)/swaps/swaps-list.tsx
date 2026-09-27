"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { completeSwap } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { StatusBadge } from "@/components/shared"
import { DataTable, type DataColumn } from "@/components/data-table"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatShopWhen } from "@/lib/lagos-day"
import { formatCurrency } from "@/lib/utils"
import { shopConditionLabel } from "@/lib/conditions"

type SwapRow = {
  id: string
  swapNumber: string
  status: string
  tradeValue: number
  newProductPrice: number
  balanceAmount: number
  createdAt: Date
  approvedAt: Date | null
  completedAt: Date | null
  customer: { name: string }
  oldDeviceCondition: string
  oldImei: {
    imei1: string
    serialNumber?: string | null
    conditionNotes?: string | null
    product: { name: string; storage?: string | null; brand?: { name: string } | null }
  }
  newProduct: { name: string; storage?: string | null }
  newImei?: { imei1: string; serialNumber?: string | null } | null
  invoice: { id: string; invoiceNumber: string } | null
}

function deviceLabel(row: { imei1: string; serialNumber?: string | null }) {
  if (row.serialNumber && row.serialNumber !== row.imei1) {
    return `${row.imei1} · serial ${row.serialNumber}`
  }
  return row.imei1
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

  const [open, setOpen] = useState<SwapRow | null>(null)
  const whenOf = (swap: SwapRow) => swap.completedAt ?? swap.approvedAt ?? swap.createdAt
  const oldName = (swap: SwapRow) =>
    [swap.oldImei.product.brand?.name, swap.oldImei.product.name, swap.oldImei.product.storage].filter(Boolean).join(" ")
  const newName = (swap: SwapRow) => [swap.newProduct.name, swap.newProduct.storage].filter(Boolean).join(" ")

  const columns: DataColumn<SwapRow>[] = [
    {
      id: "number",
      header: "Swap",
      sortValue: (swap) => swap.swapNumber,
      cell: (swap) => (
        <div>
          <span className="whitespace-nowrap font-medium text-primary">{swap.swapNumber}</span>
          <p className="text-xs text-muted-foreground">{swap.customer.name}</p>
        </div>
      ),
    },
    {
      id: "in",
      header: "Phone in",
      sortValue: oldName,
      cell: (swap) => (
        <div className="min-w-0">
          <p className="font-medium">{oldName(swap)}</p>
          <p className="text-xs text-muted-foreground">{formatCurrency(swap.tradeValue)}</p>
        </div>
      ),
    },
    {
      id: "out",
      header: "Phone out",
      hideBelow: "lg",
      sortValue: newName,
      cell: (swap) => (
        <div className="min-w-0">
          <p className="font-medium">{newName(swap)}</p>
          <p className="text-xs text-muted-foreground">{formatCurrency(swap.newProductPrice)}</p>
        </div>
      ),
    },
    {
      id: "balance",
      header: "Balance",
      align: "right",
      sortValue: (swap) => swap.balanceAmount,
      cell: (swap) => <SwapBalance balance={swap.balanceAmount} />,
    },
    {
      id: "status",
      header: "Status",
      sortValue: (swap) => swap.status,
      cell: (swap) => (
        <div className="whitespace-nowrap">
          <StatusBadge value={swap.status} />
          {swap.status === "APPROVED" ? <p className="mt-1 text-[11px] font-medium text-warning">Settle and invoice</p> : null}
        </div>
      ),
    },
    {
      id: "when",
      header: "When",
      hideBelow: "xl",
      sortValue: (swap) => new Date(whenOf(swap)).getTime(),
      cell: (swap) => <span className="whitespace-nowrap tabular-nums">{formatShopWhen(whenOf(swap))}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <WorkflowSteps
        activeKey={status}
        onSelect={setStatus}
        steps={[
          { key: "all", label: "All swaps", count: counts.all, hint: "Every trade-in" },
          { key: "PENDING", label: "Waiting", count: counts.PENDING ?? 0, hint: "Need a yes" },
          { key: "APPROVED", label: "Approved", count: counts.APPROVED ?? 0, hint: "Settle the balance" },
          { key: "COMPLETED", label: "Done", count: counts.COMPLETED ?? 0, hint: "Invoice closed" },
        ]}
      />

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(swap) => swap.id}
        noun="swaps"
        filterKey={status}
        onRowClick={setOpen}
        searchText={(swap) =>
          [swap.swapNumber, swap.customer.name, swap.oldImei.imei1, swap.oldImei.serialNumber, oldName(swap), newName(swap), swap.newImei?.imei1]
            .filter(Boolean)
            .join(" ")
        }
        searchPlaceholder="Search swap, customer, IMEI or phone"
        card={(swap) => ({
          title: swap.customer.name,
          subtitle: `${oldName(swap)} → ${newName(swap)}`,
          value: <SwapBalance balance={swap.balanceAmount} />,
          badge: <StatusBadge value={swap.status} />,
          meta: (
            <>
              <span>{swap.swapNumber}</span>
              <span>· {formatShopWhen(whenOf(swap))}</span>
            </>
          ),
        })}
        empty={swaps.length === 0 ? "No swaps on the books yet." : "No swap matches this stage. Tap another step above."}
      />

      <Sheet open={Boolean(open)} onOpenChange={(value) => !value && setOpen(null)}>
        {open ? (
          <SheetContent title={open.swapNumber} description={`${open.customer.name} · ${formatShopWhen(whenOf(open))}`} className="sm:w-[520px]">
            <SwapDetail swap={open} onDone={() => setOpen(null)} />
          </SheetContent>
        ) : null}
      </Sheet>
    </div>
  )
}

function SwapBalance({ balance }: { balance: number }) {
  if (balance > 0) return <span className="font-semibold text-warning">They pay {formatCurrency(balance)}</span>
  if (balance < 0) return <span className="font-semibold text-info">We pay {formatCurrency(-balance)}</span>
  return <span className="text-muted-foreground">Even</span>
}

function SwapDetail({ swap, onDone }: { swap: SwapRow; onDone: () => void }) {
  const receivable = Math.max(swap.balanceAmount, 0)
  const payable = Math.max(-swap.balanceAmount, 0)
  const givenOut = swap.newImei ? deviceLabel(swap.newImei) : swap.newProduct.name
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Phone in</p>
          <p className="font-semibold tabular-nums">{formatCurrency(swap.tradeValue)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Phone out</p>
          <p className="font-semibold tabular-nums">{formatCurrency(swap.newProductPrice)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Balance</p>
          <p className="text-sm"><SwapBalance balance={swap.balanceAmount} /></p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd><StatusBadge value={swap.status} /></dd>
        <dt className="text-muted-foreground">Customer brings</dt>
        <dd>
          <p className="font-medium">
            {[swap.oldImei.product.brand?.name, swap.oldImei.product.name, swap.oldImei.product.storage, shopConditionLabel(swap.oldDeviceCondition)]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="font-mono text-xs text-muted-foreground">{deviceLabel(swap.oldImei)}</p>
          {swap.oldImei.conditionNotes ? <p className="text-xs text-muted-foreground">{swap.oldImei.conditionNotes}</p> : null}
        </dd>
        <dt className="text-muted-foreground">Takes</dt>
        <dd>
          <p className="font-medium">{[swap.newProduct.name, swap.newProduct.storage].filter(Boolean).join(" · ")}</p>
          <p className="font-mono text-xs text-muted-foreground">{givenOut}</p>
        </dd>
        {swap.invoice ? (
          <>
            <dt className="text-muted-foreground">Invoice</dt>
            <dd>
              <Link href={`/sales/${swap.invoice.id}`} className="text-primary hover:underline">
                {swap.invoice.invoiceNumber}
              </Link>
            </dd>
          </>
        ) : null}
      </dl>
      {swap.status === "PENDING" ? (
        <p className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning">
          Waiting for approval. Stock does not move until Needs approval says yes.
        </p>
      ) : null}
      {swap.status === "APPROVED" ? (
        <div className="space-y-2 rounded-xl border border-border p-4">
          <p className="text-sm font-medium">
            {receivable > 0
              ? "Stock has moved. Collect what they owe and finish the invoice."
              : payable > 0
                ? "Stock has moved. Pay the customer and finish the invoice."
                : "Stock has moved. Finish the invoice. No money either way."}
          </p>
          <ActionForm
            action={completeSwap}
            submit={receivable > 0 ? "Collect & invoice" : payable > 0 ? "Pay & invoice" : "Finish invoice"}
            successMessage="Swap finished and invoiced."
            className="grid gap-2 sm:grid-cols-2"
            onSuccess={onDone}
          >
            <input type="hidden" name="id" value={swap.id} />
            <Input
              name="paidAmount"
              type="number"
              defaultValue={receivable > 0 ? receivable : payable}
              placeholder={receivable > 0 ? "Amount received" : payable > 0 ? "Amount paid out" : "0"}
              aria-label="Amount"
            />
            <Select name="method" defaultValue="TRANSFER" aria-label="How">
              <option value="CASH">Cash</option>
              <option value="TRANSFER">Transfer</option>
              <option value="POS">POS</option>
            </Select>
          </ActionForm>
        </div>
      ) : null}
    </div>
  )
}
