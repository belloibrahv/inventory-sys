import { getInStockImeiCounts, getInventory, getSerializedProductIds } from "@/app/actions/imei"
import { getBranches } from "@/app/actions/parties"
import { PageHeader } from "@/components/shared"
import { getAppSettings } from "@/lib/settings"
import { money } from "@/lib/utils"
import { InventoryClientView } from "./inventory-client-view"

export default async function InventoryPage() {
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
      costPrice: money(row.product.costPrice),
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
      <PageHeader
        title="Shop stock"
        description="Live stock inventory across shops. View cost prices, selling prices, profit margins, and export reports to CSV or Excel."
      />

      <InventoryClientView
        rows={formattedRows}
        branches={activeBranches}
        vault={vault}
        serializedIds={serializedIds}
        lowStockThreshold={settings.lowStockThreshold}
      />
    </div>
  )
}

