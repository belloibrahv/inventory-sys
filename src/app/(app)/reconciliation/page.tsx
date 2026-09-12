import { getInStockImeiCounts, getInventory } from "@/app/actions/imei"
import { getReconciliations } from "@/app/actions/finance"
import { getBranches } from "@/app/actions/parties"
import { getPosLookups } from "@/app/actions/sales"
import { PageHeader, StatusBadge } from "@/components/shared"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import { StockCountView } from "./stock-count-view"

export default async function ReconciliationPage() {
  const [rows, inventory, branches, vault, lookups] = await Promise.all([
    getReconciliations(),
    getInventory(),
    getBranches(),
    getInStockImeiCounts(),
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
        title="Stock count & reconciliation"
        description="Perform comprehensive physical stock audit. Input counted quantities, view unit costs, track gain/loss margins, and download paper sheets for manager approval."
      />

      {/* Stock count form and table */}
      <StockCountView
        branches={activeBranches}
        inventory={formattedInventory}
        vault={vault}
        defaultBranchId={lookups.branchId}
      />

      {/* Past Stock Count Reports */}
      <div className="space-y-4 print:hidden">
        <h3 className="text-lg font-bold">Past Stock Count Audits & Reconciliations</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => {
            const expVal = money(row.totalExpected)
            const cntVal = money(row.totalCounted)
            const varVal = money(row.variance)

            return (
              <div key={row.id} className="surface-card p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div>
                    <p className="font-semibold">{row.branch.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(row.createdAt)} · Audited by {row.user.name}</p>
                  </div>
                  <StatusBadge value={row.status} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block uppercase">Expected</span>
                    <strong className="font-mono">{formatCurrency(expVal)}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block uppercase">Counted</span>
                    <strong className="font-mono">{formatCurrency(cntVal)}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block uppercase">Net Variance</span>
                    <strong className={`font-mono ${varVal > 0 ? "text-emerald-600 dark:text-emerald-400" : varVal < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
                      {varVal > 0 ? `+${formatCurrency(varVal)}` : formatCurrency(varVal)}
                    </strong>
                  </div>
                </div>

                {row.notes && <p className="text-xs bg-muted/40 p-2 rounded-lg text-muted-foreground">{row.notes}</p>}

                {/* Discrepancy lines */}
                <div className="space-y-1 text-xs">
                  {row.items.filter((item) => item.variance !== 0).map((item) => (
                    <div key={item.id} className="flex justify-between py-1 border-b border-border/40">
                      <span>{item.product.name}</span>
                      <span className="font-mono font-medium">
                        {item.expectedQty} → {item.countedQty} ({item.variance > 0 ? `+${item.variance}` : item.variance})
                      </span>
                    </div>
                  ))}
                  {row.items.every((item) => item.variance === 0) && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ 100% matched system count</p>
                  )}
                </div>
              </div>
            )
          })}

          {rows.length === 0 && (
            <div className="surface-card p-6 text-sm text-muted-foreground col-span-2 text-center">
              No stock counts have been filed yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

