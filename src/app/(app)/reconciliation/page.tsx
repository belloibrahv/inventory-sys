import { getInventory } from "@/app/actions/imei"
import { getReconciliations } from "@/app/actions/finance"
import { getBranches } from "@/app/actions/parties"
import { getPosLookups } from "@/app/actions/sales"
import { EmptyState, PageHeader, StatusBadge } from "@/components/shared"
import { letterheadFromSettings } from "@/lib/letterhead"
import { getAppSettings } from "@/lib/settings"
import { canSeeCost } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import { StockCountView } from "./stock-count-view"

export default async function ReconciliationPage() {
  // Counts are valued at cost for the CEO and at sell price for everyone else.
  const atCost = canSeeCost((await requireUser()).role)
  const [rows, inventory, branches, lookups, settings] = await Promise.all([
    getReconciliations(),
    getInventory(),
    getBranches(),
    getPosLookups(),
    getAppSettings(),
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
      costPrice: money(atCost ? row.product.costPrice : row.product.sellingPrice),
      brand: { name: row.product.brand.name },
      category: row.product.category ? { name: row.product.category.name } : null,
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
        description="Count the shelf. A manager must say yes before numbers change."
      />

      {/* Stock count form and table */}
      <StockCountView
        branches={activeBranches}
        inventory={formattedInventory}
        defaultBranchId={lookups.branchId}
        brand={letterheadFromSettings(settings)}
        atCost={atCost}
      />

      {/* Past Stock Count Reports */}
      <div className="space-y-4 print:hidden">
        <h2 className="text-sm font-semibold tracking-tight">Past stock counts</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => {
            // Saved counts carry their totals at cost; everyone but the CEO sees pieces.
            const expected = atCost ? money(row.totalExpected) : row.items.reduce((sum, item) => sum + item.expectedQty, 0)
            const counted = atCost ? money(row.totalCounted) : row.items.reduce((sum, item) => sum + item.countedQty, 0)
            const variance = atCost ? money(row.variance) : counted - expected
            const show = (value: number) => (atCost ? formatCurrency(value) : `${value.toLocaleString("en-NG")} pcs`)
            const offLines = row.items.filter((item) => item.variance !== 0)

            return (
              <div key={row.id} className="surface-card space-y-3 p-5">
                <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <p className="font-medium">{row.branch.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(row.createdAt)} · Counted by {row.user.name}
                    </p>
                  </div>
                  <StatusBadge value={row.status} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="eyebrow">On the system</p>
                    <p className="num font-medium">{show(expected)}</p>
                  </div>
                  <div>
                    <p className="eyebrow">Counted</p>
                    <p className="num font-medium">{show(counted)}</p>
                  </div>
                  <div>
                    <p className="eyebrow">Difference</p>
                    <p className={`num font-semibold ${variance > 0 ? "text-success" : variance < 0 ? "text-danger" : ""}`}>
                      {variance > 0 ? `+${show(variance)}` : show(variance)}
                    </p>
                  </div>
                </div>

                {row.notes ? (
                  <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">{row.notes}</p>
                ) : null}

                <div className="space-y-1 text-xs">
                  {offLines.map((item) => (
                    <div key={item.id} className="flex justify-between gap-3 border-b border-border/50 py-1">
                      <span className="min-w-0 whitespace-normal break-words">{item.product.name}</span>
                      <span className="num shrink-0 font-medium">
                        {item.expectedQty} → {item.countedQty} ({item.variance > 0 ? `+${item.variance}` : item.variance})
                      </span>
                    </div>
                  ))}
                  {offLines.length === 0 ? (
                    <p className="font-medium text-success">Count matches the system.</p>
                  ) : null}
                </div>
              </div>
            )
          })}

          {rows.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState
                title="No stock counts yet"
                hint="Count a shop above. Past counts show here."
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

