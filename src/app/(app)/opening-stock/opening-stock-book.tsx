"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, Download, Eye, Loader2, Lock, Save, Upload } from "lucide-react"
import {
  closeOpeningStock,
  correctOpeningFromSheet,
  saveOpeningEdits,
  type CorrectionResult,
  type OpeningBook,
} from "@/app/actions/opening-stock"
import { DrilldownModal } from "@/components/drilldown-modal"
import { SectionCard, StatCard, StatGrid, TableEmpty, TableShell, TonePill, Toolbar } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { downloadWorkbook } from "@/lib/download-table"
import { bookSheets, cleanIdentity, type BookLine } from "@/lib/opening-book"
import { formatCurrency, formatDate } from "@/lib/utils"

type Edit = {
  quantity?: string
  costPrice?: string
  minimumPrice?: string
  sellingPrice?: string
  addIdentities?: string[]
  removeIdentities?: string[]
}

export function OpeningStockBook({ branchId, book }: { branchId: string; book: OpeningBook }) {
  const router = useRouter()
  const record = book.record!
  const closed = record.status === "CLOSED"
  const [query, setQuery] = useState("")
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [saving, setSaving] = useState(false)
  const [unitsFor, setUnitsFor] = useState<BookLine | null>(null)
  const [newUnits, setNewUnits] = useState("")

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return book.lines
    return book.lines.filter((line) =>
      [line.name, line.sku, line.brand, line.category, ...line.identities].join(" ").toLowerCase().includes(needle)
    )
  }, [book.lines, query])
  const pager = usePagedRows(visible, query)
  const dirty = Object.entries(edits).filter(([, edit]) => Object.values(edit).some((v) => (Array.isArray(v) ? v.length : v !== undefined)))
  const offShelf = book.lines.filter((line) => line.shelfQty !== line.openingQty)
  const fileBase = `opening-stock-${record.shopCode.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`

  function edit(sku: string, patch: Edit) {
    setEdits((prev) => ({ ...prev, [sku]: { ...prev[sku], ...patch } }))
  }

  async function saveEdits() {
    const changes = dirty.map(([sku, e]) => ({
      sku,
      quantity: e.quantity,
      costPrice: e.costPrice,
      minimumPrice: e.minimumPrice,
      sellingPrice: e.sellingPrice,
      addIdentities: e.addIdentities,
      removeIdentities: e.removeIdentities,
    }))
    const data = new FormData()
    data.set("branchId", branchId)
    data.set("changes", JSON.stringify(changes))
    setSaving(true)
    let result: CorrectionResult
    try {
      result = await saveOpeningEdits(data)
    } catch {
      setSaving(false)
      toast.error("That did not reach the shop system. Check your network and try again.")
      return
    }
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(`Saved. Opening stock is now worth ${formatCurrency(result.preview?.valueAfter ?? 0)} at cost.`)
    setEdits({})
    router.refresh()
  }

  function field(line: BookLine, key: "quantity" | "costPrice" | "minimumPrice" | "sellingPrice", saved: number) {
    const value = edits[line.sku]?.[key]
    if (!book.canCorrect || (key === "quantity" && line.tracking !== "NONE")) {
      return key === "quantity" ? <span className="num font-semibold">{saved}</span> : <span className="num">{formatCurrency(saved)}</span>
    }
    return (
      <Input
        type="number"
        min={0}
        step={key === "quantity" ? 1 : "0.01"}
        value={value ?? String(saved)}
        onChange={(event) => edit(line.sku, { [key]: event.target.value === String(saved) ? undefined : event.target.value })}
        aria-label={`${key} for ${line.name}`}
        className={`ml-auto h-8 text-right num ${key === "quantity" ? "w-20" : "w-28"} ${value !== undefined ? "border-warning" : ""}`}
      />
    )
  }

  return (
    <div className="space-y-5">
      <StatGrid>
        <StatCard
          label={closed ? "Opened with (closed)" : "Opening value so far"}
          value={formatCurrency(record.totals.value)}
          hint={`At cost · bill ${record.invoiceNumber}`}
          tone={closed ? "success" : "warning"}
          icon={closed ? <Lock className="h-4 w-4" /> : undefined}
        />
        <StatCard label="Units" value={String(record.totals.quantity)} hint={`${record.totals.lines} item lines`} />
        <StatCard
          label="Status"
          value={closed ? "Closed" : "Open"}
          hint={
            closed
              ? `Closed ${record.closedAt ? formatDate(record.closedAt) : ""} by ${record.closedByName ?? "—"}. It can never change.`
              : "Being counted and corrected. This shop cannot sell until it is closed."
          }
          tone={closed ? "success" : "warning"}
        />
        <StatCard label="Loaded" value={formatDate(record.loadedAt)} hint="The day the opening sheet went on the system" href={`/purchases/${record.purchaseId}`} />
      </StatGrid>

      {!closed ? (
        <SectionCard title="How to finish opening stock">
          <ol className="grid gap-2 text-sm text-muted-foreground md:grid-cols-4">
            <li><span className="font-semibold text-foreground">1. Download the count sheet.</span> Every item, count, cost, both selling prices, and every IMEI.</li>
            <li><span className="font-semibold text-foreground">2. Count the shelf.</span> Write what you really find in COUNTED QTY. Mark a missing phone NO.</li>
            <li><span className="font-semibold text-foreground">3. Correct.</span> Upload the filled sheet and check the preview, or change a line on screen below.</li>
            <li><span className="font-semibold text-foreground">4. Close.</span> The CEO or main admin closes it. After that it is final and the shop can sell.</li>
          </ol>
        </SectionCard>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {book.canCorrect ? <SheetCorrection branchId={branchId} /> : null}
        {book.canClose ? <CloseCard branchId={branchId} value={record.totals.value} shop={record.shopName} /> : null}
      </div>

      {!closed && offShelf.length ? (
        <p className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
          {offShelf.length} item(s) have more or fewer on the shelf row than on the opening stock, usually because a supplier
          bill was booked for them too. Only the opening stock figure is corrected here.
        </p>
      ) : null}

      <TableShell
        caption={
          <>
            <Input
              placeholder="Find an item, item code or IMEI"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 max-w-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadWorkbook(bookSheets(book.lines), `${fileBase}${closed ? "-closed" : "-count-sheet"}.xlsx`)}
              >
                <Download className="mr-1.5 h-4 w-4" /> {closed ? "Download (Excel)" : "Download count sheet (Excel)"}
              </Button>
              {book.canCorrect ? (
                <Button type="button" size="sm" onClick={saveEdits} disabled={saving || dirty.length === 0}>
                  {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                  Save {dirty.length ? `${dirty.length} changed line${dirty.length === 1 ? "" : "s"}` : "changes"}
                </Button>
              ) : null}
            </div>
          </>
        }
        columns={[
          { label: "Item" },
          { label: "Count", align: "right" },
          { label: "Unit cost", align: "right" },
          { label: "Lowest price", align: "right" },
          { label: "Standard price", align: "right" },
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
        {pager.pageRows.map((line) => {
          const e = edits[line.sku] ?? {}
          const qty =
            line.tracking === "NONE"
              ? Number(e.quantity ?? line.openingQty)
              : line.openingQty + (e.addIdentities?.length ?? 0) - (e.removeIdentities?.length ?? 0)
          const cost = Number(e.costPrice ?? line.costPrice)
          return (
            <tr key={line.sku}>
              <td>
                <p className="font-medium">{line.name}</p>
                <p className="text-xs text-muted-foreground">
                  {line.brand} · <span className="font-mono">{line.sku}</span>
                  {line.shelfQty !== line.openingQty && !closed ? ` · shelf row ${line.shelfQty}` : ""}
                </p>
                {line.tracking !== "NONE" ? (
                  <button type="button" className="mt-1 text-xs font-medium text-primary hover:underline" onClick={() => setUnitsFor(line)}>
                    {line.tracking === "IMEI" ? "IMEIs" : "Serials"} ({qty}){book.canCorrect ? " · add or take off" : ""}
                  </button>
                ) : null}
              </td>
              <td className="text-right">
                {line.tracking === "NONE" ? field(line, "quantity", line.openingQty) : <span className="num font-semibold">{qty}</span>}
              </td>
              <td className="text-right">{field(line, "costPrice", line.costPrice)}</td>
              <td className="text-right">{field(line, "minimumPrice", line.minimumPrice)}</td>
              <td className="text-right">{field(line, "sellingPrice", line.sellingPrice)}</td>
              <td className="text-right num font-semibold">{formatCurrency((Number.isFinite(qty) ? qty : 0) * (Number.isFinite(cost) ? cost : 0))}</td>
            </tr>
          )
        })}
        {visible.length === 0 ? <TableEmpty colSpan={6}>No item matches that search.</TableEmpty> : null}
      </TableShell>

      <DrilldownModal
        open={unitsFor !== null}
        onClose={() => {
          setUnitsFor(null)
          setNewUnits("")
        }}
        eyebrow={unitsFor?.sku}
        title={unitsFor ? `${unitsFor.name}: ${unitsFor.tracking === "IMEI" ? "IMEIs" : "serials"}` : ""}
        width="narrow"
        download={
          unitsFor
            ? {
                filename: `${fileBase}-${unitsFor.sku.toLowerCase()}-units`,
                rows: () => [["ITEM CODE", "PRODUCT NAME", "IMEI / SERIAL"], ...unitsFor.identities.map((id) => [unitsFor.sku, unitsFor.name, id])],
              }
            : undefined
        }
      >
        {unitsFor ? (
          <div className="space-y-4 p-5">
            {book.canCorrect ? (
              <div className="space-y-2">
                <label className="block text-sm">
                  <span className="eyebrow mb-1 block">Found on the shelf but not listed</span>
                  <textarea
                    value={newUnits}
                    onChange={(event) => setNewUnits(event.target.value)}
                    rows={3}
                    placeholder="One IMEI or serial per line"
                    className="w-full rounded-lg border border-input bg-card p-2 font-mono text-sm"
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const found = newUnits.split(/[\n,]+/).map(cleanIdentity).filter(Boolean)
                    const current = edits[unitsFor.sku]?.addIdentities ?? []
                    edit(unitsFor.sku, { addIdentities: [...new Set([...current, ...found])].filter((id) => !unitsFor.identities.includes(id)) })
                    setNewUnits("")
                  }}
                >
                  Add to the list
                </Button>
              </div>
            ) : null}
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {(edits[unitsFor.sku]?.addIdentities ?? []).map((id) => (
                <li key={`add-${id}`} className="flex items-center justify-between px-3 py-2">
                  <span className="font-mono">{id}</span>
                  <span className="flex items-center gap-2">
                    <TonePill tone="success">Will be added</TonePill>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:underline"
                      onClick={() => edit(unitsFor.sku, { addIdentities: (edits[unitsFor.sku]?.addIdentities ?? []).filter((v) => v !== id) })}
                    >
                      Undo
                    </button>
                  </span>
                </li>
              ))}
              {unitsFor.identities.map((id) => {
                const removing = edits[unitsFor.sku]?.removeIdentities?.includes(id)
                return (
                  <li key={id} className="flex items-center justify-between px-3 py-2">
                    <span className={`font-mono ${removing ? "text-danger line-through" : ""}`}>{id}</span>
                    {book.canCorrect ? (
                      <button
                        type="button"
                        className={`text-xs font-medium hover:underline ${removing ? "text-muted-foreground" : "text-danger"}`}
                        onClick={() => {
                          const list = edits[unitsFor.sku]?.removeIdentities ?? []
                          edit(unitsFor.sku, { removeIdentities: removing ? list.filter((v) => v !== id) : [...list, id] })
                        }}
                      >
                        {removing ? "Keep" : "Not on the shelf"}
                      </button>
                    ) : null}
                  </li>
                )
              })}
              {unitsFor.identities.length === 0 ? <li className="px-3 py-6 text-center text-muted-foreground">None listed.</li> : null}
            </ul>
            {book.canCorrect ? (
              <p className="text-xs text-muted-foreground">Changes here are saved with Save changed lines on the table.</p>
            ) : null}
          </div>
        ) : null}
      </DrilldownModal>
    </div>
  )
}

function SheetCorrection({ branchId }: { branchId: string }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null)
  const [result, setResult] = useState<CorrectionResult | null>(null)

  async function run(mode: "preview" | "apply") {
    if (!formRef.current) return
    const data = new FormData(formRef.current)
    data.set("branchId", branchId)
    data.set("mode", mode)
    setBusy(mode)
    let outcome: CorrectionResult
    try {
      outcome = await correctOpeningFromSheet(data)
    } catch {
      setBusy(null)
      toast.error("That did not reach the shop system. Check your network and try again.")
      return
    }
    setBusy(null)
    if (outcome.error) {
      toast.error(outcome.error)
      setResult(outcome)
      return
    }
    if (outcome.applied) {
      toast.success(`Corrections saved. Opening stock is now worth ${formatCurrency(outcome.preview?.valueAfter ?? 0)} at cost.`)
      formRef.current.reset()
      setResult(null)
      router.refresh()
      return
    }
    setResult(outcome)
  }

  return (
    <SectionCard title="Upload the filled count sheet" description="Nothing is saved until you have seen the changes and pressed Save these corrections.">
      <form ref={formRef} onSubmit={(event) => event.preventDefault()} className="space-y-3">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls"
          required
          disabled={busy !== null}
          onChange={() => setResult(null)}
          className="h-10 w-full rounded-lg border border-dashed border-input bg-card px-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
        />
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>Blank cells keep what is saved. Only what you write changes.</li>
          <li>To take a phone off, write NO next to its IMEI. Add a found phone as a new row with its item code.</li>
          <li>An item that was never loaded: a new ITEMS row with ITEM CODE left blank, plus its prices and tracking.</li>
        </ul>
        <Toolbar>
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => run("preview")}>
            {busy === "preview" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Eye className="mr-1.5 h-4 w-4" />}
            See what will change
          </Button>
          {result?.preview && !result.error ? (
            <Button type="button" size="sm" disabled={busy !== null} onClick={() => run("apply")}>
              {busy === "apply" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
              Save these corrections
            </Button>
          ) : null}
        </Toolbar>
      </form>

      {result?.problems?.length ? (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger-soft p-3">
          <p className="text-sm font-semibold text-danger">Fix these in the sheet, then try again. Nothing was changed.</p>
          <ul className="mt-2 max-h-56 space-y-1 overflow-auto">
            {result.problems.map((problem) => (
              <li key={problem} className="text-xs text-danger">{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result?.preview && !result.error ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-sm font-semibold">
            {result.preview.rows.length} change{result.preview.rows.length === 1 ? "" : "s"} · value {formatCurrency(result.preview.valueBefore)} →{" "}
            {formatCurrency(result.preview.valueAfter)}
          </p>
          <ul className="mt-2 max-h-72 space-y-1 overflow-auto text-xs">
            {result.preview.rows.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  )
}

function CloseCard({ branchId, value, shop }: { branchId: string; value: number; shop: string }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])

  async function close() {
    const data = new FormData()
    data.set("branchId", branchId)
    data.set("confirm", confirm ? "yes" : "")
    setBusy(true)
    try {
      const outcome = await closeOpeningStock(data)
      setBusy(false)
      if (outcome.error) {
        toast.error(outcome.error)
        setProblems(outcome.problems ?? [])
        return
      }
      toast.success(`${shop}'s opening stock is closed. The shop can now sell.`)
      router.refresh()
    } catch {
      setBusy(false)
      toast.error("That did not reach the shop system. Check your network and try again.")
    }
  }

  return (
    <SectionCard title="Close opening stock" description="CEO or main admin. Do this only when the count and the corrections are finished.">
      <p className="text-sm">
        Closing fixes <span className="font-semibold">{shop}</span>&apos;s opening stock at{" "}
        <span className="num font-semibold">{formatCurrency(value)}</span> at cost, with today&apos;s counts, IMEIs and prices.
        It can never be edited again. Later changes go through Stock count and supplier bills.
      </p>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} className="mt-1" />
        <span>The shelf has been counted and every correction is saved. This opening stock is final.</span>
      </label>
      <Button type="button" className="mt-3" onClick={close} disabled={!confirm || busy}>
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
        Close opening stock
      </Button>
      {problems.length ? (
        <ul className="mt-3 max-h-48 space-y-1 overflow-auto rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        Want the paper first? Use Download above, or see <Link href="/reports" className="text-primary hover:underline">Reports</Link>.
      </p>
    </SectionCard>
  )
}
