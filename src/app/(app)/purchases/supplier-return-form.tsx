"use client"

import { useRef, useState } from "react"
import { ClipboardList, X } from "lucide-react"
import { toast } from "sonner"
import { lookupSupplierReturnImei, sendUnitsToSupplier } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { ScanField } from "@/components/scan-field"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"

type ReturnLine = {
  imei: string
  productName: string
  supplierId: string
  supplierName: string
  cost: number
  invoice: string
  shop: string
  status: string
  moneyMoves: boolean
  moneyNote: string
}

function cleanCode(raw: string) {
  return raw.replace(/[\s-]/g, "").trim()
}

export function SupplierReturnForm() {
  const [items, setItems] = useState<ReturnLine[]>([])
  const [looking, setLooking] = useState(false)
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteValue, setPasteValue] = useState("")
  const [pasting, setPasting] = useState(false)
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  async function addOne(code: string) {
    const clean = cleanCode(code)
    if (!clean) return
    if (items.some((row) => row.imei === clean)) {
      toast.error(`${clean} is already on this send-back.`)
      return
    }
    setLooking(true)
    try {
      const found = await lookupSupplierReturnImei(clean)
      if ("error" in found && found.error) {
        toast.error(found.error)
        return
      }
      if (!("imei" in found)) return
      const first = items[0]
      if (first && found.supplierId && first.supplierId !== found.supplierId) {
        toast.error(
          `This phone is from ${found.supplierName || "another house"}. This send-back is already for ${first.supplierName}. Start a new send-back for a different supplier.`
        )
        return
      }
      setItems((current) => [...current, found])
      toast.success(`${found.productName} added to this send-back.`)
    } finally {
      setLooking(false)
    }
  }

  /** Paste path: parse newline/comma/space separated codes and look each one up. */
  async function addPasted() {
    const codes = pasteValue
      .split(/[\n,;\s]+/)
      .map(cleanCode)
      .filter((code) => code.length >= 4)
    if (!codes.length) {
      toast.error("No IMEI or serial number found in what you pasted. Each number must be at least 4 characters.")
      return
    }
    const unique = [...new Set(codes)]
    const dupes = unique.filter((code) => items.some((row) => row.imei === code))
    if (dupes.length) {
      toast.error(`${dupes[0]} is already on this send-back.`)
      return
    }
    setPasting(true)
    let added = 0
    let failed = 0
    for (const code of unique) {
      try {
        const found = await lookupSupplierReturnImei(code)
        if ("error" in found && found.error) {
          toast.error(`${code}: ${found.error}`)
          failed++
          continue
        }
        if (!("imei" in found)) continue
        const first = items[0]
        if (first && found.supplierId && first.supplierId !== found.supplierId) {
          toast.error(
            `${code} is from ${found.supplierName || "another house"} but this send-back is for ${first.supplierName}. Remove it from the list and start a new send-back for that supplier.`
          )
          failed++
          continue
        }
        setItems((current) => [...current, found])
        added++
      } catch {
        failed++
      }
    }
    setPasting(false)
    setPasteMode(false)
    setPasteValue("")
    if (added > 0) toast.success(`${added} phone${added === 1 ? "" : "s"} added to this send-back.`)
    if (failed > 0 && added === 0) toast.error(`None of those numbers could be added. Check each one and try again.`)
  }

  const house = items[0]
  const moneyTotal = items.filter((row) => row.moneyMoves).reduce((sum, row) => sum + row.cost, 0)

  return (
    <ActionForm
      action={sendUnitsToSupplier}
      submit="Send these phones back to the supplier"
      pendingLabel="Sending these phones back"
      successMessage="Those phones are on the way back to the supplier"
      enterDoesNotSubmit
      className="space-y-4"
      onSuccess={() => setItems([])}
    >
      {/* Hidden payload */}
      <textarea
        name="imeis"
        value={items.map((row) => row.imei).join("\n")}
        readOnly
        required={items.length === 0}
        className="sr-only"
      />

      {/* Input area */}
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Type or scan each IMEI going back</p>
          <button
            type="button"
            onClick={() => {
              setPasteMode((v) => !v)
              if (!pasteMode) setTimeout(() => pasteRef.current?.focus(), 60)
            }}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            {pasteMode ? "Close paste" : "Paste a list"}
          </button>
        </div>

        {pasteMode ? (
          <div className="space-y-2">
            <textarea
              ref={pasteRef}
              value={pasteValue}
              onChange={(e) => setPasteValue(e.target.value)}
              rows={5}
              placeholder={"Paste IMEIs or serials here — one per line, or separated by commas or spaces.\nExample:\n356938035643809\n356938035643810"}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => void addPasted()}
                disabled={pasting || !pasteValue.trim()}
                className="flex-1"
              >
                {pasting ? "Looking up each number" : `Add ${pasteValue.split(/[\n,;\s]+/).filter((s) => cleanCode(s).length >= 4).length || ""} numbers`}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setPasteMode(false); setPasteValue("") }}
              >
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Each number is looked up separately. Any that are not on the system or are already sent back will show an error without stopping the rest.
            </p>
          </div>
        ) : (
          <ScanField
            kind="ANY"
            onScan={(code) => void addOne(code)}
            placeholder="Type or scan IMEI or serial, then Enter"
            hint="Type the number by hand or use a USB / Bluetooth scanner. Press Enter to add each one. All phones in one send-back must be from the same supplier."
          />
        )}

        {looking && !pasteMode ? (
          <p className="text-sm text-muted-foreground">Looking up this IMEI</p>
        ) : null}
      </div>

      {/* Staged items */}
      {house ? (
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{house.supplierName}</p>
              <p className="text-sm text-muted-foreground">
                {items.length} phone{items.length === 1 ? "" : "s"} on this send-back
                {moneyTotal > 0 ? ` · ${formatCurrency(moneyTotal)} comes off this house` : ""}
              </p>
            </div>
            <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">
              {items.length}
            </span>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.imei} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="min-w-0 space-y-0.5">
                <p className="font-mono text-xs text-muted-foreground">{item.imei}</p>
                <p className="font-medium text-sm">{item.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.supplierName}
                  {item.invoice ? ` · bill ${item.invoice}` : ""}
                  {item.shop ? ` · ${item.shop}` : ""}
                </p>
                <p className="text-xs">
                  Cost {formatCurrency(item.cost)}
                  {!item.moneyMoves && item.moneyNote ? (
                    <span className="ml-1 text-muted-foreground">· {item.moneyNote}</span>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${item.imei}`}
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger"
                onClick={() => setItems((current) => current.filter((row) => row.imei !== item.imei))}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No phone added yet. Type or scan the first IMEI above.
        </p>
      )}
    </ActionForm>
  )
}
