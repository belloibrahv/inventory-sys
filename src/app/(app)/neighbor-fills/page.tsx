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
        title="Buy from next door"
        description="A buyer wants something we do not have. You get it from the shop next door, sell it here, send them their money, and keep our profit."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Not finished yet</p>
          <p className="text-2xl font-semibold">{rows.filter((row) => row.status === "OPEN").length}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Profit we kept</p>
          <p className="text-2xl font-semibold">{formatCurrency(openProfit)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Money we still owe next door</p>
          <p className="text-2xl font-semibold">{formatCurrency(stillOwed)}</p>
        </div>
      </div>
      <div className="page-split">
        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="surface-card p-5 text-sm text-muted-foreground">
              Nothing bought from next door yet. Use this when you walk next door for one buyer, not when Iwo Road sends stock to Challenge.
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
                      {row.shop} collected from {row.neighborName}
                      {row.neighborPhone ? ` · ${row.neighborPhone}` : ""}
                    </p>
                    <p className="mt-1 text-sm">
                      {row.productName}
                      {row.imei1 ? ` · ${row.imei1}` : ""}
                      {" · "}
                      {row.customerName}
                    </p>
                    <p className="mt-1 text-sm">
                      Customer pays {formatCurrency(row.sellPrice)}
                      {" · next door is owed "}
                      {formatCurrency(row.neighborCost)}
                      {" · we keep "}
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
                    <p className="mb-2 text-sm text-muted-foreground">
                      Sell to this named customer. The unit does not sit on our shelf as In shop stock.
                    </p>
                    <ActionForm action={sellNeighborFill} submit="Sell to this customer" className="grid gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
                      <input type="hidden" name="id" value={row.id} />
                      <Input name="paidAmount" type="number" defaultValue={row.sellPrice} required />
                      <Select name="method" defaultValue="CASH">
                        <option value="CASH">Cash</option>
                        <option value="TRANSFER">Transfer</option>
                        <option value="POS">POS</option>
                      </Select>
                    </ActionForm>
                  </div>
                ) : null}
                {neighborDue > 0 ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="mb-2 text-sm text-muted-foreground">
                      Return {formatCurrency(neighborDue)} to {row.neighborName}. Our profit stays in this shop.
                    </p>
                    <ActionForm action={payNeighborFill} submit="Send the money to the next door shop" className="grid gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
                      <input type="hidden" name="id" value={row.id} />
                      <Input name="amount" type="number" defaultValue={neighborDue} required />
                      <Select name="method" defaultValue="CASH">
                        <option value="CASH">Cash</option>
                        <option value="TRANSFER">Transfer</option>
                        <option value="POS">POS</option>
                      </Select>
                    </ActionForm>
                  </div>
                ) : row.status === "SETTLED" ? (
                  <p className="mt-3 text-sm text-success">Next door paid. Profit {formatCurrency(row.profit)} stays with Abu Twins.</p>
                ) : null}
              </div>
            )
          })}
        </div>
        <div className="surface-card p-5">
          <h3 className="mb-2 font-semibold">Record a buy from next door</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            The buyer stays in this shop. You go next door, bring the unit, sell it here, then send next door their cost.
          </p>
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
