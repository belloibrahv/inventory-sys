"use client"

import { useMemo, useState } from "react"
import { createReturn } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency, money } from "@/lib/utils"
import { warrantyState } from "@/lib/warranty"

type Sold = {
  id: string
  imei1: string
  serialNumber?: string | null
  branchId: string
  product: { name: string; sellingPrice: number; warrantyDays: number }
  customer: { name: string } | null
  sale: { invoiceNumber: string; saleDate: Date; items: Array<{ imeiId: string | null; totalPrice: number }> } | null
  branch: { code: string }
}

type StockUnit = {
  id: string
  imei1: string
  serialNumber: string | null
  branchId: string
  product: { name: string; sellingPrice: number }
}

const REASONS = [
  { value: "FAULTY", label: "Faulty" },
  { value: "WARRANTY", label: "Under warranty" },
  { value: "CUSTOMER_DISSATISFACTION", label: "Customer not satisfied" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "WRONG_PRODUCT", label: "Wrong product" },
  { value: "SUPPLIER_RETURN", label: "Send toward supplier" },
] as const

const FAULTS = [
  { value: "GOOD_STOCK", label: "Still good for shelf" },
  { value: "FAULTY_STOCK", label: "Damaged / not for sale" },
  { value: "REPAIR_STOCK", label: "Needs repair" },
  { value: "SCRAP_STOCK", label: "Scrap / write off" },
] as const

function deviceLabel(row: { imei1: string; serialNumber?: string | null }) {
  if (row.serialNumber && row.serialNumber !== row.imei1) return `${row.imei1} · serial ${row.serialNumber}`
  return row.imei1
}

export function ReturnForm({ sold, stock }: { sold: Sold[]; stock: StockUnit[] }) {
  const [imei1, setImei1] = useState(sold[0]?.imei1 ?? "")
  const [outcome, setOutcome] = useState("REPAIR")
  const [returnValue, setReturnValue] = useState("")
  const [replacementId, setReplacementId] = useState("")
  const [replacementValue, setReplacementValue] = useState("")

  const selected = useMemo(() => sold.find((row) => row.imei1 === imei1), [sold, imei1])
  const line = selected?.sale?.items.find((item) => item.imeiId === selected.id)
  const suggestedReturn = money(line?.totalPrice) || money(selected?.product.sellingPrice)
  const warranty = selected?.sale
    ? warrantyState(selected.sale.saleDate, selected.product.warrantyDays)
    : null

  const shopStock = stock.filter((row) => !selected || row.branchId === selected.branchId)
  const pickedReplacement = shopStock.find((row) => row.id === replacementId)

  const returnAmount = Number(returnValue !== "" ? returnValue : suggestedReturn || 0)
  const givenAmount = Number(replacementValue || 0)
  const balance = givenAmount - returnAmount
  const isReplace = outcome === "REPLACEMENT"

  return (
    <ActionForm
      action={createReturn}
      submit="Save return for approval"
      successMessage="Return saved. Waiting for approval."
      confirmModal={{
        title: "Send this return for approval?",
        description: "A manager must say yes before stock or money moves.",
        confirmLabel: "Send for approval",
        tone: "warning",
      }}
      className="space-y-3"
    >
      <Select
        name="imei1"
        value={imei1}
        onChange={(event) => {
          const next = event.target.value
          setImei1(next)
          const hit = sold.find((row) => row.imei1 === next)
          const nextLine = hit?.sale?.items.find((item) => item.imeiId === hit.id)
          const nextValue = money(nextLine?.totalPrice) || money(hit?.product.sellingPrice)
          setReturnValue(nextValue ? String(nextValue) : "")
          setReplacementId("")
          setReplacementValue("")
        }}
        required
        emptyLabel="This shop has not sold any phone yet. A return needs a phone that this shop sold."
      >
        {sold.map((row) => (
          <option key={row.imei1} value={row.imei1}>
            {deviceLabel(row)} · {row.product.name} · {row.customer?.name ?? "Walk-in"}
          </option>
        ))}
      </Select>

      {selected ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <p className="font-medium">{selected.product.name}</p>
          <p className="text-muted-foreground">
            {deviceLabel(selected)} · {selected.sale?.invoiceNumber ?? "No invoice"} · {selected.branch.code}
            {warranty ? ` · ${warranty.label}` : ""}
          </p>
          <p className="mt-1">
            Original sale line: {formatCurrency(suggestedReturn)}
          </p>
        </div>
      ) : (
        <p className="text-sm text-danger">No IMEI has been sold here.</p>
      )}

      <Select name="reason" defaultValue="FAULTY">
        {REASONS.map((item) => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </Select>

      <Select name="outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)} required>
        <option value="REPAIR">Repair</option>
        <option value="REPLACEMENT">Replace from our stock</option>
        <option value="REFUND">Refund</option>
        <option value="CREDIT_NOTE">Credit note</option>
        <option value="SEND_TO_SUPPLIER">Send back to the supplier</option>
      </Select>

      <Select name="faultClass" defaultValue="FAULTY_STOCK">
        {FAULTS.map((item) => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </Select>

      <Input
        name="returnValue"
        type="number"
        min={0}
        value={returnValue !== "" ? returnValue : String(suggestedReturn || "")}
        onChange={(event) => setReturnValue(event.target.value)}
        placeholder="Return item value"
        required
      />
      <p className="text-sm text-muted-foreground">
        Return item value is what that goods is worth on this return. Suggested from the original sale: {formatCurrency(suggestedReturn)}.
      </p>

      {isReplace ? (
        <>
          <Select
            name="replacementImeiId"
            value={replacementId}
            onChange={(event) => {
              const next = event.target.value
              setReplacementId(next)
              const hit = shopStock.find((row) => row.id === next)
              if (hit) setReplacementValue(String(hit.product.sellingPrice))
            }}
            required
            emptyLabel="No In shop unit is ready to give out."
          >
            <option value="">Pick the shop item to give out</option>
            {shopStock.map((row) => (
              <option key={row.id} value={row.id}>
                {deviceLabel(row)} · {row.product.name} · {formatCurrency(row.product.sellingPrice)}
              </option>
            ))}
          </Select>
          <Input
            name="replacementValue"
            type="number"
            min={0}
            value={replacementValue}
            onChange={(event) => setReplacementValue(event.target.value)}
            placeholder="Value of the replacement given out"
            required
          />
          {pickedReplacement ? (
            <p className="text-sm text-muted-foreground">
              Replacement list price: {formatCurrency(pickedReplacement.product.sellingPrice)}. You can change the value if you agreed a different figure.
            </p>
          ) : null}
          <p className="text-sm font-medium">
            {!replacementId || !Number.isFinite(returnAmount)
              ? "Balance shows after you pick the replacement and both values."
              : balance > 0
                ? `Receivable (customer pays us): ${formatCurrency(balance)}`
                : balance < 0
                  ? `Payable (we pay / refund the customer): ${formatCurrency(Math.abs(balance))}`
                  : "Balance: even. No money either way."}
          </p>
        </>
      ) : outcome === "REFUND" || outcome === "CREDIT_NOTE" ? (
        <p className="text-sm text-muted-foreground">
          {outcome === "REFUND" ? "Refund" : "Credit note"} will use the return item value above.
        </p>
      ) : null}

      <Textarea name="notes" placeholder="What the customer told you" />
    </ActionForm>
  )
}
