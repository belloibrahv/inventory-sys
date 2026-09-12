"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { FileSpreadsheet, Printer, Send, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown, Scale, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { startReconciliation } from "@/app/actions/finance"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
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
  }
  branch: {
    id: string
    name: string
    code: string
  }
}

type VaultCount = { productId: string; branchId: string; count: number }

export function StockCountView({
  branches,
  inventory,
  vault,
  defaultBranchId,
}: {
  branches: Branch[]
  inventory: StockItem[]
  vault: VaultCount[]
  defaultBranchId?: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || "")
  const [notes, setNotes] = useState("")

  // Filtered rows for current branch
  const rows = useMemo(() => inventory.filter((r) => r.branchId === branchId), [inventory, branchId])
  const selectedBranch = useMemo(() => branches.find((b) => b.id === branchId), [branches, branchId])

  // Counted quantities state
  const [counts, setCounts] = useState<Record<string, number>>({})

  // Initialize/retrieve count
  function getCount(productId: string, defaultQty: number) {
    if (counts[productId] !== undefined) return counts[productId]
    return defaultQty
  }

  function handleCountChange(productId: string, value: number) {
    const safe = Math.max(0, Math.floor(value) || 0)
    setCounts((prev) => ({ ...prev, [productId]: safe }))
  }

  // Real-time calculations
  const summary = useMemo(() => {
    let expectedQtyTotal = 0
    let countedQtyTotal = 0
    let expectedValueTotal = 0
    let countedValueTotal = 0
    let gainedUnits = 0
    let lostUnits = 0
    let gainedValue = 0
    let lostValue = 0

    for (const r of rows) {
      const exp = r.quantity
      const counted = counts[r.productId] !== undefined ? counts[r.productId] : exp
      const cost = money(r.product.costPrice)
      const diff = counted - exp
      const diffVal = diff * cost

      expectedQtyTotal += exp
      countedQtyTotal += counted
      expectedValueTotal += exp * cost
      countedValueTotal += counted * cost

      if (diff > 0) {
        gainedUnits += diff
        gainedValue += diffVal
      } else if (diff < 0) {
        lostUnits += Math.abs(diff)
        lostValue += Math.abs(diffVal)
      }
    }

    const netVarianceValue = countedValueTotal - expectedValueTotal
    const netVarianceUnits = countedQtyTotal - expectedQtyTotal

    return {
      expectedQtyTotal,
      countedQtyTotal,
      expectedValueTotal,
      countedValueTotal,
      gainedUnits,
      lostUnits,
      gainedValue,
      lostValue,
      netVarianceValue,
      netVarianceUnits,
    }
  }, [rows, counts])

  // Export CSV
  function exportCountCSV() {
    const headers = [
      "Product Name",
      "SKU",
      "Branch",
      "Unit Cost Price (NGN)",
      "System Expected Qty",
      "Physical Counted Qty",
      "Variance Qty",
      "Variance Value (NGN)",
      "Margin Status",
    ]

    const csvRows = rows.map((r) => {
      const exp = r.quantity
      const counted = getCount(r.productId, exp)
      const cost = money(r.product.costPrice)
      const diff = counted - exp
      const diffVal = diff * cost
      const status = diff > 0 ? "GAIN" : diff < 0 ? "LOSS" : "BALANCED"

      return [
        `"${r.product.name.replace(/"/g, '""')}"`,
        r.product.sku,
        r.branch.name,
        cost.toFixed(2),
        exp,
        counted,
        diff > 0 ? `+${diff}` : diff,
        diffVal.toFixed(2),
        status,
      ].join(",")
    })

    const csvContent = [headers.join(","), ...csvRows].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `stock-count-${selectedBranch?.name || branchId}-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Print Paper Preview
  function handlePrint() {
    window.print()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)

    const formData = new FormData()
    formData.set("branchId", branchId)
    formData.set("notes", notes.trim())
    for (const r of rows) {
      const counted = getCount(r.productId, r.quantity)
      formData.set(`count_${r.productId}`, String(counted))
    }

    try {
      const result = await startReconciliation(formData)
      setBusy(false)
      if (result && "error" in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success("Stock count submitted for manager approval.")
      router.refresh()
    } catch {
      setBusy(false)
      toast.error("That did not reach the shop system. Check connection and try again.")
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <div className="surface-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">System Expected</span>
            <Scale className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums">{summary.expectedQtyTotal} units</p>
          <p className="text-xs text-muted-foreground mt-1">Value: {formatCurrency(summary.expectedValueTotal)}</p>
        </div>

        <div className="surface-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">Physically Counted</span>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums">{summary.countedQtyTotal} units</p>
          <p className="text-xs text-muted-foreground mt-1">Value: {formatCurrency(summary.countedValueTotal)}</p>
        </div>

        <div className="surface-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">Gaining Margin</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            +{summary.gainedUnits} units
          </p>
          <p className="text-xs text-muted-foreground mt-1">Gain value: +{formatCurrency(summary.gainedValue)}</p>
        </div>

        <div className="surface-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">Losing Margin</span>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
            -{summary.lostUnits} units
          </p>
          <p className="text-xs text-muted-foreground mt-1">Loss value: -{formatCurrency(summary.lostValue)}</p>
        </div>
      </div>

      {/* Printable Sheet Header (Only visible on paper print) */}
      <div className="hidden print:block mb-6 p-4 border-b">
        <h1 className="text-2xl font-bold">Physical Stock Count Audit Sheet</h1>
        <p className="text-sm">
          Shop: <strong>{selectedBranch?.name}</strong> · Date: <strong>{new Date().toLocaleDateString("en-NG")}</strong>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Expected Value: {formatCurrency(summary.expectedValueTotal)} | Counted Value: {formatCurrency(summary.countedValueTotal)} | Net Variance: {formatCurrency(summary.netVarianceValue)}
        </p>
      </div>

      {/* Actions & Filters Header */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="surface-card p-4 space-y-3 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <div className="w-56">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Select Shop to Count</label>
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={busy}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Audit Notes / Counted By</label>
                <Input
                  placeholder="e.g. Full physical audit conducted by Lead Auditor & Store Keeper"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-5">
              <Button type="button" variant="outline" size="sm" onClick={exportCountCSV}>
                <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" /> Export CSV / Excel
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="mr-1.5 h-4 w-4 text-primary" /> Print Paper Sheet
              </Button>
            </div>
          </div>
        </div>

        {/* Detailed Stock Audit Table */}
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground bg-muted/40 text-xs uppercase tracking-wider">
                <tr className="border-b border-border">
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-3 py-3 text-right">Unit Cost (₦)</th>
                  <th className="px-3 py-3 text-center">System Expected</th>
                  <th className="px-4 py-3 text-center w-36">Physical Count</th>
                  <th className="px-3 py-3 text-center">Variance Qty</th>
                  <th className="px-4 py-3 text-right">Losing / Gaining Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((row) => {
                  const exp = row.quantity
                  const counted = getCount(row.productId, exp)
                  const cost = money(row.product.costPrice)
                  const diff = counted - exp
                  const diffValue = diff * cost
                  const isGain = diff > 0
                  const isLoss = diff < 0
                  const isBalanced = diff === 0

                  return (
                    <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{row.product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.product.brand?.name || "Device"} · <span className="font-mono">{row.product.sku}</span>
                        </p>
                      </td>

                      <td className="px-3 py-3 text-right tabular-nums font-mono font-medium">
                        {formatCurrency(cost)}
                      </td>

                      <td className="px-3 py-3 text-center tabular-nums font-bold text-foreground">
                        {exp}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <Input
                          type="number"
                          min={0}
                          value={counted}
                          onChange={(e) => handleCountChange(row.productId, Number(e.target.value))}
                          disabled={busy}
                          className="w-24 text-center font-bold tabular-nums mx-auto"
                        />
                      </td>

                      <td className="px-3 py-3 text-center tabular-nums font-bold">
                        {isGain ? (
                          <span className="text-emerald-600 dark:text-emerald-400">+{diff}</span>
                        ) : isLoss ? (
                          <span className="text-rose-600 dark:text-rose-400">{diff}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right tabular-nums font-mono">
                        {isGain ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <TrendingUp className="h-3 w-3" /> +{formatCurrency(diffValue)} (Gain)
                          </span>
                        ) : isLoss ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                            <TrendingDown className="h-3 w-3" /> {formatCurrency(diffValue)} (Loss)
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-muted-foreground">Balanced</span>
                        )}
                      </td>
                    </tr>
                  )
                })}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No stock lines found for this shop.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Printable Paper Sign-off Block */}
        <div className="hidden print:grid grid-cols-3 gap-8 mt-12 pt-8 border-t">
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase">Counted By (Store Keeper):</p>
            <div className="border-b border-black w-48 h-8"></div>
            <p className="text-xs">Signature & Date</p>
          </div>
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase">Audited By (Internal Auditor):</p>
            <div className="border-b border-black w-48 h-8"></div>
            <p className="text-xs">Signature & Date</p>
          </div>
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase">Approved By (Branch Manager):</p>
            <div className="border-b border-black w-48 h-8"></div>
            <p className="text-xs">Signature & Date</p>
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border print:hidden">
          <div className="text-sm">
            <span className="text-muted-foreground">Net Stock Variance: </span>
            <strong className={summary.netVarianceValue >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
              {summary.netVarianceValue > 0 ? `+${formatCurrency(summary.netVarianceValue)}` : formatCurrency(summary.netVarianceValue)}
            </strong>
          </div>

          <Button type="submit" size="lg" disabled={busy || rows.length === 0} className="font-semibold min-w-56">
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting count...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" /> Submit Count for Approval
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
