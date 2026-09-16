"use client"

import { useState } from "react"
import { toast } from "sonner"
import { lookupSupplierReturnImei, sendUnitsToSupplier } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { ScanField } from "@/components/scan-field"
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

export function SupplierReturnForm() {
  const [items, setItems] = useState<ReturnLine[]>([])
  const [looking, setLooking] = useState(false)

  async function add(code: string) {
    if (items.some((row) => row.imei === code)) {
      toast.error("That IMEI is already on this send-back.")
      return
    }
    setLooking(true)
    try {
      const found = await lookupSupplierReturnImei(code)
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
    } finally {
      setLooking(false)
    }
  }

  const house = items[0]
  const moneyTotal = items.filter((row) => row.moneyMoves).reduce((sum, row) => sum + row.cost, 0)

  return (
    <ActionForm
      action={sendUnitsToSupplier}
      submit="Send these IMEIs back to the supplier"
      pendingLabel="Sending these phones back"
      successMessage="Those phones are on the way back to the supplier"
      enterDoesNotSubmit
      className="space-y-3"
      onSuccess={() => setItems([])}
    >
      <ScanField
        onScan={(code) => {
          void add(code)
        }}
        placeholder="Scan IMEI, then Enter. Scan the next phone the same way."
        hint="Do not pick the supplier. The IMEI names the phone, the house, and the cost. Scan as many phones as are going back in this one send-back."
      />
      <textarea
        name="imeis"
        value={items.map((row) => row.imei).join("\n")}
        readOnly
        required={items.length === 0}
        className="sr-only"
      />
      {looking ? <p className="text-sm text-muted-foreground">Finding this IMEI</p> : null}
      {house ? (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <p className="font-medium">{house.supplierName}</p>
          <p className="text-muted-foreground">
            {items.length} phone{items.length === 1 ? "" : "s"} on this send-back
            {moneyTotal > 0 ? ` · cost ${formatCurrency(moneyTotal)} comes off this house` : ""}
          </p>
        </div>
      ) : null}
      {items.length ? (
        <ul className="space-y-2 text-sm">
          {items.map((item) => (
            <li key={item.imei} className="rounded-lg bg-muted px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs">{item.imei}</p>
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-muted-foreground">
                    {item.supplierName}
                    {item.invoice ? ` · bill ${item.invoice}` : ""}
                    {item.shop ? ` · ${item.shop}` : ""}
                  </p>
                  <p>
                    Cost {formatCurrency(item.cost)}
                    {item.moneyMoves ? "" : item.moneyNote ? ` · ${item.moneyNote}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-danger"
                  onClick={() => setItems((current) => current.filter((row) => row.imei !== item.imei))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No IMEI yet. Scan the first phone going back.</p>
      )}
    </ActionForm>
  )
}
