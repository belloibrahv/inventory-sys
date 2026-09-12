"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, FileSpreadsheet, Loader2, Printer, Scale, Send, TrendingDown, TrendingUp } from "lucide-react"
import { toast } from "sonner"
import { startReconciliation } from "@/app/actions/finance"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { StatCard, StatGrid, TableEmpty, TableShell, TonePill, Toolbar } from "@/components/shared"
import { downloadTable } from "@/lib/download-table"
import { formatCurrency, money } from "@/lib/utils"

type Branch = { id: string; name: string; code?: string }
type StockItem = {
  id: string
  productId: string
  branchId: string
  quantity: number
  product: { id: string; name: string; sku: string; costPrice: number; brand?: { name: string } }
  branch: { id: string; name: string; code: string }
}

export function StockCountView({
  branches,
  inventory,
  defaultBranchId,
}: {
  branches: Branch[]
  inventory: StockItem[]
  defaultBranchId?: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || "")
  const [notes, setNotes] = useState("")
  const [counts, setCounts] = useState<Record<string, number>>({})

  const rows = useMemo(() => inventory.filter((row) => row.branchId === branchId), [inventory, branchId])
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
        "Item",
        "Item code",
        "Shop",
        "Cost price",
        "System says",
        "We counted",
        "Difference",
        "Value of difference",
        "Gain or loss",
      ],
      ...rows.map((row) => {
        const expected = row.quantity
        const counted = countFor(row.productId, expected)
        const cost = money(row.product.costPrice)
        const diff = counted - expected
        return [
          row.product.name,
          row.product.sku,
          row.branch.name,
          cost.toFixed(2),
          String(expected),
          String(counted),
          diff > 0 ? `+${diff}` : String(diff),
          (diff * cost).toFixed(2),
          diff > 0 ? "Gain" : diff < 0 ? "Loss" : "Balanced",
        ]
      }),
      [],
      ["System value", summary.systemValue.toFixed(2)],
      ["Counted value", summary.countedValue.toFixed(2)],
      ["Net gain or loss", summary.netValue.toFixed(2)],
    ]
  }

  const fileBase = `stock-count-${selectedBranch?.name?.replace(/\s+/g, "-").toLowerCase() ?? branchId}-${new Date()
    .toISOString()
    .slice(0, 10)}`

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)

    const formData = new FormData()
    formData.set("branchId", branchId)
    formData.set("notes", notes.trim())
    for (const row of rows) formData.set(`count_${row.productId}`, String(countFor(row.productId, row.quantity)))

    try {
      const result = await startReconciliation(formData)
      setBusy(false)
      if (result && "error" in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success("Stock count sent for the manager to approve.")
      router.refresh()
    } catch {
      setBusy(false)
      toast.error("That did not reach the shop system. Check your connection and try once more.")
    }
  }

  return (
    <div className="space-y-5">
      <StatGrid className="print:hidden">
        <StatCard
          label="System says"
          value={`${summary.systemQty} units`}
          hint={`Worth ${formatCurrency(summary.systemValue)} at cost`}
          icon={<Scale className="h-4 w-4" />}
        />
        <StatCard
          label="We counted"
          value={`${summary.countedQty} units`}
          hint={`Worth ${formatCurrency(summary.countedValue)} at cost`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="primary"
        />
        <StatCard
          label="Gaining margin"
          value={`+${summary.gainedUnits} units`}
          hint={`More on the shelf than the system says · ${formatCurrency(summary.gainedValue)}`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone={summary.gainedUnits > 0 ? "success" : "neutral"}
        />
        <StatCard
          label="Losing margin"
          value={`−${summary.lostUnits} units`}
          hint={`Fewer on the shelf than the system says · ${formatCurrency(summary.lostValue)}`}
          icon={<TrendingDown className="h-4 w-4" />}
          tone={summary.lostUnits > 0 ? "danger" : "neutral"}
        />
      </StatGrid>

      {/* Only on paper: the approver reads this instead of the screen. */}
      <div className="mb-6 hidden border-b pb-4 print:block">
        <h1 className="text-xl font-bold">Physical stock count sheet</h1>
        <p className="text-sm">
          Shop: <strong>{selectedBranch?.name}</strong> · Date:{" "}
          <strong>{new Date().toLocaleDateString("en-NG")}</strong>
        </p>
        <p className="mt-1 text-xs">
          System value {formatCurrency(summary.systemValue)} · Counted value {formatCurrency(summary.countedValue)} ·
          Net {formatCurrency(summary.netValue)}
        </p>
        {notes.trim() ? <p className="mt-1 text-xs">Notes: {notes.trim()}</p> : null}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Toolbar className="justify-between print:hidden">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="eyebrow shrink-0">Counting</span>
              <Select value={branchId} onChange={(event) => setBranchId(event.target.value)} disabled={busy} className="h-9 w-52">
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </label>
            <Input
              placeholder="Who counted, and anything worth noting"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={busy}
              className="h-9 min-w-[220px] flex-1"
            />
          </div>

          {/*
            "Let this be downloadable too once we are done ... whoever needs to
            approve should be able to preview the paper and not the software."
          */}
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

        <TableShell
          columns={[
            { label: "Item" },
            { label: "Cost price", align: "right" },
            { label: "System says", align: "center" },
            { label: "We counted", align: "center" },
            { label: "Difference", align: "center" },
            { label: "Gaining / losing margin", align: "right" },
          ]}
        >
          {rows.map((row) => {
            const expected = row.quantity
            const counted = countFor(row.productId, expected)
            const cost = money(row.product.costPrice)
            const diff = counted - expected
            const diffValue = diff * cost

            return (
              <tr key={row.id}>
                <td>
                  <p className="font-medium">{row.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.product.brand?.name ?? "Item"} · <span className="font-mono">{row.product.sku}</span>
                  </p>
                </td>
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
                    <TonePill tone="success">Gain {formatCurrency(diffValue)}</TonePill>
                  ) : diff < 0 ? (
                    <TonePill tone="danger">Loss {formatCurrency(Math.abs(diffValue))}</TonePill>
                  ) : (
                    <span className="text-xs text-muted-foreground">Balanced</span>
                  )}
                </td>
              </tr>
            )
          })}
          {rows.length === 0 ? <TableEmpty colSpan={6}>Nothing on the shelf in this shop yet.</TableEmpty> : null}
        </TableShell>

        {/* Only on paper: somewhere to sign. */}
        <div className="mt-12 hidden grid-cols-3 gap-8 border-t pt-8 print:grid">
          {["Counted by (store keeper)", "Checked by (records checker)", "Approved by (shop manager)"].map((title) => (
            <div key={title} className="space-y-6">
              <p className="text-xs font-semibold uppercase">{title}</p>
              <div className="h-8 w-48 border-b border-black" />
              <p className="text-xs">Signature and date</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4 print:hidden">
          <p className="text-sm">
            <span className="text-muted-foreground">Net gain or loss on this count: </span>
            <strong className={summary.netValue >= 0 ? "text-success" : "text-danger"}>
              {summary.netValue > 0 ? `+${formatCurrency(summary.netValue)}` : formatCurrency(summary.netValue)}
            </strong>
          </p>

          <Button type="submit" size="lg" disabled={busy || rows.length === 0}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending the count…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" /> Send this count for approval
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
