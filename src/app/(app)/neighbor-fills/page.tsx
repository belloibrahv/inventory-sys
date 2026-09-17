import Link from "next/link"
import { getNeighborFillLookups, getNeighborFills, payNeighborFill, sellNeighborFill } from "@/app/actions/neighbor"
import { NeighborFillForm } from "@/app/(app)/neighbor-fills/neighbor-fill-form"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"

export default async function NeighborFillsPage() {
  const [rows, lookups] = await Promise.all([getNeighborFills(), getNeighborFillLookups()])
  const openProfit = rows.filter((row) => row.status !== "OPEN").reduce((sum, row) => sum + row.profit, 0)
  const stillOwed = rows.reduce((sum, row) => sum + Math.max(0, row.neighborCost - row.moneySentToNeighbor), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Outsourcing (Neighbour shop fill)"
        description="Buy from next door for a named customer. Sell here. Keep the profit."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Still open</p>
          <p className="text-2xl font-semibold">{rows.filter((row) => row.status === "OPEN").length}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Profit kept</p>
          <p className="text-2xl font-semibold">{formatCurrency(openProfit)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Still owed to next door</p>
          <p className="text-2xl font-semibold">{formatCurrency(stillOwed)}</p>
        </div>
      </div>
      <div className="page-split">
        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="surface-card p-5 text-sm text-muted-foreground">
              No stock outsourcing yet. Use this when you collect one unit from next door for a named customer.
            </div>
          ) : null}
          {rows.map((row) => {
            const neighborDue = Math.max(0, row.neighborCost - row.moneySentToNeighbor)
            return (
              <div key={row.id} className="surface-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{row.fillNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {row.shop} sourced from Partner: {row.neighborName}
                      {row.neighborPhone ? ` · ${row.neighborPhone}` : ""}
                    </p>
                    <p className="mt-1 text-sm">
                      {row.productName}
                      {row.imei1 ? ` · ${row.imei1}` : ""}
                      {" · "}
                      Customer: {row.customerName}
                    </p>
                    <p className="mt-1 text-sm">
                      Customer Price: {formatCurrency(row.sellPrice)}
                      {" · Partner Cost: "}
                      {formatCurrency(row.neighborCost)}
                      {" · Retained Margin: "}
                      {formatCurrency(row.profit)}
                    </p>
                    {row.invoiceNumber && row.saleId ? (
                      <p className="mt-1 text-sm">
                        Invoice{" "}
                        <Link href={`/sales/${row.saleId}`} className="text-primary">{row.invoiceNumber}</Link>
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge value={row.status} />
                </div>
                {row.status === "OPEN" ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="mb-2 text-sm text-muted-foreground">Sell it here. It does not go on our shelf.</p>
                    <ActionForm action={sellNeighborFill} submit="Complete this sale" className="grid gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
                      <input type="hidden" name="id" value={row.id} />
                      <Input name="paidAmount" type="number" defaultValue={row.sellPrice} required />
                      <Select name="method" defaultValue="CASH">
                        <option value="CASH">Cash</option>
                        <option value="TRANSFER">Bank Transfer</option>
                        <option value="POS">POS / Card</option>
                      </Select>
                    </ActionForm>
                  </div>
                ) : null}
                {neighborDue > 0 ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="mb-2 text-sm text-muted-foreground">
                      Pay {row.neighborName} {formatCurrency(neighborDue)}. Profit stays with Abu Twins.
                    </p>
                    <ActionForm action={payNeighborFill} submit="Pay this neighbor" className="grid gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
                      <input type="hidden" name="id" value={row.id} />
                      <Input name="amount" type="number" defaultValue={neighborDue} required />
                      <Select name="method" defaultValue="CASH">
                        <option value="CASH">Cash</option>
                        <option value="TRANSFER">Bank Transfer</option>
                        <option value="POS">POS / Card</option>
                      </Select>
                    </ActionForm>
                  </div>
                ) : row.status === "SETTLED" ? (
                  <p className="mt-3 text-sm text-success">Neighbor paid. Profit {formatCurrency(row.profit)} stays with us.</p>
                ) : null}
              </div>
            )
          })}
        </div>
        <div className="surface-card p-5">
          <h3 className="mb-2 font-semibold">Collect from next door</h3>
          <p className="mb-4 text-sm text-muted-foreground">Pick or type the customer. Neighbor cost. Sell here.</p>
          <NeighborFillForm
            customers={lookups.customers}
            products={lookups.products}
            branches={lookups.branches}
            neighbors={lookups.neighbors}
            defaultBranchId={lookups.defaultBranchId}
          />
        </div>
      </div>
    </div>
  )
}
