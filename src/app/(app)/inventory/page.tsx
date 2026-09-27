import { getInStockImeiCounts, getInventory, getSerializedProductIds } from "@/app/actions/imei"
import { getBranches } from "@/app/actions/parties"
import { PageHeader } from "@/components/shared"
import { getAppSettings } from "@/lib/settings"
import { canSeeCost } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { money } from "@/lib/utils"
import { InventoryClientView } from "./inventory-client-view"
import { CachePageData } from "@/components/cache-page-data"

export default async function InventoryPage() {
  // Cost never leaves the server for anyone but the CEO, not even into the
  // offline copy this page keeps on the phone.
  const showCost = canSeeCost((await requireUser()).role)
  const [rows, settings, vault, serializedIds, branches] = await Promise.all([
    getInventory(),
    getAppSettings(),
    getInStockImeiCounts(),
    getSerializedProductIds(),
    getBranches(),
  ])

  const activeBranches = branches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name, code: b.code }))

  const formattedRows = rows.map((row) => ({
    id: row.id,
    productId: row.productId,
    branchId: row.branchId,
    quantity: row.quantity,
    incomingQty: row.incomingQty,
    minStock: row.minStock,
    product: {
      id: row.product.id,
      name: row.product.name,
      sku: row.product.sku,
      condition: row.product.condition,
      costPrice: showCost ? money(row.product.costPrice) : 0,
      sellingPrice: money(row.product.sellingPrice),
      minimumPrice: money(row.product.minimumPrice),
      brand: { name: row.product.brand.name },
      category: { name: row.product.category?.name || "General" },
    },
    branch: {
      id: row.branch.id,
      name: row.branch.name,
      code: row.branch.code,
    },
  }))

  return (
    <div className="space-y-6">
      <CachePageData pageKey="inventory" title="Shop stock" data={formattedRows} />
      <PageHeader
        title="Shop stock"
        description={showCost ? "On the shelf now, at cost and sell price." : "On the shelf now, at sell price."}
      />

      <InventoryClientView
        rows={formattedRows}
        branches={activeBranches}
        vault={vault}
        serializedIds={serializedIds}
        lowStockThreshold={settings.lowStockThreshold}
        showCost={showCost}
      />
    </div>
  )
}

