"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Eye, Loader2, PackageCheck } from "lucide-react"
import { toast } from "sonner"
import { previewAndReceiveIncoming, type ReceiveItemAdjustment } from "@/app/actions/incoming"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/utils"

type IncomingItem = {
  id: string
  productId: string
  quantity: number
  expectedQuantity?: number
  receivedQuantity?: number | null
  identity: "IMEI" | "SERIAL" | "NONE"
  identifiers: string | null
  suggestedCost?: number
  catalogCost?: number
  billCost?: number | null
  product: {
    name: string
    brand?: { name: string }
    costPrice?: number
  }
}

type IncomingLot = {
  id: string
  lotNumber: string
  branch: { name: string }
  supplier: { name: string } | null
  purchase: { invoiceNumber: string } | null
  expectedDate: Date | null
  notes: string | null
  items: IncomingItem[]
}

type LineAdj = { qty: number; identities: string[]; unitCost: number }

function suggestedFor(item: IncomingItem) {
  if (typeof item.suggestedCost === "number") return item.suggestedCost
  if (typeof item.billCost === "number") return item.billCost
  if (typeof item.catalogCost === "number") return item.catalogCost
  return Number(item.product.costPrice || 0)
}

export function PreviewIncomingModal({ lot }: { lot: IncomingLot }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState("")

  const [adjustments, setAdjustments] = useState<Record<string, LineAdj>>(() => {
    const map: Record<string, LineAdj> = {}
    for (const item of lot.items) {
      const expected = item.expectedQuantity && item.expectedQuantity > 0 ? item.expectedQuantity : item.quantity
      const ids = item.identifiers ? item.identifiers.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean) : []
      map[item.id] = {
        qty: expected,
        identities: ids,
        unitCost: suggestedFor(item),
      }
    }
    return map
  })

  function handleQtyChange(itemId: string, newQty: number) {
    const safeQty = Math.max(0, Math.floor(newQty))
    setAdjustments((prev) => {
      const current = prev[itemId]
      if (!current) return prev
      return { ...prev, [itemId]: { ...current, qty: safeQty } }
    })
  }

  function handleCostChange(itemId: string, cost: number) {
    setAdjustments((prev) => {
      const current = prev[itemId]
      if (!current) return prev
      return { ...prev, [itemId]: { ...current, unitCost: cost } }
    })
  }

  function handleToggleImei(itemId: string, imei: string) {
    setAdjustments((prev) => {
      const current = prev[itemId]
      if (!current) return prev
      const has = current.identities.includes(imei)
      const nextIds = has ? current.identities.filter((id) => id !== imei) : [...current.identities, imei]
      return {
        ...prev,
        [itemId]: {
          ...current,
          qty: nextIds.length,
          identities: nextIds,
        },
      }
    })
  }

  const lineExpected = useMemo(
    () =>
      Object.fromEntries(
        lot.items.map((item) => [
          item.id,
          item.expectedQuantity && item.expectedQuantity > 0 ? item.expectedQuantity : item.quantity,
        ])
      ),
    [lot.items]
  )

  const totalExpected = lot.items.reduce((sum, item) => sum + lineExpected[item.id], 0)
  const totalReceiving = Object.values(adjustments).reduce((sum, row) => sum + row.qty, 0)
  const hasDiscrepancy = totalExpected !== totalReceiving
  const shortBy = totalExpected - totalReceiving
  const hasCostChange = lot.items.some((item) => {
    const adj = adjustments[item.id]
    const catalog = typeof item.catalogCost === "number" ? item.catalogCost : Number(item.product.costPrice || 0)
    return adj && Number(adj.unitCost) !== catalog
  })
  const needsNote = hasDiscrepancy || hasCostChange

  async function handleConfirm() {
    if (needsNote && !notes.trim()) {
      toast.error(
        hasDiscrepancy
          ? "Write a short note about the shortage or extra units before you confirm."
          : "Write a short note about the cost change before you confirm."
      )
      return
    }

    for (const item of lot.items) {
      const cost = Number(adjustments[item.id]?.unitCost)
      if (!Number.isFinite(cost) || cost < 0) {
        toast.error(`Enter a valid unit cost for ${item.product.name}.`)
        return
      }
    }

    setBusy(true)
    const itemsPayload: ReceiveItemAdjustment[] = lot.items.map((item) => {
      const adj = adjustments[item.id]
      const expected = lineExpected[item.id]
      return {
        itemId: item.id,
        receivedQuantity: adj ? adj.qty : expected,
        confirmedIdentities: adj ? adj.identities : [],
        unitCost: adj ? Number(adj.unitCost) : suggestedFor(item),
      }
    })

    const result = await previewAndReceiveIncoming({
      lotId: lot.id,
      notes: notes.trim() || undefined,
      items: itemsPayload,
    })

    setBusy(false)
    if (result && "error" in result && result.error) {
      toast.error(result.error)
      return
    }

    if (result && "variance" in result && result.variance) {
      toast.warning(
        `Arrival recorded with a shortage/extra. The records checker has been alerted (${result.shortUnits ?? 0} short).`
      )
    } else if (result && "costChanged" in result && result.costChanged) {
      toast.success(`Arrival confirmed. Catalogue cost updated from this carton.`)
    } else {
      toast.success(`Arrival confirmed for ${lot.lotNumber}. Stock added to ${lot.branch.name}.`)
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Eye className="mr-1.5 h-4 w-4" /> Preview and receive
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Check what arrived on ${lot.lotNumber}`}
            className="surface-card relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none shadow-xl sm:rounded-lg"
          >
            <div className="border-b border-border px-5 py-3.5">
              <p className="eyebrow">Check count and cost before it enters the shop</p>
              <h2 className="text-base font-semibold tracking-tight">{lot.lotNumber}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Going to <strong className="text-foreground">{lot.branch.name}</strong>
                {lot.supplier ? ` · ${lot.supplier.name}` : ""}
                {lot.purchase ? ` · order ${lot.purchase.invoiceNumber}` : ""}
              </p>
            </div>

            {hasDiscrepancy || hasCostChange ? (
              <div className="flex items-start gap-2 border-b border-warning/30 bg-warning-soft px-5 py-2.5 text-xs text-warning">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {hasDiscrepancy ? (
                    <>
                      Expected <strong>{totalExpected}</strong>, receiving <strong>{totalReceiving}</strong>
                      {shortBy > 0 ? (
                        <>
                          {" "}
                          — <strong>{shortBy} short</strong>
                        </>
                      ) : (
                        <>
                          {" "}
                          — <strong>{-shortBy} extra</strong>
                        </>
                      )}
                      .{" "}
                    </>
                  ) : null}
                  {hasCostChange ? <>Unit cost differs from the price list. </> : null}
                  A short note is required before you confirm.
                </span>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <p className="text-sm text-muted-foreground">
                Check how many came, confirm the unit cost on the supplier paper, and untick any IMEI that is not in the
                box. The cost you confirm becomes the catalogue cost used for profit.
              </p>

              {lot.items.map((item) => {
                const expected = lineExpected[item.id]
                const adj = adjustments[item.id] || {
                  qty: expected,
                  identities: [],
                  unitCost: suggestedFor(item),
                }
                const originalIds = item.identifiers
                  ? item.identifiers.split(/[\r\n,]+/).map((value) => value.trim()).filter(Boolean)
                  : []
                const lineShort = expected - adj.qty
                const catalog = typeof item.catalogCost === "number" ? item.catalogCost : Number(item.product.costPrice || 0)
                const costDiffers = Number(adj.unitCost) !== catalog

                return (
                  <div key={item.id} className="space-y-3 rounded-lg border border-border p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.product.brand?.name ?? "Item"} ·{" "}
                        {item.identity === "IMEI"
                          ? "tracked by IMEI"
                          : item.identity === "SERIAL"
                            ? "tracked by serial"
                            : "counted in pieces"}{" "}
                        · expected {expected}
                        {lineShort !== 0 ? (
                          <span className="text-warning">
                            {" "}
                            · {lineShort > 0 ? `short ${lineShort}` : `extra ${-lineShort}`}
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs text-muted-foreground">
                        How many actually came
                        <Input
                          type="number"
                          min={0}
                          max={expected * 2}
                          value={adj.qty}
                          onChange={(event) => handleQtyChange(item.id, Number(event.target.value))}
                          className="mt-1 h-9 font-semibold num"
                          disabled={busy || item.identity !== "NONE"}
                        />
                      </label>
                      <label className="block text-xs text-muted-foreground">
                        Unit cost on this carton (₦)
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={adj.unitCost}
                          onChange={(event) => handleCostChange(item.id, Number(event.target.value))}
                          className="mt-1 h-9 font-semibold num"
                          disabled={busy}
                        />
                        <span className={`mt-1 block ${costDiffers ? "text-warning" : ""}`}>
                          Price list now {formatCurrency(catalog)}
                          {item.billCost != null ? ` · bill ${formatCurrency(item.billCost)}` : ""}
                          {costDiffers ? " · will update catalogue" : ""}
                        </span>
                      </label>
                    </div>

                    {item.identity !== "NONE" && originalIds.length > 0 ? (
                      <div className="space-y-2 rounded-md bg-muted/50 p-3">
                        <p className="eyebrow">Tick the ones that are really in the box</p>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {originalIds.map((imei) => {
                            const isChecked = adj.identities.includes(imei)
                            return (
                              <label
                                key={imei}
                                className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 font-mono text-xs transition-colors ${
                                  isChecked
                                    ? "border-primary/40 bg-primary-soft text-foreground"
                                    : "border-border bg-card text-muted-foreground line-through"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleImei(item.id, imei)}
                                  disabled={busy}
                                  className="rounded border-border"
                                />
                                <span className="truncate">{imei}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}

              <label className="block text-sm">
                <span className="eyebrow mb-1 block">
                  {needsNote ? "Explain the shortage, extra, or cost change (required)" : "Write down anything that did not match"}
                </span>
                <Input
                  placeholder="Example: two units short · new supplier cost on invoice"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={busy}
                  required={needsNote}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
              <span className="text-xs text-muted-foreground">
                Adding <strong className="text-foreground">{totalReceiving}</strong> unit
                {totalReceiving === 1 ? "" : "s"} to {lot.branch.name}
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleConfirm} disabled={busy || (needsNote && !notes.trim())}>
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming…
                    </>
                  ) : (
                    <>
                      <PackageCheck className="mr-2 h-4 w-4" /> Confirm and add to the shop
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
