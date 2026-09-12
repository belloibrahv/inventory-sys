"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Eye, Loader2, PackageCheck, AlertCircle, X } from "lucide-react"
import { toast } from "sonner"
import { previewAndReceiveIncoming, type ReceiveItemAdjustment } from "@/app/actions/incoming"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type IncomingItem = {
  id: string
  productId: string
  quantity: number
  identity: "IMEI" | "SERIAL" | "NONE"
  identifiers: string | null
  product: {
    name: string
    brand?: { name: string }
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

export function PreviewIncomingModal({ lot }: { lot: IncomingLot }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState("")

  // Form state for each item line
  const [adjustments, setAdjustments] = useState<Record<string, { qty: number; identities: string[] }>>(() => {
    const map: Record<string, { qty: number; identities: string[] }> = {}
    for (const item of lot.items) {
      const ids = item.identifiers ? item.identifiers.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean) : []
      map[item.id] = {
        qty: item.quantity,
        identities: ids,
      }
    }
    return map
  })

  function handleQtyChange(itemId: string, newQty: number) {
    const safeQty = Math.max(0, Math.floor(newQty))
    setAdjustments((prev) => {
      const current = prev[itemId] || { qty: safeQty, identities: [] }
      return {
        ...prev,
        [itemId]: {
          ...current,
          qty: safeQty,
        },
      }
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

  async function handleConfirm() {
    setBusy(true)
    const itemsPayload: ReceiveItemAdjustment[] = lot.items.map((item) => {
      const adj = adjustments[item.id]
      return {
        itemId: item.id,
        receivedQuantity: adj ? adj.qty : item.quantity,
        confirmedIdentities: adj ? adj.identities : [],
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

    toast.success(`Arrival confirmed for ${lot.lotNumber}! Stock added to ${lot.branch.name}.`)
    setOpen(false)
    router.refresh()
  }

  const totalExpected = lot.items.reduce((s, i) => s + i.quantity, 0)
  const totalReceiving = Object.values(adjustments).reduce((s, a) => s + a.qty, 0)
  const hasDiscrepancy = totalExpected !== totalReceiving

  return (
    <>
      <Button size="sm" variant="default" onClick={() => setOpen(true)} className="font-medium">
        <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview & Receive Stock
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="surface-card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5 sm:p-6 shadow-2xl border-primary/20 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between border-b border-border/80 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Pre-Arrival Verification</span>
                <h3 className="text-lg font-bold">{lot.lotNumber}</h3>
                <p className="text-xs text-muted-foreground">
                  Destination: <strong className="text-foreground">{lot.branch.name}</strong>
                  {lot.supplier ? ` · Supplier: ${lot.supplier.name}` : ""}
                  {lot.purchase ? ` · Order: ${lot.purchase.invoiceNumber}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Review what was uploaded vs what physically arrived at the shop counter. Adjust quantities or uncheck missing IMEIs before confirming.
            </p>

            {hasDiscrepancy && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>
                  Expected <strong>{totalExpected} units</strong>, but currently receiving <strong>{totalReceiving} units</strong> ({totalExpected - totalReceiving} difference).
                </span>
              </div>
            )}

            {/* Items review */}
            <div className="space-y-4">
              {lot.items.map((item) => {
                const adj = adjustments[item.id] || { qty: item.quantity, identities: [] }
                const originalIds = item.identifiers ? item.identifiers.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean) : []

                return (
                  <div key={item.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{item.product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.product.brand?.name || "Device"} · {item.identity === "IMEI" ? "Tracked by IMEI" : item.identity === "SERIAL" ? "Tracked by Serial" : "Piece count"}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Actual Received Qty:</span>
                        <Input
                          type="number"
                          min={0}
                          max={item.quantity * 2}
                          value={adj.qty}
                          onChange={(e) => handleQtyChange(item.id, Number(e.target.value))}
                          className="w-20 font-bold text-center"
                          disabled={busy || item.identity !== "NONE"}
                        />
                      </div>
                    </div>

                    {/* IMEI Checklist */}
                    {item.identity !== "NONE" && originalIds.length > 0 && (
                      <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                          Verify physical IMEIs on hand (uncheck if missing/defective):
                        </p>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {originalIds.map((imei) => {
                            const isChecked = adj.identities.includes(imei)
                            return (
                              <label
                                key={imei}
                                className={`flex items-center gap-2 rounded-lg border p-2 text-xs font-mono cursor-pointer transition-colors ${isChecked ? "border-primary/40 bg-primary/5 text-foreground" : "border-border/60 bg-muted/20 text-muted-foreground line-through opacity-60"}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleImei(item.id, imei)}
                                  disabled={busy}
                                  className="rounded border-border"
                                />
                                <span>{imei}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Verification / Discrepancy Note (Optional)</label>
              <Input
                placeholder="e.g. 2 units missing from supplier carton, waybill adjusted"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={busy}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">
                Receiving total: <strong className="text-foreground">{totalReceiving} units</strong> into {lot.branch.name}
              </span>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleConfirm} disabled={busy} className="font-semibold">
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming...
                    </>
                  ) : (
                    <>
                      <PackageCheck className="mr-2 h-4 w-4" /> Confirm & Add to Shop
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
