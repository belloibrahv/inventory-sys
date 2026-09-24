"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Coins, FileSpreadsheet, Layers, Printer, Search, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { FilterChips } from "@/components/filter-chips"
import { ShopTag, StatCard, StatGrid, TableEmpty, TableShell, TonePill, Toolbar } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { downloadTable } from "@/lib/download-table"
import { formatCurrency, money } from "@/lib/utils"
import { lowStockLimit } from "@/lib/stock-limits"
import { formatCondition } from "@/lib/status"
import { SHOP_CONDITION_OPTIONS } from "@/lib/conditions"
import { countByStockCategory, matchesStockCategory, STOCK_CATEGORY_FILTERS } from "@/lib/stock-categories"

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
  branch: { id: string; name: string; code: string }
}

type VaultCount = { productId: string; branchId: string; count: number }

/** Mark-up on cost, which is what the shop actually reasons in. */
function marginPct(cost: number, selling: number) {
  return cost > 0 ? ((selling - cost) / cost) * 100 : 0
}

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
  const [selectedBranch, setSelectedBranch] = useState(branches.length === 1 ? branches[0].id : "ALL")
  const [conditionFilter, setConditionFilter] = useState("ALL")
  const [categoryFilter, setCategoryFilter] = useState("ALL")
  const [search, setSearch] = useState("")
  const serialized = useMemo(() => new Set(serializedIds), [serializedIds])

  const scoped = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (selectedBranch !== "ALL" && row.branchId !== selectedBranch) return false
      if (conditionFilter !== "ALL" && row.product.condition !== conditionFilter) return false
      if (!query) return true
      return (
        row.product.name.toLowerCase().includes(query) ||
        row.product.sku.toLowerCase().includes(query) ||
        row.product.brand.name.toLowerCase().includes(query) ||
        row.product.category.name.toLowerCase().includes(query)
      )
    })
  }, [rows, selectedBranch, conditionFilter, search])

  /**
   * Counts per fixed category group (Phones, Accessories, Screen, Laptop,
   * Other) — same buckets used on the opening stock page.
   */
  const categoryCounts = useMemo(
    () => countByStockCategory(scoped.map((row) => ({ category: row.product.category.name }))),
    [scoped]
  )

  // A chip only shows while its group has stock behind it. Switching shop can
  // empty the chosen group, which would leave an empty table under a chip that
  // is no longer on screen, so the filter falls back to All.
  useEffect(() => {
    if (categoryFilter === "ALL") return
    if ((categoryCounts[categoryFilter] ?? 0) === 0) setCategoryFilter("ALL")
  }, [categoryCounts, categoryFilter])

  const filtered = useMemo(
    () =>
      scoped.filter((row) => matchesStockCategory(row.product.category.name, categoryFilter)),
    [scoped, categoryFilter]
  )

  const pager = usePagedRows(filtered, `${selectedBranch}|${conditionFilter}|${categoryFilter}|${search}`)

  const imeiFor = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of vault) map.set(`${item.productId}:${item.branchId}`, item.count)
    return map
  }, [vault])

  const gaps = useMemo(
    () =>
      filtered
        .map((row) => ({ row, imeis: imeiFor.get(`${row.productId}:${row.branchId}`) ?? 0 }))
        .filter((item) => serialized.has(item.row.productId) && item.imeis !== item.row.quantity),
    [filtered, imeiFor, serialized]
  )

  const totals = useMemo(() => {
    const units = filtered.reduce((sum, row) => sum + row.quantity, 0)
    const cost = filtered.reduce((sum, row) => sum + row.quantity * money(row.product.costPrice), 0)
    const sales = filtered.reduce((sum, row) => sum + row.quantity * money(row.product.sellingPrice), 0)
    const lowLines = filtered.filter((row) => row.quantity <= lowStockLimit(row.minStock, lowStockThreshold)).length
    return { units, cost, sales, profit: sales - cost, margin: cost > 0 ? ((sales - cost) / cost) * 100 : 0, lowLines }
  }, [filtered, lowStockThreshold])

  const scopeLabel =
    selectedBranch === "ALL"
      ? "all shops"
      : branches.find((branch) => branch.id === selectedBranch)?.name ?? "this shop"

  /** Same rows, same order, same columns as the table on screen. */
  function tableRows() {
    return [
      [
        "Product name",
        "Item code",
        "Brand",
        "Category",
        "How it looks",
        "Shop",
        "Cost",
        "Sell price",
        "Profit per unit",
        "Profit %",
        "On shelf",
        "On the way",
        "IMEI count",
        "Value at cost",
        "Value at sell price",
      ],
      ...filtered.map((row) => {
        const cost = money(row.product.costPrice)
        const selling = money(row.product.sellingPrice)
        const imeis = imeiFor.get(`${row.productId}:${row.branchId}`) ?? 0
        return [
          row.product.name,
          row.product.sku,
          row.product.brand.name,
          row.product.category.name,
          row.product.condition.replace(/_/g, " "),
          `${row.branch.name} (${row.branch.code})`,
          cost.toFixed(2),
          selling.toFixed(2),
          (selling - cost).toFixed(2),
          `${marginPct(cost, selling).toFixed(1)}%`,
          String(row.quantity),
          String(row.incomingQty),
          serialized.has(row.productId) ? String(imeis) : "No IMEI",
          (row.quantity * cost).toFixed(2),
          (row.quantity * selling).toFixed(2),
        ]
      }),
    ]
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const categorySlug =
    categoryFilter === "ALL"
      ? ""
      : `-${(STOCK_CATEGORY_FILTERS.find((r) => r.key === categoryFilter)?.label ?? categoryFilter).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
  const fileBase = `inventory-ledger-${selectedBranch === "ALL" ? "all-branches" : selectedBranch}${categorySlug}-${stamp}`

  return (
    <div className="space-y-5">
      <StatGrid className="print:hidden">
        <StatCard
          label="Units on the shelf"
          value={totals.units.toLocaleString("en-NG")}
          hint={`${filtered.length} item${filtered.length === 1 ? "" : "s"} in ${scopeLabel}`}
          icon={<Layers className="h-4 w-4" />}
        />
        <StatCard
          label="Value at cost"
          value={formatCurrency(totals.cost)}
          hint="What the phones and items on the shelf cost you."
          icon={<Coins className="h-4 w-4" />}
          tone="primary"
        />
        <StatCard
          label="Value at sell price"
          value={formatCurrency(totals.sales)}
          hint={`If every unit sold at list price: ${formatCurrency(totals.profit)} profit`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label="Profit %"
          value={`${totals.margin.toFixed(1)}%`}
          hint={
            totals.lowLines > 0
              ? `${totals.lowLines} item${totals.lowLines === 1 ? "" : "s"} below the low-stock warning`
              : "Every item is above the low-stock warning"
          }
          tone={totals.lowLines > 0 ? "warning" : "neutral"}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </StatGrid>

      {gaps.length > 0 ? (
        <div className="flex flex-wrap items-start gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning print:hidden">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {gaps.length} item${gaps.length === 1 ? "" : "s"} where shop count and IMEI list do not match
            </p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {gaps.slice(0, 4).map((item) => (
                <li key={item.row.id}>
                  {item.row.product.name} · {item.row.branch.name}: shelf {item.row.quantity}, IMEIs{" "}
                  {item.imeis}
                </li>
              ))}
              {gaps.length > 4 ? <li>and {gaps.length - 4} more</li> : null}
            </ul>
            <Link href="/reconciliation" className="mt-1.5 inline-block text-xs font-semibold underline">
              Open Stock count
            </Link>
          </div>
        </div>
      ) : null}

      {/*
        The client did not want the whole group shown at once: "we should be the
        one controlling what we want to view ... it would reduce the time we
        waste sorting out which shop has what."
      */}
      <Toolbar className="justify-between print:hidden">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)} className="h-9 w-52">
            <option value="ALL">All shops</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name} ({branch.code})
              </option>
            ))}
          </Select>
          <Select
            value={conditionFilter}
            onChange={(event) => setConditionFilter(event.target.value)}
            className="h-9 w-44"
          >
            <option value="ALL">How the phone looks: all</option>
            {SHOP_CONDITION_OPTIONS.map((row) => (
              <option key={row.value} value={row.value}>
                {row.label}
              </option>
            ))}
          </Select>
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Find item code, name, or brand"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 pl-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadTable(tableRows(), `${fileBase}.csv`, "csv")}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadTable(tableRows(), `${fileBase}.xlsx`, "xlsx")}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </Toolbar>

      <FilterChips
        label="Show by category"
        className="print:hidden"
        activeKey={categoryFilter}
        onSelect={setCategoryFilter}
        chips={STOCK_CATEGORY_FILTERS.filter(
          (row) => row.key === "ALL" || (categoryCounts[row.key] ?? 0) > 0
        ).map((row) => ({
          key: row.key,
          label: row.label,
          count: categoryCounts[row.key] ?? 0,
        }))}
      />

      <TableShell
        columns={[
          { label: "Item" },
          { label: "Shop" },
          { label: "Cost", align: "right" },
          { label: "Sell price", align: "right" },
          { label: "Profit", align: "right" },
          { label: "On shelf", align: "center" },
          { label: "On the way", align: "center" },
          { label: "IMEIs", align: "center" },
          { label: "Value at cost", align: "right" },
        ]}
        footer={
          <TablePager
            page={pager.page}
            pageCount={pager.pageCount}
            pageSize={pager.pageSize}
            total={pager.total}
            start={pager.start}
            end={pager.end}
            onPageChange={pager.setPage}
            onPageSizeChange={pager.setPageSize}
            noun="items"
          />
        }
      >
        {pager.pageRows.map((row) => {
          const cost = money(row.product.costPrice)
          const selling = money(row.product.sellingPrice)
          const margin = marginPct(cost, selling)
          const imeis = imeiFor.get(`${row.productId}:${row.branchId}`) ?? 0
          const isSerialized = serialized.has(row.productId)
          const mismatch = isSerialized && imeis !== row.quantity
          const isLow = row.quantity <= lowStockLimit(row.minStock, lowStockThreshold)

          return (
            <tr key={row.id}>
              <td>
                <p className="font-medium">{row.product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.product.brand.name} · {formatCondition(row.product.condition)} ·{" "}
                  <span className="font-mono">{row.product.sku}</span>
                </p>
              </td>
              <td>
                <ShopTag>{row.branch.code}</ShopTag>
              </td>
              <td className="text-right num">{formatCurrency(cost)}</td>
              <td className="text-right num font-medium">{formatCurrency(selling)}</td>
              <td className="text-right">
                <TonePill tone={margin >= 20 ? "success" : margin > 0 ? "warning" : "danger"}>
                  {margin > 0 ? "+" : ""}
                  {margin.toFixed(1)}%
                </TonePill>
              </td>
              <td className="text-center">
                <span className={`num font-semibold ${isLow ? "text-danger" : "text-foreground"}`}>{row.quantity}</span>
                {isLow ? <p className="text-[11px] font-medium text-danger">Low stock</p> : null}
              </td>
              <td className="text-center num text-muted-foreground">
                {row.incomingQty > 0 ? `+${row.incomingQty}` : "—"}
              </td>
              <td className="text-center">
                {isSerialized ? (
                  <>
                    <span className={`num text-sm ${mismatch ? "font-semibold text-warning" : "text-muted-foreground"}`}>
                      {imeis}
                    </span>
                    {mismatch ? <p className="text-[11px] font-medium text-warning">Does not match</p> : null}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">No IMEI</span>
                )}
              </td>
              <td className="text-right num font-semibold">{formatCurrency(row.quantity * cost)}</td>
            </tr>
          )
        })}
        {filtered.length === 0 ? (
          <TableEmpty colSpan={9}>No items match this shop, how the phone looks, or the search.</TableEmpty>
        ) : null}
      </TableShell>
    </div>
  )
}
