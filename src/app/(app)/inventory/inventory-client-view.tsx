"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Coins, FileSpreadsheet, Layers, Printer, Search, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { ShopTag, StatCard, StatGrid, TableEmpty, TableShell, TonePill, Toolbar } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { downloadTable } from "@/lib/download-table"
import { formatCurrency, money } from "@/lib/utils"
import { lowStockLimit } from "@/lib/stock-limits"

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
  const [selectedBranch, setSelectedBranch] = useState("ALL")
  const [conditionFilter, setConditionFilter] = useState("ALL")
  const [search, setSearch] = useState("")
  const serialized = useMemo(() => new Set(serializedIds), [serializedIds])

  const filtered = useMemo(() => {
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

  const pager = usePagedRows(filtered, `${selectedBranch}|${conditionFilter}|${search}`)

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
      ? "all locations"
      : branches.find((branch) => branch.id === selectedBranch)?.name ?? "this branch"

  /** Same rows, same order, same columns as the table on screen. */
  function tableRows() {
    return [
      [
        "Product Name",
        "SKU / Item Code",
        "Brand",
        "Category",
        "Condition",
        "Branch",
        "Cost Basis",
        "Retail Price",
        "Unit Margin",
        "Margin %",
        "On Hand",
        "In Transit",
        "Serialized Units",
        "Cost Valuation",
        "Retail Valuation",
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
          serialized.has(row.productId) ? String(imeis) : "Standard SKU",
          (row.quantity * cost).toFixed(2),
          (row.quantity * selling).toFixed(2),
        ]
      }),
    ]
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const fileBase = `inventory-ledger-${selectedBranch === "ALL" ? "all-branches" : selectedBranch}-${stamp}`

  return (
    <div className="space-y-5">
      <StatGrid className="print:hidden">
        <StatCard
          label="Total Units on Hand"
          value={totals.units.toLocaleString("en-NG")}
          hint={`${filtered.length} inventory SKU${filtered.length === 1 ? "" : "s"} in ${scopeLabel}`}
          icon={<Layers className="h-4 w-4" />}
        />
        <StatCard
          label="Inventory Valuation (Cost)"
          value={formatCurrency(totals.cost)}
          hint="Total inventory capital invested at baseline purchase cost."
          icon={<Coins className="h-4 w-4" />}
          tone="primary"
        />
        <StatCard
          label="Projected Retail Valuation"
          value={formatCurrency(totals.sales)}
          hint={`Projected gross profit: ${formatCurrency(totals.profit)}`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label="Weighted Margin %"
          value={`${totals.margin.toFixed(1)}%`}
          hint={
            totals.lowLines > 0
              ? `${totals.lowLines} SKU${totals.lowLines === 1 ? "" : "s"} below reorder threshold`
              : "All SKUs above reorder point"
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
              {gaps.length} SKU line${gaps.length === 1 ? "" : "s"} with serialized reconciliation variances
            </p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {gaps.slice(0, 4).map((item) => (
                <li key={item.row.id}>
                  {item.row.product.name} · {item.row.branch.name}: Ledger Qty: {item.row.quantity}, Serialized Registry:{" "}
                  {item.imeis}
                </li>
              ))}
              {gaps.length > 4 ? <li>and {gaps.length - 4} more</li> : null}
            </ul>
            <Link href="/reconciliation" className="mt-1.5 inline-block text-xs font-semibold underline">
              Initiate Physical Inventory Audit & Cycle Count
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
            <option value="ALL">All Branches</option>
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
            <option value="ALL">All Conditions</option>
            <option value="BRAND_NEW">Brand New</option>
            <option value="UK_USED">Pre-Owned (Grade A / UK)</option>
            <option value="OPEN_BOX">Open Box</option>
            <option value="REFURBISHED">Refurbished / Certified</option>
          </Select>
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by SKU, product name, or brand..."
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

      <TableShell
        columns={[
          { label: "Product / Description" },
          { label: "Branch" },
          { label: "Cost Basis", align: "right" },
          { label: "Retail Price", align: "right" },
          { label: "Margin", align: "right" },
          { label: "On Hand", align: "center" },
          { label: "In Transit", align: "center" },
          { label: "Serialized", align: "center" },
          { label: "Cost Valuation", align: "right" },
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
            noun="inventory records"
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
                  {row.product.brand.name} · {row.product.condition.replace(/_/g, " ").toLowerCase()} ·{" "}
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
                {isLow ? <p className="text-[11px] font-medium text-danger">Below Min</p> : null}
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
                    {mismatch ? <p className="text-[11px] font-medium text-warning">Variance</p> : null}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Standard</span>
                )}
              </td>
              <td className="text-right num font-semibold">{formatCurrency(row.quantity * cost)}</td>
            </tr>
          )
        })}
        {filtered.length === 0 ? (
          <TableEmpty colSpan={9}>No inventory records match the selected branch, condition, or search filter.</TableEmpty>
        ) : null}
      </TableShell>
    </div>
  )
}
