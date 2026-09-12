import { getInventory } from "@/app/actions/imei"
import { getReconciliations } from "@/app/actions/finance"
import { getBranches } from "@/app/actions/parties"
import { getPosLookups } from "@/app/actions/sales"
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import { StockCountView } from "./stock-count-view"

export default async function ReconciliationPage() {
  const [rows, inventory, branches, lookups] = await Promise.all([
    getReconciliations(),
    getInventory(),
    getBranches(),
    getPosLookups(),
  ])

  const activeBranches = branches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name, code: b.code }))

  const formattedInventory = inventory.map((row) => ({
    id: row.id,
    productId: row.productId,
    branchId: row.branchId,
    quantity: row.quantity,
    product: {
      id: row.product.id,
      name: row.product.name,
      sku: row.product.sku,
      costPrice: money(row.product.costPrice),
      brand: { name: row.product.brand.name },
    },
    branch: {
      id: row.branch.id,
      name: row.branch.name,
      code: row.branch.code,
    },
  }))

  return (
    <div className="space-y-8">
      <PageHeader
        title="Stock count"
        description="Count the shelf against what the system believes. Type what you physically counted and the gaining or losing margin is worked out per item, at cost. Download or print the sheet for whoever has to approve it."
      />

      {/* Stock count form and table */}
      <StockCountView branches={activeBranches} inventory={formattedInventory} defaultBranchId={lookups.branchId} />

      {/* Past Stock Count Reports */}
      <div className="space-y-4 print:hidden">
        <h2 className="text-sm font-semibold tracking-tight">Counts already filed</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => {
            const expected = money(row.totalExpected)
            const counted = money(row.totalCounted)
            const variance = money(row.variance)
            const offLines = row.items.filter((item) => item.variance !== 0)

            return (
              <div key={row.id} className="surface-card space-y-3 p-5">
                <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <p className="font-medium">{row.branch.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(row.createdAt)} · counted by {row.user.name}
                    </p>
                  </div>
                  <StatusBadge value={row.status} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="eyebrow">System said</p>
                    <p className="num font-medium">{formatCurrency(expected)}</p>
                  </div>
                  <div>
                    <p className="eyebrow">They counted</p>
                    <p className="num font-medium">{formatCurrency(counted)}</p>
                  </div>
                  <div>
                    <p className="eyebrow">Gain or loss</p>
                    <p className={`num font-semibold ${variance > 0 ? "text-success" : variance < 0 ? "text-danger" : ""}`}>
                      {variance > 0 ? `+${formatCurrency(variance)}` : formatCurrency(variance)}
                    </p>
                  </div>
                </div>

                {row.notes ? (
                  <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">{row.notes}</p>
                ) : null}

                <div className="space-y-1 text-xs">
                  {offLines.map((item) => (
                    <div key={item.id} className="flex justify-between gap-3 border-b border-border/50 py-1">
                      <span className="min-w-0 truncate">{item.product.name}</span>
                      <span className="num shrink-0 font-medium">
                        {item.expectedQty} → {item.countedQty} ({item.variance > 0 ? `+${item.variance}` : item.variance})
                      </span>
                    </div>
                  ))}
                  {offLines.length === 0 ? (
                    <p className="font-medium text-success">Every line matched the system.</p>
                  ) : null}
                </div>
              </div>
            )
          })}

          {rows.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState
                title="No stock count has been filed yet"
                hint="Count a shop above and send it for approval. Filed counts, and what they gained or lost, appear here."
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

