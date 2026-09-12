"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Eye, Loader2, PackageCheck } from "lucide-react"
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
      <Button size="sm" onClick={() => setOpen(true)}>
        <Eye className="mr-1.5 h-4 w-4" /> Preview and receive
      </Button>

      {/*
        The client would not confirm an arrival blind: "seeing this interface
        alone, it simply means that everything that we've typed before is what we
        want to reflect ... sometimes we might be expecting four items and, on
        receiving the item, it might just be two." So the list opens for checking
        and correcting first, and only what is ticked goes into the shop.
      */}
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
              <p className="eyebrow">Check before it goes into the shop</p>
              <h2 className="text-base font-semibold tracking-tight">{lot.lotNumber}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Going to <strong className="text-foreground">{lot.branch.name}</strong>
                {lot.supplier ? ` · ${lot.supplier.name}` : ""}
                {lot.purchase ? ` · order ${lot.purchase.invoiceNumber}` : ""}
              </p>
            </div>

            {hasDiscrepancy ? (
              <div className="flex items-center gap-2 border-b border-warning/30 bg-warning-soft px-5 py-2.5 text-xs text-warning">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  The list says <strong>{totalExpected}</strong> unit{totalExpected === 1 ? "" : "s"}, you are receiving{" "}
                  <strong>{totalReceiving}</strong>. That is a difference of{" "}
                  <strong>{Math.abs(totalExpected - totalReceiving)}</strong>.
                </span>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <p className="text-sm text-muted-foreground">
                Change any quantity that is wrong, and untick any IMEI that is not physically in the box. Only what is
                left here is added to {lot.branch.name}.
              </p>

              {lot.items.map((item) => {
                const adj = adjustments[item.id] || { qty: item.quantity, identities: [] }
                const originalIds = item.identifiers
                  ? item.identifiers.split(/[\r\n,]+/).map((value) => value.trim()).filter(Boolean)
                  : []

                return (
                  <div key={item.id} className="space-y-3 rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.product.brand?.name ?? "Item"} ·{" "}
                          {item.identity === "IMEI"
                            ? "tracked by IMEI"
                            : item.identity === "SERIAL"
                              ? "tracked by serial"
                              : "counted in pieces"}{" "}
                          · list says {item.quantity}
                        </p>
                      </div>

                      <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        How many actually came
                        <Input
                          type="number"
                          min={0}
                          max={item.quantity * 2}
                          value={adj.qty}
                          onChange={(event) => handleQtyChange(item.id, Number(event.target.value))}
                          className="h-9 w-20 text-center font-semibold num"
                          disabled={busy || item.identity !== "NONE"}
                        />
                      </label>
                    </div>

                    {item.identity !== "NONE" && originalIds.length > 0 ? (
                      <div className="space-y-2 rounded-md bg-muted/50 p-3">
                        <p className="eyebrow">Tick the ones physically in the box</p>
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
                <span className="eyebrow mb-1 block">Note about anything that did not match</span>
                <Input
                  placeholder="e.g. two units short in the carton, waybill adjusted"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={busy}
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
                <Button type="button" onClick={handleConfirm} disabled={busy}>
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
