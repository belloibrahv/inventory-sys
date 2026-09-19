"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { createReturn, findSoldImei } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { Button } from "@/components/ui/button"
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

function mapFoundSold(row: {
  id: string
  imei1: string
  serialNumber: string | null
  branchId: string
  product: { name: string; sellingPrice: unknown; warrantyDays: number }
  customer: { name: string } | null
  sale: {
    invoiceNumber: string
    saleDate: Date
    items: Array<{ imeiId: string | null; totalPrice: unknown }>
  } | null
  branch: { code: string }
}): Sold {
  return {
    id: row.id,
    imei1: row.imei1,
    serialNumber: row.serialNumber,
    branchId: row.branchId,
    product: {
      name: row.product.name,
      sellingPrice: money(row.product.sellingPrice),
      warrantyDays: row.product.warrantyDays,
    },
    customer: row.customer ? { name: row.customer.name } : null,
    sale: row.sale
      ? {
          invoiceNumber: row.sale.invoiceNumber,
          saleDate: row.sale.saleDate,
          items: row.sale.items.map((item) => ({
            imeiId: item.imeiId,
            totalPrice: money(item.totalPrice),
          })),
        }
      : null,
    branch: { code: row.branch.code },
  }
}

export function ReturnForm({ sold, stock }: { sold: Sold[]; stock: StockUnit[] }) {
  const [extraSold, setExtraSold] = useState<Sold[]>([])
  const [findCode, setFindCode] = useState("")
  const [finding, setFinding] = useState(false)
  const soldList = useMemo(() => {
    const seen = new Set(sold.map((row) => row.imei1))
    return [...sold, ...extraSold.filter((row) => !seen.has(row.imei1))]
  }, [sold, extraSold])
  const [imei1, setImei1] = useState(sold[0]?.imei1 ?? "")
  const [outcome, setOutcome] = useState("REPAIR")
  const [returnValue, setReturnValue] = useState("")
  const [replacementId, setReplacementId] = useState("")
  const [replacementValue, setReplacementValue] = useState("")

  const selected = useMemo(() => soldList.find((row) => row.imei1 === imei1), [soldList, imei1])
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

  function pickSold(next: string, list: Sold[] = soldList) {
    setImei1(next)
    const hit = list.find((row) => row.imei1 === next)
    const nextLine = hit?.sale?.items.find((item) => item.imeiId === hit.id)
    const nextValue = money(nextLine?.totalPrice) || money(hit?.product.sellingPrice)
    setReturnValue(nextValue ? String(nextValue) : "")
    setReplacementId("")
    setReplacementValue("")
  }

  async function lookupSold() {
    const code = findCode.trim()
    if (!code) {
      toast.error("Type or paste the sold IMEI first.")
      return
    }
    setFinding(true)
    const result = await findSoldImei(code)
    setFinding(false)
    if ("error" in result && result.error) {
      toast.error(result.error)
      return
    }
    if (!("sold" in result) || !result.sold) {
      toast.error("That IMEI was not found.")
      return
    }
    const mapped = mapFoundSold(result.sold)
    const nextList = [...extraSold.filter((row) => row.imei1 !== mapped.imei1), mapped]
    setExtraSold(nextList)
    pickSold(mapped.imei1, [...sold, ...nextList])
    setFindCode("")
    toast.success("Sold phone found. Check the details, then save the return.")
  }

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
      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-xs font-medium text-muted-foreground">Find a sold IMEI if it is not in the list</p>
        <div className="flex flex-wrap gap-2">
          <Input
            value={findCode}
            onChange={(event) => setFindCode(event.target.value)}
            placeholder="Type or paste sold IMEI"
            aria-label="Type or paste sold IMEI"
            className="min-w-[12rem] flex-1"
          />
          <Button type="button" variant="outline" onClick={() => void lookupSold()} disabled={finding}>
            {finding ? "Looking up this IMEI" : "Find sold IMEI"}
          </Button>
        </div>
      </div>

      <Select
        name="imei1"
        value={imei1}
        onChange={(event) => pickSold(event.target.value)}
        required
        emptyLabel="This shop has not sold any phone yet. A return needs a phone that this shop sold with a buyer name."
      >
        {soldList.map((row) => (
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
        <p className="text-sm text-danger">No IMEI has been sold here. Use Find sold IMEI, or attach a buyer name on the invoice first.</p>
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
