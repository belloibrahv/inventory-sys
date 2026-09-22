"use client"

import { useMemo, useState } from "react"
import { Package, Smartphone, Search, ReceiptText, Info, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { createReturn, findSoldImei, findSaleByInvoice } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency, money } from "@/lib/utils"
import { warrantyState } from "@/lib/warranty"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type Sold = {
  id: string
  imei1: string
  serialNumber?: string | null
  branchId: string
  product: { name: string; sellingPrice: number; warrantyDays: number }
  customer: { name: string } | null
  sale: {
    invoiceNumber: string
    saleDate: Date
    items: Array<{ imeiId: string | null; totalPrice: number }>
  } | null
  branch: { code: string }
}

type SaleLineItem = {
  id: string
  productId: string
  quantity: number
  unitPrice: number
  totalPrice: number
  product: {
    name: string
    sellingPrice: number
    category: { name: string } | null
  }
  imei: { imei1: string } | null
}

type FoundSale = {
  id: string
  invoiceNumber: string
  saleDate: Date
  branchId: string
  customer: { id: string; name: string } | null
  branch: { code: string; name: string }
  items: SaleLineItem[]
}

type StockUnit = {
  id: string
  imei1: string
  serialNumber: string | null
  branchId: string
  product: { name: string; sellingPrice: number }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REASONS = [
  { value: "FAULTY", label: "Faulty" },
  { value: "WARRANTY", label: "Under warranty" },
  { value: "CUSTOMER_DISSATISFACTION", label: "Customer not satisfied" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "WRONG_PRODUCT", label: "Wrong product" },
  { value: "SUPPLIER_RETURN", label: "Send toward supplier" },
] as const

const FAULTS = [
  { value: "GOOD_STOCK", label: "Good — put back on shelf" },
  { value: "FAULTY_STOCK", label: "Faulty — not for sale" },
  { value: "REPAIR_STOCK", label: "Needs repair" },
  { value: "SCRAP_STOCK", label: "Scrap — write off" },
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function mapFoundSale(raw: {
  id: string
  invoiceNumber: string
  saleDate: Date
  branchId: string
  customer: { id: string; name: string } | null
  branch: { code: string; name: string }
  items: Array<{
    id: string
    productId: string
    quantity: number
    unitPrice: unknown
    totalPrice: unknown
    product: {
      name: string
      sellingPrice: unknown
      category: { name: string } | null
    }
    imei: { imei1: string } | null
  }>
}): FoundSale {
  return {
    id: raw.id,
    invoiceNumber: raw.invoiceNumber,
    saleDate: raw.saleDate,
    branchId: raw.branchId,
    customer: raw.customer,
    branch: raw.branch,
    items: raw.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      totalPrice: money(item.totalPrice),
      product: {
        name: item.product.name,
        sellingPrice: money(item.product.sellingPrice),
        category: item.product.category,
      },
      imei: item.imei ? { imei1: item.imei.imei1 } : null,
    })),
  }
}

// ─── Tab Switcher ─────────────────────────────────────────────────────────────

function TabBar({
  active,
  onChange,
}: {
  active: "imei" | "invoice"
  onChange: (v: "imei" | "invoice") => void
}) {
  return (
    <div className="flex rounded-xl border border-border bg-muted/40 p-1 gap-1">
      <button
        type="button"
        onClick={() => onChange("imei")}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active === "imei"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Smartphone className="h-4 w-4 shrink-0" />
        Phone or laptop
      </button>
      <button
        type="button"
        onClick={() => onChange("invoice")}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active === "invoice"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Package className="h-4 w-4 shrink-0" />
        Other item by invoice
      </button>
    </div>
  )
}

// ─── Shared outcome + fault + notes fields ────────────────────────────────────

function OutcomeFields({
  outcome,
  onOutcomeChange,
  returnValue,
  onReturnValueChange,
  suggestedReturn,
  shopStock,
  branchId,
  isInvoicePath,
}: {
  outcome: string
  onOutcomeChange: (v: string) => void
  returnValue: string
  onReturnValueChange: (v: string) => void
  suggestedReturn: number
  shopStock: StockUnit[]
  branchId: string | null
  isInvoicePath: boolean
}) {
  const [replacementId, setReplacementId] = useState("")
  const [replacementValue, setReplacementValue] = useState("")

  const filteredStock = branchId ? shopStock.filter((r) => r.branchId === branchId) : shopStock
  const pickedReplacement = filteredStock.find((r) => r.id === replacementId)
  const returnAmount = Number(returnValue !== "" ? returnValue : suggestedReturn || 0)
  const givenAmount = Number(replacementValue || 0)
  const balance = givenAmount - returnAmount
  const isReplace = outcome === "REPLACEMENT"

  // Reset replacement when outcome changes
  const handleOutcome = (v: string) => {
    onOutcomeChange(v)
    setReplacementId("")
    setReplacementValue("")
  }

  // Outcomes available for non-IMEI items (no send-to-supplier, no repair for accessories)
  const outcomeOptions = isInvoicePath
    ? [
        { value: "REFUND", label: "Refund" },
        { value: "CREDIT_NOTE", label: "Credit note" },
        { value: "REPLACEMENT", label: "Replace from our stock" },
      ]
    : [
        { value: "REPAIR", label: "Repair" },
        { value: "REPLACEMENT", label: "Replace from our stock" },
        { value: "REFUND", label: "Refund" },
        { value: "CREDIT_NOTE", label: "Credit note" },
        { value: "SEND_TO_SUPPLIER", label: "Send back to the supplier" },
      ]

  return (
    <div className="space-y-3">
      {/* Return reason */}
      <div className="space-y-1.5">
        <Label htmlFor="reason-select">Why is it coming back?</Label>
        <Select id="reason-select" name="reason" defaultValue="FAULTY">
          {REASONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Outcome */}
      <div className="space-y-1.5">
        <Label htmlFor="outcome-select">What happens next?</Label>
        <Select
          id="outcome-select"
          name="outcome"
          value={outcome}
          onChange={(e) => handleOutcome(e.target.value)}
          required
        >
          {outcomeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Fault classification — not needed for refund/credit on accessories */}
      {(!isInvoicePath || (outcome !== "REFUND" && outcome !== "CREDIT_NOTE")) && (
        <div className="space-y-1.5">
          <Label htmlFor="fault-select">Condition of the returned item</Label>
          <Select id="fault-select" name="faultClass" defaultValue="FAULTY_STOCK">
            {FAULTS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      {/* Return value */}
      <div className="space-y-1.5">
        <Label htmlFor="return-value-input">Return item value (₦)</Label>
        <Input
          id="return-value-input"
          name="returnValue"
          type="number"
          min={0}
          value={returnValue !== "" ? returnValue : String(suggestedReturn || "")}
          onChange={(e) => onReturnValueChange(e.target.value)}
          placeholder="Return item value"
          required
        />
        {suggestedReturn > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Suggested from original sale: {formatCurrency(suggestedReturn)}
          </p>
        )}
      </div>

      {/* Replacement picker */}
      {isReplace && (
        <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3">
          <p className="text-sm font-medium">Replacement item going out</p>
          <div className="space-y-1.5">
            <Label htmlFor="replacement-select">Pick In shop item</Label>
            <Select
              id="replacement-select"
              name="replacementImeiId"
              value={replacementId}
              onChange={(e) => {
                const next = e.target.value
                setReplacementId(next)
                const hit = filteredStock.find((r) => r.id === next)
                if (hit) setReplacementValue(String(hit.product.sellingPrice))
              }}
              required
              emptyLabel="No In shop item is ready to give out."
            >
              <option value="">Pick the item to give out</option>
              {filteredStock.map((row) => (
                <option key={row.id} value={row.id}>
                  {deviceLabel(row)} · {row.product.name} · {formatCurrency(row.product.sellingPrice)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="replacement-value-input">Value of item given out (₦)</Label>
            <Input
              id="replacement-value-input"
              name="replacementValue"
              type="number"
              min={0}
              value={replacementValue}
              onChange={(e) => setReplacementValue(e.target.value)}
              placeholder="Value of the replacement"
              required
            />
            {pickedReplacement && (
              <p className="text-xs text-muted-foreground">
                List price: {formatCurrency(pickedReplacement.product.sellingPrice)}. Change if a different figure was agreed.
              </p>
            )}
          </div>
          {/* Balance indicator */}
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-sm font-medium",
              !replacementId || !Number.isFinite(returnAmount)
                ? "border-border bg-muted/30 text-muted-foreground"
                : balance > 0
                  ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                  : balance < 0
                    ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400"
                    : "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400"
            )}
          >
            {!replacementId || !Number.isFinite(returnAmount)
              ? "Balance shows after you pick the replacement and both values."
              : balance > 0
                ? `Receivable — customer pays us ${formatCurrency(balance)}`
                : balance < 0
                  ? `Payable — we refund the customer ${formatCurrency(Math.abs(balance))}`
                  : "Balance is even — no money either way."}
          </div>
        </div>
      )}

      {(outcome === "REFUND" || outcome === "CREDIT_NOTE") && !isReplace && (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {outcome === "REFUND" ? "Refund" : "Credit note"} will use the return item value above.
          The original invoice stays on the books.
        </p>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes-textarea">Notes (optional)</Label>
        <Textarea id="notes-textarea" name="notes" placeholder="What the customer told you" />
      </div>
    </div>
  )
}

// ─── IMEI path sub-form ───────────────────────────────────────────────────────

function ImeiReturnForm({
  sold,
  stock,
}: {
  sold: Sold[]
  stock: StockUnit[]
}) {
  const [extraSold, setExtraSold] = useState<Sold[]>([])
  const [findCode, setFindCode] = useState("")
  const [finding, setFinding] = useState(false)
  const [outcome, setOutcome] = useState("REPAIR")
  const [returnValue, setReturnValue] = useState("")

  const soldList = useMemo(() => {
    const seen = new Set(sold.map((r) => r.imei1))
    return [...sold, ...extraSold.filter((r) => !seen.has(r.imei1))]
  }, [sold, extraSold])

  const [imei1, setImei1] = useState(sold[0]?.imei1 ?? "")
  const selected = useMemo(() => soldList.find((r) => r.imei1 === imei1), [soldList, imei1])
  const line = selected?.sale?.items.find((item) => item.imeiId === selected.id)
  const suggestedReturn = money(line?.totalPrice) || money(selected?.product.sellingPrice)
  const warranty = selected?.sale ? warrantyState(selected.sale.saleDate, selected.product.warrantyDays) : null

  function pickSold(next: string, list: Sold[] = soldList) {
    setImei1(next)
    const hit = list.find((r) => r.imei1 === next)
    const nextLine = hit?.sale?.items.find((item) => item.imeiId === hit.id)
    const nextValue = money(nextLine?.totalPrice) || money(hit?.product.sellingPrice)
    setReturnValue(nextValue ? String(nextValue) : "")
  }

  async function lookupSold() {
    const code = findCode.trim()
    if (!code) { toast.error("Type or paste the sold IMEI first."); return }
    setFinding(true)
    const result = await findSoldImei(code)
    setFinding(false)
    if ("error" in result && result.error) { toast.error(result.error); return }
    if (!("sold" in result) || !result.sold) { toast.error("That IMEI was not found."); return }
    const mapped = mapFoundSold(result.sold)
    const nextList = [...extraSold.filter((r) => r.imei1 !== mapped.imei1), mapped]
    setExtraSold(nextList)
    pickSold(mapped.imei1, [...sold, ...nextList])
    setFindCode("")
    toast.success("Sold phone found. Check the details below.")
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
      className="space-y-4"
    >
      <input type="hidden" name="returnMode" value="imei" />

      {/* Find by IMEI */}
      <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Find IMEI not in the list below
        </p>
        <div className="flex gap-2">
          <Input
            value={findCode}
            onChange={(e) => setFindCode(e.target.value)}
            placeholder="Type or scan the sold IMEI"
            aria-label="Type or scan the sold IMEI"
            className="flex-1"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void lookupSold() } }}
          />
          <Button type="button" variant="outline" onClick={() => void lookupSold()} disabled={finding} className="shrink-0">
            {finding ? "Looking up" : <><Search className="h-4 w-4" /> Find</>}
          </Button>
        </div>
      </div>

      {/* Sold device picker */}
      <div className="space-y-1.5">
        <Label htmlFor="imei-select">Sold device</Label>
        <Select
          id="imei-select"
          name="imei1"
          value={imei1}
          onChange={(e) => pickSold(e.target.value)}
          required
          emptyLabel="This shop has not sold any device yet. A return needs a device that was sold with a buyer name."
        >
          {soldList.map((row) => (
            <option key={row.imei1} value={row.imei1}>
              {deviceLabel(row)} · {row.product.name} · {row.customer?.name ?? "Walk-in"}
            </option>
          ))}
        </Select>
      </div>

      {/* Selected device card */}
      {selected ? (
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-1">
          <p className="font-semibold text-sm">{selected.product.name}</p>
          <p className="text-xs text-muted-foreground">
            {deviceLabel(selected)}
            {selected.sale ? ` · Invoice ${selected.sale.invoiceNumber}` : ""}
            {" · "}{selected.branch.code}
          </p>
          {selected.customer && (
            <p className="text-xs text-muted-foreground">Buyer: {selected.customer.name}</p>
          )}
          {warranty && (
            <p className={cn(
              "text-xs font-medium",
              warranty.active ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
            )}>
              {warranty.label}
            </p>
          )}
          <p className="text-xs font-medium pt-0.5">
            Original sale line: {formatCurrency(suggestedReturn)}
          </p>
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          No device found. Use the search above, or attach a buyer name on the invoice first.
        </p>
      )}

      <OutcomeFields
        outcome={outcome}
        onOutcomeChange={setOutcome}
        returnValue={returnValue}
        onReturnValueChange={setReturnValue}
        suggestedReturn={suggestedReturn}
        shopStock={stock}
        branchId={selected?.branchId ?? null}
        isInvoicePath={false}
      />
    </ActionForm>
  )
}

// ─── Invoice path sub-form ────────────────────────────────────────────────────

function InvoiceReturnForm({ stock }: { stock: StockUnit[] }) {
  const [invoiceInput, setInvoiceInput] = useState("")
  const [finding, setFinding] = useState(false)
  const [foundSale, setFoundSale] = useState<FoundSale | null>(null)
  const [selectedItemId, setSelectedItemId] = useState("")
  const [returnQty, setReturnQty] = useState("1")
  const [outcome, setOutcome] = useState("REFUND")
  const [returnValue, setReturnValue] = useState("")

  async function lookupInvoice() {
    const inv = invoiceInput.trim()
    if (!inv) { toast.error("Type the invoice number first."); return }
    setFinding(true)
    const result = await findSaleByInvoice(inv)
    setFinding(false)
    if ("error" in result && result.error) { toast.error(result.error); return }
    if (!("sale" in result) || !result.sale) { toast.error("Invoice not found."); return }
    // Filter out IMEI items — they must go through the IMEI path
    const mapped = mapFoundSale(result.sale)
    const nonImeiItems = mapped.items.filter((item) => !item.imei)
    if (nonImeiItems.length === 0) {
      toast.error("That invoice has only phones or laptops. Use the Phone or laptop tab to return them by IMEI.")
      return
    }
    setFoundSale({ ...mapped, items: nonImeiItems })
    setSelectedItemId(nonImeiItems[0]?.id ?? "")
    const first = nonImeiItems[0]
    if (first) {
      const unitPrice = first.totalPrice / Math.max(1, first.quantity)
      setReturnValue(String(unitPrice))
    }
    setReturnQty("1")
    toast.success(`Invoice ${mapped.invoiceNumber} found — ${nonImeiItems.length} item${nonImeiItems.length !== 1 ? "s" : ""} available.`)
  }

  const selectedItem = foundSale?.items.find((item) => item.id === selectedItemId)
  const qty = Math.max(1, Math.min(Number(returnQty) || 1, selectedItem?.quantity ?? 1))
  const unitPrice = selectedItem ? selectedItem.totalPrice / Math.max(1, selectedItem.quantity) : 0
  const suggestedReturn = unitPrice * qty

  function handleItemChange(itemId: string) {
    setSelectedItemId(itemId)
    const item = foundSale?.items.find((i) => i.id === itemId)
    if (item) {
      const up = item.totalPrice / Math.max(1, item.quantity)
      setReturnValue(String(up))
      setReturnQty("1")
    }
  }

  function handleQtyChange(v: string) {
    setReturnQty(v)
    const n = Number(v) || 1
    const newQty = Math.max(1, Math.min(n, selectedItem?.quantity ?? 1))
    setReturnValue(String(unitPrice * newQty))
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
      className="space-y-4"
    >
      <input type="hidden" name="returnMode" value="invoice" />
      {selectedItem && <input type="hidden" name="saleItemId" value={selectedItem.id} />}
      {selectedItem && <input type="hidden" name="returnQty" value={String(qty)} />}

      {/* Invoice lookup */}
      <div className="space-y-2">
        <Label htmlFor="invoice-input">Invoice number</Label>
        <div className="flex gap-2">
          <Input
            id="invoice-input"
            value={invoiceInput}
            onChange={(e) => setInvoiceInput(e.target.value.toUpperCase())}
            placeholder="e.g. INV-20260921-0042"
            aria-label="Invoice number"
            className="flex-1 font-mono"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void lookupInvoice() } }}
          />
          <Button type="button" variant="outline" onClick={() => void lookupInvoice()} disabled={finding} className="shrink-0">
            {finding ? "Looking up" : <><Search className="h-4 w-4" /> Find</>}
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ReceiptText className="h-3.5 w-3.5 shrink-0" />
          Type the invoice number from the receipt. The items on that sale will appear below.
        </p>
      </div>

      {/* Found sale summary */}
      {foundSale && (
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{foundSale.invoiceNumber}</p>
              <p className="text-xs text-muted-foreground">
                {foundSale.branch.name}
                {foundSale.customer ? ` · ${foundSale.customer.name}` : ""}
              </p>
            </div>
            <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
              Invoice found
            </span>
          </div>

          {/* Item picker */}
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="item-select">Which item is being returned?</Label>
            <Select
              id="item-select"
              value={selectedItemId}
              onChange={(e) => handleItemChange(e.target.value)}
              required
            >
              {foundSale.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.product.name}
                  {item.product.category ? ` (${item.product.category.name})` : ""}
                  {" · "}Qty {item.quantity}
                  {" · "}{formatCurrency(item.totalPrice)}
                </option>
              ))}
            </Select>
          </div>

          {/* Quantity to return */}
          {selectedItem && selectedItem.quantity > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="return-qty-input">
                How many are coming back? (max {selectedItem.quantity})
              </Label>
              <Input
                id="return-qty-input"
                type="number"
                min={1}
                max={selectedItem.quantity}
                value={returnQty}
                onChange={(e) => handleQtyChange(e.target.value)}
              />
            </div>
          )}

          {/* Selected item detail */}
          {selectedItem && (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
              <p className="font-medium text-foreground">{selectedItem.product.name}</p>
              <p>Sold qty: {selectedItem.quantity} · Line total: {formatCurrency(selectedItem.totalPrice)}</p>
              <p>Unit price: {formatCurrency(unitPrice)} · Returning: {qty}</p>
            </div>
          )}
        </div>
      )}

      {/* Empty state before lookup */}
      {!foundSale && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <ReceiptText className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Enter the invoice number above to see what can be returned.</p>
        </div>
      )}

      {/* Outcome + fault + value fields — only shown once an item is selected */}
      {selectedItem && (
        <OutcomeFields
          outcome={outcome}
          onOutcomeChange={setOutcome}
          returnValue={returnValue}
          onReturnValueChange={setReturnValue}
          suggestedReturn={suggestedReturn}
          shopStock={stock}
          branchId={foundSale?.branchId ?? null}
          isInvoicePath={true}
        />
      )}
    </ActionForm>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ReturnForm({ sold, stock }: { sold: Sold[]; stock: StockUnit[] }) {
  const [tab, setTab] = useState<"imei" | "invoice">("imei")

  return (
    <div className="space-y-4">
      <TabBar active={tab} onChange={setTab} />
      {tab === "imei" ? (
        <ImeiReturnForm sold={sold} stock={stock} />
      ) : (
        <InvoiceReturnForm stock={stock} />
      )}
    </div>
  )
}
