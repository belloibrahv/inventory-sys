"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, FileSpreadsheet, Loader2, Printer, Scale, Send, TrendingDown, TrendingUp } from "lucide-react"
import { toast } from "sonner"
import { startReconciliation } from "@/app/actions/finance"
import { DocumentLetterhead } from "@/components/document-letterhead"
import { FilterChips } from "@/components/filter-chips"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { StatCard, StatGrid, TableEmpty, TableShell, TonePill, Toolbar } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { downloadTable } from "@/lib/download-table"
import type { LetterheadBrand } from "@/lib/letterhead"
import { countByStockCategory, matchesStockCategory, STOCK_CATEGORY_FILTERS } from "@/lib/stock-categories"
import { formatCurrency, money } from "@/lib/utils"

type Branch = { id: string; name: string; code?: string }
type StockItem = {
  id: string
  productId: string
  branchId: string
  quantity: number
  product: {
    id: string
    name: string
    sku: string
    costPrice: number
    brand?: { name: string }
    category?: { name: string } | null
  }
  branch: { id: string; name: string; code: string }
}

export function StockCountView({
  branches,
  inventory,
  defaultBranchId,
  brand,
}: {
  branches: Branch[]
  inventory: StockItem[]
  defaultBranchId?: string | null
  brand: LetterheadBrand
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || "")
  const [notes, setNotes] = useState("")
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("ALL")

  const shopRows = useMemo(() => inventory.filter((row) => row.branchId === branchId), [inventory, branchId])

  const categoryCounts = useMemo(
    () => countByStockCategory(shopRows.map((row) => ({ category: row.product.category?.name }))),
    [shopRows]
  )

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return shopRows.filter((row) => {
      if (!matchesStockCategory(row.product.category?.name, categoryFilter)) return false
      if (!needle) return true
      return [row.product.name, row.product.sku, row.product.brand?.name, row.product.category?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    })
  }, [shopRows, categoryFilter, query])

  const pager = usePagedRows(rows, `${branchId}|${categoryFilter}|${query}`)
  const selectedBranch = useMemo(() => branches.find((branch) => branch.id === branchId), [branches, branchId])

  /** What the system believes, until someone types over it. */
  function countFor(productId: string, systemQty: number) {
    return counts[productId] ?? systemQty
  }

  function setCount(productId: string, value: number) {
    setCounts((prev) => ({ ...prev, [productId]: Math.max(0, Math.floor(value) || 0) }))
  }

  /*
    The client's framing: "where the system says we have 10 products and we are
    seeing 11, that should be a gaining margin ... where the system says we are
    having 9 and we are counting 8, that is a losing margin."
  */
  const summary = useMemo(() => {
    let systemQty = 0
    let countedQty = 0
    let systemValue = 0
    let countedValue = 0
    let gainedUnits = 0
    let lostUnits = 0
    let gainedValue = 0
    let lostValue = 0

    for (const row of rows) {
      const expected = row.quantity
      const counted = countFor(row.productId, expected)
      const cost = money(row.product.costPrice)
      const diff = counted - expected

      systemQty += expected
      countedQty += counted
      systemValue += expected * cost
      countedValue += counted * cost

      if (diff > 0) {
        gainedUnits += diff
        gainedValue += diff * cost
      } else if (diff < 0) {
        lostUnits += -diff
        lostValue += -diff * cost
      }
    }

    return {
      systemQty,
      countedQty,
      systemValue,
      countedValue,
      gainedUnits,
      lostUnits,
      gainedValue,
      lostValue,
      netValue: countedValue - systemValue,
      netUnits: countedQty - systemQty,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, counts])

  function sheetRows() {
    return [
      [
        "Item name",
        "Item code",
        "Category",
        "Shop",
        "Cost",
        "System count",
        "Hand count",
        "Difference",
        "Difference value",
        "Match",
      ],
      ...rows.map((row) => {
        const expected = row.quantity
        const counted = countFor(row.productId, expected)
        const cost = money(row.product.costPrice)
        const diff = counted - expected
        return [
          row.product.name,
          row.product.sku,
          row.product.category?.name ?? "",
          row.branch.name,
          cost.toFixed(2),
          String(expected),
          String(counted),
          diff > 0 ? `+${diff}` : String(diff),
          (diff * cost).toFixed(2),
          diff > 0 ? "Extra" : diff < 0 ? "Short" : "Match",
        ]
      }),
      [],
      ["On the system", summary.systemValue.toFixed(2)],
      ["Counted on the shelf", summary.countedValue.toFixed(2)],
      ["Difference", summary.netValue.toFixed(2)],
    ]
  }

  const fileBase = `stock-count-${selectedBranch?.name?.replace(/\s+/g, "-").toLowerCase() ?? branchId}-${new Date()
    .toISOString()
    .slice(0, 10)}`

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)

    // Always send every item for this shop so a category filter cannot drop uncounted lines.
    const formData = new FormData()
    formData.set("branchId", branchId)
    formData.set("notes", notes.trim())
    for (const row of shopRows) formData.set(`count_${row.productId}`, String(countFor(row.productId, row.quantity)))

    try {
      const result = await startReconciliation(formData)
      setBusy(false)
      if (result && "error" in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success("This count is waiting for a manager to say yes.")
      router.refresh()
    } catch {
      setBusy(false)
      toast.error("Could not save this count. Try again.")
    }
  }

  return (
    <div className="space-y-5">
      <StatGrid className="print:hidden">
        <StatCard
          label="On the system"
          value={`${summary.systemQty} units`}
          hint={formatCurrency(summary.systemValue)}
          icon={<Scale className="h-4 w-4" />}
        />
        <StatCard
          label="Counted on the shelf"
          value={`${summary.countedQty} units`}
          hint={formatCurrency(summary.countedValue)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="primary"
        />
        <StatCard
          label="Extra on the shelf"
          value={`+${summary.gainedUnits} units`}
          hint={summary.gainedUnits > 0 ? formatCurrency(summary.gainedValue) : undefined}
          icon={<TrendingUp className="h-4 w-4" />}
          tone={summary.gainedUnits > 0 ? "success" : "neutral"}
        />
        <StatCard
          label="Short on the shelf"
          value={`−${summary.lostUnits} units`}
          hint={summary.lostUnits > 0 ? formatCurrency(summary.lostValue) : undefined}
          icon={<TrendingDown className="h-4 w-4" />}
          tone={summary.lostUnits > 0 ? "danger" : "neutral"}
        />
      </StatGrid>

      {/* Only on paper: the approver reads this instead of the screen. */}
      <div className="mb-6 hidden overflow-hidden border border-slate-200 print:block">
        <DocumentLetterhead
          brand={brand}
          documentKind="Stock count"
          documentTitle="Stock count"
          meta={[selectedBranch?.name || "", new Date().toLocaleDateString("en-NG")]}
        />
        <div className="border-b px-6 py-3 text-sm">
          <p>
            Shop: <strong>{selectedBranch?.name}</strong> · Date:{" "}
            <strong>{new Date().toLocaleDateString("en-NG")}</strong>
          </p>
          <p className="mt-1 text-xs">
            On the system: {formatCurrency(summary.systemValue)} · Counted: {formatCurrency(summary.countedValue)} ·
            Difference: {formatCurrency(summary.netValue)}
          </p>
          {notes.trim() ? <p className="mt-1 text-xs">Note: {notes.trim()}</p> : null}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Toolbar className="justify-between print:hidden">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="eyebrow shrink-0">Shop</span>
              <Select value={branchId} onChange={(event) => setBranchId(event.target.value)} disabled={busy} className="h-9 w-52">
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </label>
            <Input
              placeholder="Note for this count, or why a number is different"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={busy}
              className="h-9 min-w-[220px] flex-1"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => downloadTable(sheetRows(), `${fileBase}.csv`, "csv")}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> CSV
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => downloadTable(sheetRows(), `${fileBase}.xlsx`, "xlsx")}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" /> Print / PDF
            </Button>
          </div>
        </Toolbar>

        <div className="print:hidden">
          <FilterChips
            label="Count by category"
            activeKey={categoryFilter}
            onSelect={setCategoryFilter}
            chips={STOCK_CATEGORY_FILTERS.filter((row) => row.key === "ALL" || (categoryCounts[row.key] ?? 0) > 0).map(
              (row) => ({
                key: row.key,
                label: row.label,
                count: categoryCounts[row.key] ?? 0,
              })
            )}
          />
        </div>

        <TableShell
          columns={[
            { label: "Item" },
            { label: "Category" },
            { label: "Cost", align: "right" },
            { label: "System count", align: "center" },
            { label: "Hand count", align: "center" },
            { label: "Difference", align: "center" },
            { label: "Difference value", align: "right" },
          ]}
          caption={
            <Input
              placeholder="Find an item, item code, category, or brand"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 max-w-xs"
              disabled={busy}
            />
          }
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
              noun="inventory items"
            />
          }
        >
          {pager.pageRows.map((row) => {
            const expected = row.quantity
            const counted = countFor(row.productId, expected)
            const cost = money(row.product.costPrice)
            const diff = counted - expected
            const diffValue = diff * cost
            const categoryName = row.product.category?.name ?? "Not set"

            return (
              <tr key={row.id}>
                <td>
                  <p className="font-medium">{row.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.product.brand?.name ?? "Item"} · <span className="font-mono">{row.product.sku}</span>
                  </p>
                </td>
                <td className="text-sm text-muted-foreground">{categoryName}</td>
                <td className="text-right num">{formatCurrency(cost)}</td>
                <td className="text-center num font-semibold">{expected}</td>
                <td className="text-center">
                  <Input
                    type="number"
                    min={0}
                    value={counted}
                    onChange={(event) => setCount(row.productId, Number(event.target.value))}
                    disabled={busy}
                    aria-label={`Counted quantity for ${row.product.name}`}
                    className="mx-auto h-9 w-24 text-center font-semibold num"
                  />
                </td>
                <td className="text-center num font-semibold">
                  {diff > 0 ? (
                    <span className="text-success">+{diff}</span>
                  ) : diff < 0 ? (
                    <span className="text-danger">{diff}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="text-right">
                  {diff > 0 ? (
                    <TonePill tone="success">Surplus +{formatCurrency(diffValue)}</TonePill>
                  ) : diff < 0 ? (
                    <TonePill tone="danger">Shrinkage -{formatCurrency(Math.abs(diffValue))}</TonePill>
                  ) : (
                    <span className="text-xs text-muted-foreground">Reconciled</span>
                  )}
                </td>
              </tr>
            )
          })}
          {rows.length === 0 ? <TableEmpty colSpan={7}>No inventory records recorded for this location.</TableEmpty> : null}
        </TableShell>

        {/* Only on paper: somewhere to sign. */}
        <div className="mt-12 hidden grid-cols-3 gap-8 border-t pt-8 print:grid">
          {["Audited by (Inventory Auditor)", "Reviewed by (Internal Controller)", "Authorized by (Branch / Managing Director)"].map((title) => (
            <div key={title} className="space-y-6">
              <p className="text-xs font-semibold uppercase">{title}</p>
              <div className="h-8 w-48 border-b border-black" />
              <p className="text-xs">Signature and date</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4 print:hidden">
          <p className="text-sm">
            <span className="text-muted-foreground">Difference after this count: </span>
            <strong className={summary.netValue >= 0 ? "text-success" : "text-danger"}>
              {summary.netValue > 0 ? `+${formatCurrency(summary.netValue)}` : formatCurrency(summary.netValue)}
            </strong>
          </p>

          <Button type="submit" size="lg" disabled={busy || shopRows.length === 0}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending this stock count
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" /> Send stock count for approval
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
