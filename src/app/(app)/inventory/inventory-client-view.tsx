"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Download, FileSpreadsheet, FileText, Search, Filter, AlertTriangle, ArrowUpDown, TrendingUp, Layers, DollarSign } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency, money } from "@/lib/utils"
import { lowStockLimit } from "@/lib/settings"

type Branch = { id: string; name: string; code: string }
type InventoryRow = {
  id: string
  productId: string
  branchId: string
  quantity: number
  incomingQty: number
  minStock: number
  product: {
    id: string
    name: string
    sku: string
    condition: string
    costPrice: number
    sellingPrice: number
    minimumPrice: number
    brand: { name: string }
    category: { name: string }
  }
  branch: {
    id: string
    name: string
    code: string
  }
}

type VaultCount = { productId: string; branchId: string; count: number }

export function InventoryClientView({
  rows,
  branches,
  vault,
  serializedIds,
  lowStockThreshold,
}: {
  rows: InventoryRow[]
  branches: Branch[]
  vault: VaultCount[]
  serializedIds: string[]
  lowStockThreshold: number
}) {
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL")
  const [search, setSearch] = useState<string>("")
  const [conditionFilter, setConditionFilter] = useState<string>("ALL")
  const serialized = useMemo(() => new Set(serializedIds), [serializedIds])

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (selectedBranch !== "ALL" && row.branchId !== selectedBranch) return false
      if (conditionFilter !== "ALL" && row.product.condition !== conditionFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchName = row.product.name.toLowerCase().includes(q)
        const matchSku = row.product.sku.toLowerCase().includes(q)
        const matchBrand = row.product.brand.name.toLowerCase().includes(q)
        const matchCategory = row.product.category?.name.toLowerCase().includes(q)
        if (!matchName && !matchSku && !matchBrand && !matchCategory) return false
      }
      return true
    })
  }, [rows, selectedBranch, conditionFilter, search])

  // Mismatches
  const gaps = useMemo(() => {
    return filteredRows
      .map((row) => {
        const imeis = vault.find((item) => item.productId === row.productId && item.branchId === row.branchId)?.count ?? 0
        return { row, imeis, delta: imeis - row.quantity }
      })
      .filter((item) => serialized.has(item.row.productId) && item.delta !== 0)
  }, [filteredRows, vault, serialized])

  // KPI calculations
  const totalUnits = useMemo(() => filteredRows.reduce((sum, r) => sum + r.quantity, 0), [filteredRows])
  const totalCostValue = useMemo(() => filteredRows.reduce((sum, r) => sum + r.quantity * money(r.product.costPrice), 0), [filteredRows])
  const totalSalesValue = useMemo(() => filteredRows.reduce((sum, r) => sum + r.quantity * money(r.product.sellingPrice), 0), [filteredRows])
  const totalPotentialProfit = totalSalesValue - totalCostValue
  const avgMarginPct = totalCostValue > 0 ? (totalPotentialProfit / totalCostValue) * 100 : 0
  const lowStockCount = useMemo(
    () => filteredRows.filter((r) => r.quantity <= lowStockLimit(r.minStock, lowStockThreshold)).length,
    [filteredRows, lowStockThreshold]
  )

  // CSV Export
  function exportCSV() {
    const headers = [
      "Product Name",
      "SKU",
      "Brand",
      "Category",
      "Condition",
      "Shop",
      "Cost Price (NGN)",
      "Selling Price (NGN)",
      "Profit Margin %",
      "In Shop Qty",
      "Coming Qty",
      "IMEIs in Shop",
      "Total Cost Value (NGN)",
      "Total Sales Value (NGN)",
      "Min Alert",
    ]

    const csvData = filteredRows.map((r) => {
      const cost = money(r.product.costPrice)
      const sell = money(r.product.sellingPrice)
      const margin = cost > 0 ? (((sell - cost) / cost) * 100).toFixed(1) : "0.0"
      const imeis = vault.find((item) => item.productId === r.productId && item.branchId === r.branchId)?.count ?? 0

      return [
        `"${r.product.name.replace(/"/g, '""')}"`,
        r.product.sku,
        r.product.brand.name,
        r.product.category?.name || "General",
        r.product.condition,
        r.branch.name,
        cost.toFixed(2),
        sell.toFixed(2),
        `${margin}%`,
        r.quantity,
        r.incomingQty,
        serialized.has(r.productId) ? imeis : "N/A",
        (r.quantity * cost).toFixed(2),
        (r.quantity * sell).toFixed(2),
        lowStockLimit(r.minStock, lowStockThreshold),
      ].join(",")
    })

    const csvContent = [headers.join(","), ...csvData].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `shop-stock-${selectedBranch}-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Print / PDF Export
  function printTable() {
    window.print()
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <div className="surface-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">Total Units in Stock</span>
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-1 text-2xl font-bold">{totalUnits.toLocaleString("en-NG")}</p>
          <p className="text-xs text-muted-foreground mt-1">Across {filteredRows.length} item line(s)</p>
        </div>

        <div className="surface-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">Total Stock Valuation (Cost)</span>
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{formatCurrency(totalCostValue)}</p>
          <p className="text-xs text-muted-foreground mt-1">Capital currently held in stock</p>
        </div>

        <div className="surface-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">Potential Sales Value</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCurrency(totalSalesValue)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Potential Profit: <strong className="text-foreground">{formatCurrency(totalPotentialProfit)}</strong>
          </p>
        </div>

        <div className="surface-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">Avg Profit Margin</span>
            <span className="text-xs font-bold text-primary">{avgMarginPct.toFixed(1)}%</span>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {lowStockCount > 0 ? (
              <span className="text-amber-600 dark:text-amber-400">{lowStockCount} low lines</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400">Stock healthy</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Alert threshold: {lowStockThreshold} units or fewer</p>
        </div>
      </div>

      {/* Mismatch Alert */}
      {gaps.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-500/10 dark:text-amber-100 print:hidden">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>{gaps.length} mismatch(es) detected between shop count and registered IMEI list:</span>
          </div>
          <ul className="mt-2 space-y-1 text-xs">
            {gaps.slice(0, 5).map((item) => (
              <li key={item.row.id}>
                <strong>{item.row.product.name}</strong> · {item.row.branch.name}: Shop count <strong>{item.row.quantity}</strong>, IMEIs recorded <strong>{item.imeis}</strong>
              </li>
            ))}
            {gaps.length > 5 && <li>...and {gaps.length - 5} more items</li>}
          </ul>
          <Link href="/reconciliation" className="mt-2 inline-block font-medium text-primary hover:underline text-xs">
            Proceed to Stock Count & Reconciliation →
          </Link>
        </div>
      )}

      {/* Filters & Export Bar */}
      <div className="surface-card p-4 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* Shop selector */}
            <div className="w-48">
              <Select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                <option value="ALL">All shops together</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </Select>
            </div>

            {/* Condition filter */}
            <div className="w-36">
              <Select value={conditionFilter} onChange={(e) => setConditionFilter(e.target.value)}>
                <option value="ALL">All conditions</option>
                <option value="BRAND_NEW">Brand New</option>
                <option value="UK_USED">UK Used</option>
                <option value="OPEN_BOX">Open Box</option>
                <option value="REFURBISHED">Refurbished</option>
              </Select>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search product, SKU, brand..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" />
              Export CSV / Excel
            </Button>
            <Button variant="outline" size="sm" onClick={printTable}>
              <FileText className="mr-1.5 h-4 w-4 text-primary" />
              Print / PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Main Stock Table */}
      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground bg-muted/40 text-xs uppercase tracking-wider">
              <tr className="border-b border-border">
                <th className="px-4 py-3">Product Name</th>
                <th className="px-3 py-3">Shop</th>
                <th className="px-3 py-3 text-right">Cost Price</th>
                <th className="px-3 py-3 text-right">Selling Price</th>
                <th className="px-3 py-3 text-right">Margin %</th>
                <th className="px-3 py-3 text-center">In Shop</th>
                <th className="px-3 py-3 text-center">Coming</th>
                <th className="px-3 py-3 text-center">IMEIs</th>
                <th className="px-4 py-3 text-right">Stock Valuation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredRows.map((row) => {
                const cost = money(row.product.costPrice)
                const selling = money(row.product.sellingPrice)
                const marginPct = cost > 0 ? ((selling - cost) / cost) * 100 : 0
                const imeis = vault.find((item) => item.productId === row.productId && item.branchId === row.branchId)?.count ?? 0
                const isSerialized = serialized.has(row.productId)
                const mismatch = isSerialized && imeis !== row.quantity
                const isLow = row.quantity <= lowStockLimit(row.minStock, lowStockThreshold)
                const totalCost = row.quantity * cost

                return (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">{row.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.product.brand.name} · {row.product.condition.replace(/_/g, " ")} · <span className="font-mono">{row.product.sku}</span>
                      </p>
                    </td>

                    <td className="px-3 py-3 font-medium">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">{row.branch.code}</span>
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums font-mono font-medium">
                      {formatCurrency(cost)}
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums font-mono font-semibold text-foreground">
                      {formatCurrency(selling)}
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${marginPct >= 20 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : marginPct > 0 ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"}`}>
                        {marginPct > 0 ? `+${marginPct.toFixed(1)}%` : `${marginPct.toFixed(1)}%`}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-center">
                      <Badge variant={isLow ? "danger" : "success"} className="tabular-nums font-bold">
                        {row.quantity}
                      </Badge>
                      {isLow && <span className="block text-[10px] text-rose-600 font-medium">Low stock</span>}
                    </td>

                    <td className="px-3 py-3 text-center">
                      {row.incomingQty > 0 ? (
                        <Badge variant="warning" className="tabular-nums">+{row.incomingQty}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-center">
                      {isSerialized ? (
                        <div>
                          <span className={`text-xs font-medium ${mismatch ? "text-amber-600 font-bold" : "text-muted-foreground"}`}>
                            {imeis}
                          </span>
                          {mismatch && (
                            <span className="block text-[10px] text-amber-700 font-semibold">Mismatch</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Pieces</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums font-mono font-bold text-foreground">
                      {formatCurrency(totalCost)}
                    </td>
                  </tr>
                )
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    No products found matching the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
