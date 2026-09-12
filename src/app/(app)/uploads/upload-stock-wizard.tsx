"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PlusCircle, Trash2, CheckCircle2, Loader2, PackagePlus } from "lucide-react"
import { toast } from "sonner"
import { batchUploadStock, type BatchUploadItem, type BatchUploadPayload, type UploadResult } from "@/app/actions/uploads"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency, generateDocNumber } from "@/lib/utils"

type Shop = { id: string; name: string; code: string }
type Supplier = { id: string; name: string; city: string | null; country: string | null }
type Brand = { id: string; name: string }
type Category = { id: string; name: string }
type Product = {
  id: string
  name: string
  sku: string
  tracking: "IMEI" | "SERIAL" | "NONE"
  costPrice: number
  brand: { name: string }
}

export function UploadStockWizard({
  shops,
  suppliers,
  products,
}: {
  shops: Shop[]
  suppliers: Supplier[]
  brands: Brand[]
  categories: Category[]
  products: Product[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const defaultPo = generateDocNumber("PO")
  
  // Header state
  const [invoiceNumber, setInvoiceNumber] = useState(defaultPo)
  const [uploadDate, setUploadDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [branchId, setBranchId] = useState(shops[0]?.id || "")
  const [supplierMode, setSupplierMode] = useState<"existing" | "new">(suppliers.length ? "existing" : "new")
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "")
  const [newSupplierName, setNewSupplierName] = useState("")
  const [newSupplierPhone, setNewSupplierPhone] = useState("")
  const [newSupplierCountry, setNewSupplierCountry] = useState("")
  const [newSupplierCity, setNewSupplierCity] = useState("")
  const [notes, setNotes] = useState("")

  // Item Lines state
  const [items, setItems] = useState<BatchUploadItem[]>([
    {
      productMode: "existing",
      productId: products[0]?.id || "",
      costPrice: products[0]?.costPrice || 0,
      quantity: 1,
      tracking: products[0]?.tracking || "IMEI",
      identities: [""],
    },
  ])

  // Payment state
  const [amountPaid, setAmountPaid] = useState<number>(0)

  // Calculations
  const totalInvoiceValue = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.costPrice) || 0), 0)
  const balanceOwed = Math.max(0, totalInvoiceValue - amountPaid)
  const isFullyPaid = totalInvoiceValue > 0 && amountPaid >= totalInvoiceValue

  function handleProductSelect(index: number, prodId: string) {
    const prod = products.find((p) => p.id === prodId)
    if (!prod) return
    setItems((prev) => {
      const copy = [...prev]
      const currentQty = copy[index].quantity || 1
      copy[index] = {
        ...copy[index],
        productId: prod.id,
        costPrice: prod.costPrice,
        tracking: prod.tracking,
        identities: prod.tracking === "NONE" ? [] : Array.from({ length: currentQty }, (_, i) => copy[index].identities?.[i] || ""),
      }
      return copy
    })
  }

  function handleQuantityChange(index: number, qty: number) {
    const safeQty = Math.max(1, Math.floor(qty) || 1)
    setItems((prev) => {
      const copy = [...prev]
      const item = copy[index]
      const prevIds = item.identities || []
      const newIds =
        item.tracking === "NONE"
          ? []
          : Array.from({ length: safeQty }, (_, i) => prevIds[i] || "")
      copy[index] = {
        ...item,
        quantity: safeQty,
        identities: newIds,
      }
      return copy
    })
  }

  function handleIdentityChange(itemIndex: number, idIndex: number, value: string) {
    setItems((prev) => {
      const copy = [...prev]
      const item = { ...copy[itemIndex] }
      const ids = [...(item.identities || [])]
      ids[idIndex] = value.replace(/[\s-]/g, "")
      item.identities = ids
      copy[itemIndex] = item
      return copy
    })
  }

  function addItemLine() {
    setItems((prev) => [
      ...prev,
      {
        productMode: "existing",
        productId: products[0]?.id || "",
        costPrice: products[0]?.costPrice || 0,
        quantity: 1,
        tracking: products[0]?.tracking || "IMEI",
        identities: products[0]?.tracking === "NONE" ? [] : [""],
      },
    ])
  }

  function removeItemLine(index: number) {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!branchId) {
      toast.error("Please select a destination shop.")
      return
    }
    if (supplierMode === "existing" && !supplierId) {
      toast.error("Please select a supplier.")
      return
    }
    if (supplierMode === "new" && !newSupplierName.trim()) {
      toast.error("Please enter a new supplier name.")
      return
    }

    // Validate IMEI rows
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.tracking !== "NONE") {
        const ids = (item.identities || []).filter(Boolean)
        if (ids.length < item.quantity) {
          toast.error(`Item line #${i + 1} is missing ${item.quantity - ids.length} ${item.tracking === "IMEI" ? "IMEI" : "serial"} numbers.`)
          return
        }
      }
    }

    setBusy(true)
    const payload: BatchUploadPayload = {
      branchId,
      supplierId: supplierMode === "existing" ? supplierId : undefined,
      newSupplierName: supplierMode === "new" ? newSupplierName.trim() : undefined,
      newSupplierPhone: supplierMode === "new" ? newSupplierPhone.trim() : undefined,
      newSupplierCountry: supplierMode === "new" ? newSupplierCountry.trim() : undefined,
      newSupplierCity: supplierMode === "new" ? newSupplierCity.trim() : undefined,
      invoiceNumber,
      uploadDate,
      amountPaid,
      notes: notes.trim() || undefined,
      items,
    }

    let result: UploadResult
    try {
      result = await batchUploadStock(payload)
    } catch {
      setBusy(false)
      toast.error("That did not reach the shop system. Check your connection and try once more.")
      return
    }
    setBusy(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(
      `Stock uploaded successfully on ${result.invoiceNumber}! ${result.phones ? `${result.phones} phones booked` : ""} ${result.pieces ? `${result.pieces} pieces added` : ""}. ${result.paid ? "Fully settled." : `Owed: ${formatCurrency(result.balanceOwed ?? 0)}`}`
    )

    // Reset form with new PO
    setInvoiceNumber(generateDocNumber("PO"))
    setAmountPaid(0)
    setNotes("")
    setItems([
      {
        productMode: "existing",
        productId: products[0]?.id || "",
        costPrice: products[0]?.costPrice || 0,
        quantity: 1,
        tracking: products[0]?.tracking || "IMEI",
        identities: [""],
      },
    ])
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="surface-card space-y-6 p-5 sm:p-6 border-primary/20">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Upload Stock & Goods Inward</p>
            <h2 className="text-xl font-bold tracking-tight">Supplier Upload Bill</h2>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-right">
            <span className="text-[11px] font-medium text-muted-foreground uppercase">Generated Invoice ID</span>
            <p className="font-mono text-base font-bold text-primary">{invoiceNumber}</p>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Input supplier and upload details, list items with auto-generated IMEI scan rows, and record initial payments.
        </p>
      </div>

      {/* 1. Supplier & Destination Shop */}
      <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 sm:p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">1</span>
          Supplier & Destination Shop
        </h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Destination Shop</label>
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} required disabled={busy}>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name} ({shop.code})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Upload Date</label>
            <Input
              type="date"
              value={uploadDate}
              onChange={(e) => setUploadDate(e.target.value)}
              required
              disabled={busy}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Supplier Mode</label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={supplierMode === "existing" ? "default" : "outline"}
                onClick={() => setSupplierMode("existing")}
                disabled={busy || suppliers.length === 0}
                className="flex-1"
              >
                Existing
              </Button>
              <Button
                type="button"
                size="sm"
                variant={supplierMode === "new" ? "default" : "outline"}
                onClick={() => setSupplierMode("new")}
                disabled={busy}
                className="flex-1"
              >
                + New Supplier
              </Button>
            </div>
          </div>
        </div>

        {supplierMode === "existing" ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Select Supplier</label>
            <Select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              required
              disabled={busy || suppliers.length === 0}
              emptyLabel="No suppliers in the system yet. Click + New Supplier."
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.city || s.country ? `· ${[s.city, s.country].filter(Boolean).join(", ")}` : ""}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div className="grid gap-3 rounded-xl border border-dashed border-border bg-background p-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Supplier Name *</label>
              <Input
                placeholder="e.g. Shenzhen Tech Link / UK Direct"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                required
                disabled={busy}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone Number</label>
              <Input
                placeholder="e.g. +234... or international"
                value={newSupplierPhone}
                onChange={(e) => setNewSupplierPhone(e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Country</label>
              <Input
                placeholder="e.g. China / UAE / UK / Nigeria"
                value={newSupplierCountry}
                onChange={(e) => setNewSupplierCountry(e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">City / Market</label>
              <Input
                placeholder="e.g. Shenzhen / Dubai / Lagos"
                value={newSupplierCity}
                onChange={(e) => setNewSupplierCity(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. List of Items to Upload */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">2</span>
            Items to Upload
          </h3>
          <Button type="button" size="sm" variant="outline" onClick={addItemLine} disabled={busy}>
            <PlusCircle className="mr-1 h-4 w-4" />
            Add Another Item
          </Button>
        </div>

        <div className="space-y-4">
          {items.map((item, itemIdx) => {
            return (
              <div key={itemIdx} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">Item #{itemIdx + 1}</span>
                    <span className="text-xs text-muted-foreground">
                      Tracking: <strong className="text-foreground">{item.tracking}</strong>
                    </span>
                  </div>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      onClick={() => removeItemLine(itemIdx)}
                      disabled={busy}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove Line
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-6">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Product Name</label>
                    <Select
                      value={item.productId}
                      onChange={(e) => handleProductSelect(itemIdx, e.target.value)}
                      disabled={busy}
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.brand.name} · {p.tracking} · cost {formatCurrency(p.costPrice)}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Unit Cost Price (₦)</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.costPrice || ""}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0
                        setItems((prev) => {
                          const copy = [...prev]
                          copy[itemIdx] = { ...copy[itemIdx], costPrice: val }
                          return copy
                        })
                      }}
                      required
                      disabled={busy}
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Quantity to Upload</label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={item.quantity}
                      onChange={(e) => handleQuantityChange(itemIdx, Number(e.target.value))}
                      required
                      disabled={busy}
                    />
                  </div>
                </div>

                {/* Subtotal line */}
                <div className="flex justify-between items-center text-xs text-muted-foreground bg-muted/20 px-3 py-1.5 rounded-lg">
                  <span>Line Total: <strong>{formatCurrency((item.quantity || 0) * (item.costPrice || 0))}</strong></span>
                  <span>{item.quantity} unit(s) @ {formatCurrency(item.costPrice || 0)} each</span>
                </div>

                {/* Dynamic IMEI / Serial Scanning Fields */}
                {item.tracking !== "NONE" && (
                  <div className="rounded-xl border border-primary/20 bg-primary/[0.02] p-3 space-y-2">
                    <p className="text-xs font-semibold text-primary">
                      Scan or enter {item.quantity} {item.tracking === "IMEI" ? "IMEI numbers" : "Serial numbers"} for this batch:
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Array.from({ length: item.quantity }).map((_, idIdx) => (
                        <div key={idIdx} className="flex items-center gap-2">
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground w-6">#{idIdx + 1}</span>
                          <Input
                            placeholder={`Type or scan ${item.tracking === "IMEI" ? "15-digit IMEI" : "serial"}`}
                            value={item.identities?.[idIdx] || ""}
                            onChange={(e) => handleIdentityChange(itemIdx, idIdx, e.target.value)}
                            required
                            disabled={busy}
                            autoComplete="off"
                            className="font-mono text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 3. Payment Column & Financial Settlement */}
      <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 sm:p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">3</span>
          Payment & Financial Settlement
        </h3>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-background p-4 border border-border">
            <span className="text-xs font-medium text-muted-foreground uppercase">Total Upload Value</span>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-1">{formatCurrency(totalInvoiceValue)}</p>
            <p className="text-xs text-muted-foreground mt-1">Calculated from {items.length} line(s)</p>
          </div>

          <div className="rounded-xl bg-background p-4 border border-border">
            <label className="block text-xs font-medium text-muted-foreground uppercase mb-1">
              Amount Paid Now (₦)
            </label>
            <Input
              type="number"
              min={0}
              max={totalInvoiceValue * 2}
              step="0.01"
              value={amountPaid || ""}
              onChange={(e) => {
                setAmountPaid(Math.max(0, Number(e.target.value) || 0))
              }}
              placeholder="0.00"
              disabled={busy}
              className="text-lg font-bold tabular-nums min-h-11"
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setAmountPaid(totalInvoiceValue)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Set Full (₦{totalInvoiceValue.toLocaleString("en-NG")})
              </button>
              <span className="text-muted-foreground text-[11px]">·</span>
              <button
                type="button"
                onClick={() => setAmountPaid(0)}
                className="text-[11px] font-medium text-muted-foreground hover:underline"
              >
                Set Zero (Unpaid)
              </button>
            </div>
          </div>

          <div className={`rounded-xl p-4 border ${isFullyPaid ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200" : "bg-background border-border"}`}>
            <span className="text-xs font-medium text-muted-foreground uppercase">Remaining Balance</span>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${balanceOwed > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {formatCurrency(balanceOwed)}
            </p>
            <div className="mt-1">
              {isFullyPaid ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Invoice Fully Cleared
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {amountPaid > 0 ? "Partially paid · balance stays owed" : "Unpaid invoice · balance stays owed"}
                </span>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Optional Upload Notes / Carton Reference</label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Carton #4 from Dubai cargo, waybill #88392"
            disabled={busy}
          />
        </div>
      </div>

      {/* 4. Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-border">
        <div className="text-sm">
          <span className="text-muted-foreground">Ready to book: </span>
          <strong className="text-foreground">{items.reduce((s, i) => s + (i.quantity || 0), 0)} unit(s)</strong>
          <span className="text-muted-foreground"> totaling </span>
          <strong className="text-primary">{formatCurrency(totalInvoiceValue)}</strong>
        </div>

        <Button type="submit" size="lg" disabled={busy || totalInvoiceValue <= 0} className="min-w-48 font-semibold">
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading stock...
            </>
          ) : (
            <>
              <PackagePlus className="mr-2 h-4 w-4" />
              Upload Stock to Shop
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
