import Link from "next/link"
import { getInStockImeiCounts, getInventory, getSerializedProductIds } from "@/app/actions/imei"
import { PageHeader } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { getAppSettings, lowStockLimit } from "@/lib/settings"
import { formatCurrency, money } from "@/lib/utils"

export default async function InventoryPage() {
  const [rows, settings, vault, serializedIds] = await Promise.all([
    getInventory(),
    getAppSettings(),
    getInStockImeiCounts(),
    getSerializedProductIds(),
  ])
  const serialized = new Set(serializedIds)
  const value = rows.reduce((sum, row) => sum + row.quantity * money(row.product.costPrice), 0)
  const gaps = rows
    .map((row) => {
      const imeis = vault.find((item) => item.productId === row.productId && item.branchId === row.branchId)?.count ?? 0
      return { row, imeis, delta: imeis - row.quantity }
    })
    .filter((item) => serialized.has(item.row.productId) && item.delta !== 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description={`Each shop keeps its own stock. Cost value now ${formatCurrency(value)}. You get an alert when a shop has ${settings.lowStockThreshold} units or fewer.`}
      />
      {gaps.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-medium">{gaps.length} mismatch{gaps.length === 1 ? "" : "es"} between shop count and IMEI list. Do a stock count — do not change numbers here.</p>
          <ul className="mt-2 space-y-1">
            {gaps.map((item) => (
              <li key={item.row.id}>
                {item.row.product.name} · {item.row.branch.code}: shop count {item.row.quantity}, IMEIs {item.imeis}
              </li>
            ))}
          </ul>
          <Link href="/reconciliation" className="mt-2 inline-block font-medium text-primary">Go to stock count</Link>
        </div>
      ) : null}
      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Shop</th>
              <th className="px-4 py-3">On hand</th>
              <th className="px-4 py-3">IMEIs listed</th>
              <th className="px-4 py-3">Min</th>
              <th className="px-4 py-3">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const imeis = vault.find((item) => item.productId === row.productId && item.branchId === row.branchId)?.count ?? 0
              const mismatch = serialized.has(row.productId) && imeis !== row.quantity
              return (
                <tr key={row.id} className="border-b border-border/70">
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.product.name}</p>
                    <p className="text-xs text-muted-foreground">{row.product.brand.name} · {row.product.condition}</p>
                  </td>
                  <td className="px-4 py-3">{row.branch.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant={row.quantity <= lowStockLimit(row.minStock, settings.lowStockThreshold) ? "danger" : "success"}>{row.quantity}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {serialized.has(row.productId) ? imeis : "—"}
                    {mismatch ? <span className="block text-xs text-amber-700">Does not match shop count</span> : null}
                  </td>
                  <td className="px-4 py-3">{lowStockLimit(row.minStock, settings.lowStockThreshold)}</td>
                  <td className="px-4 py-3">{formatCurrency(row.quantity * money(row.product.costPrice))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
