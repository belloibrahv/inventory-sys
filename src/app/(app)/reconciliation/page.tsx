import { getInStockImeiCounts, getInventory } from "@/app/actions/imei"
import { getReconciliations } from "@/app/actions/finance"
import { getBranches } from "@/app/actions/parties"
import { getPosLookups } from "@/app/actions/sales"
import { PageHeader, StatusBadge } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { formatCurrency, money } from "@/lib/utils"
import { CountForm } from "./count-form"

export default async function ReconciliationPage() {
  const [rows, inventory, branches, vault, lookups] = await Promise.all([
    getReconciliations(),
    getInventory(),
    getBranches(),
    getInStockImeiCounts(),
    getPosLookups(),
  ])
  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div>
        <PageHeader title="Stock count" description="Count one shop. The number on the shelf should match the IMEI list. If they differ, a manager must approve before stock numbers change." />
        <WorkflowSteps current={0} steps={["Count", "See difference", "Manager approves", "Numbers match"]} />
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="surface-card p-5">
              <div className="flex justify-between">
                <p className="font-semibold">{row.branch.name}</p>
                <StatusBadge value={row.status} />
              </div>
              <p className="mt-2 text-sm">
                Expected {formatCurrency(money(row.totalExpected))} · Counted {formatCurrency(money(row.totalCounted))} · Variance {formatCurrency(money(row.variance))}
              </p>
              {row.notes ? <p className="text-xs text-muted-foreground">{row.notes}</p> : null}
              <div className="mt-3 space-y-1 text-xs">
                {row.items.filter((item) => item.variance !== 0).map((item) => (
                  <p key={item.id}>
                    {item.product.name}: book {item.expectedQty} → counted {item.countedQty} ({item.variance > 0 ? "+" : ""}{item.variance})
                  </p>
                ))}
                {row.items.every((item) => item.variance === 0) ? (
                  <p className="text-muted-foreground">No line variance on this count.</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Start stock count</h3>
        <CountForm
          branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
          inventory={inventory.map((row) => ({
            id: row.id,
            productId: row.productId,
            branchId: row.branchId,
            quantity: row.quantity,
            product: { name: row.product.name },
            branch: { code: row.branch.code },
          }))}
          vault={vault}
          defaultBranchId={lookups.branchId}
        />
      </div>
    </div>
  )
}
