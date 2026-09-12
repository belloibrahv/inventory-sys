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

  const unitCount = items.reduce((sum, item) => sum + (item.quantity || 0), 0)

  return (
    <form onSubmit={handleSubmit} className="surface-card overflow-hidden">
      {/*
        The bill the client described: supplier at the top, the generated bill
        number and the date beside it, the item lines with cost, quantity and an
        IMEI box per unit, and the amount paid at the bottom working out what is
        left. No paid / not-paid buttons anywhere.
      */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-muted/40 px-5 py-4">
        <div>
          <p className="eyebrow">Supplier upload bill</p>
          <h2 className="text-base font-semibold tracking-tight">Book a carton onto the system</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Enter the supplier and the items. The IMEI boxes open to match the quantity you type.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-2 text-right">
          <p className="eyebrow">Bill number</p>
          <p className="font-mono text-sm font-semibold text-primary">{invoiceNumber}</p>
        </div>
      </header>

      <div className="space-y-6 p-5">
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              1
            </span>
            Supplier, shop and date
          </h3>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="eyebrow mb-1 block">Which shop it goes to</span>
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} required disabled={busy}>
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name} ({shop.code})
                  </option>
                ))}
              </Select>
            </label>

            <label className="block text-sm">
              <span className="eyebrow mb-1 block">Date of this upload</span>
              <Input type="date" value={uploadDate} onChange={(e) => setUploadDate(e.target.value)} required disabled={busy} />
            </label>

            <div className="text-sm">
              <span className="eyebrow mb-1 block">Supplier</span>
              <div className="inline-flex w-full rounded-lg bg-muted p-0.5">
                <button
                  type="button"
                  onClick={() => setSupplierMode("existing")}
                  disabled={busy || suppliers.length === 0}
                  className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    supplierMode === "existing" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  Already on the books
                </button>
                <button
                  type="button"
                  onClick={() => setSupplierMode("new")}
                  disabled={busy}
                  className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    supplierMode === "new" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  New supplier
                </button>
              </div>
            </div>
          </div>

          {supplierMode === "existing" ? (
            <label className="block text-sm">
              <span className="eyebrow mb-1 block">Which supplier</span>
              <Select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                required
                disabled={busy || suppliers.length === 0}
                emptyLabel="No suppliers on the books yet. Choose New supplier."
              >
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                    {supplier.city || supplier.country
                      ? ` · ${[supplier.city, supplier.country].filter(Boolean).join(", ")}`
                      : ""}
                  </option>
                ))}
              </Select>
            </label>
          ) : (
            <div className="grid gap-3 rounded-lg border border-dashed border-input p-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="eyebrow mb-1 block">Supplier name</span>
                <Input
                  placeholder="e.g. Shenzhen Tech Link"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <label className="block text-sm">
                <span className="eyebrow mb-1 block">Phone</span>
                <Input value={newSupplierPhone} onChange={(e) => setNewSupplierPhone(e.target.value)} disabled={busy} />
              </label>
              <label className="block text-sm">
                <span className="eyebrow mb-1 block">Country</span>
                <Input
                  placeholder="e.g. China, UAE, Nigeria"
                  value={newSupplierCountry}
                  onChange={(e) => setNewSupplierCountry(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="block text-sm">
                <span className="eyebrow mb-1 block">City or market</span>
                <Input
                  placeholder="e.g. Shenzhen, Dubai, Lagos"
                  value={newSupplierCity}
                  onChange={(e) => setNewSupplierCity(e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                2
              </span>
              What is on this bill
            </h3>
            <Button type="button" size="sm" variant="outline" onClick={addItemLine} disabled={busy}>
              <PlusCircle className="mr-1.5 h-4 w-4" /> Add another item
            </Button>
          </div>

          <div className="space-y-3">
            {items.map((item, itemIdx) => (
              <div key={itemIdx} className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    Item {itemIdx + 1}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {item.tracking === "IMEI"
                        ? "tracked by IMEI"
                        : item.tracking === "SERIAL"
                          ? "tracked by serial"
                          : "counted in pieces"}
                    </span>
                  </p>
                  {items.length > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger-soft"
                      onClick={() => removeItemLine(itemIdx)}
                      disabled={busy}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-12">
                  <label className="block text-sm sm:col-span-6">
                    <span className="eyebrow mb-1 block">Item</span>
                    <Select
                      value={item.productId}
                      onChange={(e) => handleProductSelect(itemIdx, e.target.value)}
                      disabled={busy}
                      emptyLabel="No items on the list yet. Load the item list first."
                    >
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} · {product.brand.name} · cost {formatCurrency(product.costPrice)}
                        </option>
                      ))}
                    </Select>
                  </label>

                  <label className="block text-sm sm:col-span-3">
                    <span className="eyebrow mb-1 block">Cost price each (₦)</span>
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
                      className="num"
                    />
                  </label>

                  <label className="block text-sm sm:col-span-3">
                    <span className="eyebrow mb-1 block">How many</span>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={item.quantity}
                      onChange={(e) => handleQuantityChange(itemIdx, Number(e.target.value))}
                      required
                      disabled={busy}
                      className="num"
                    />
                  </label>
                </div>

                <p className="flex flex-wrap justify-between gap-2 rounded-md bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
                  <span>
                    {item.quantity} × {formatCurrency(item.costPrice || 0)}
                  </span>
                  <span>
                    Line total{" "}
                    <strong className="num text-foreground">
                      {formatCurrency((item.quantity || 0) * (item.costPrice || 0))}
                    </strong>
                  </span>
                </p>

                {/* One box per unit, opened by the quantity above. */}
                {item.tracking !== "NONE" ? (
                  <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                    <p className="eyebrow">
                      Scan or type the {item.quantity} {item.tracking === "IMEI" ? "IMEI numbers" : "serial numbers"}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Array.from({ length: item.quantity }).map((_, idIdx) => (
                        <div key={idIdx} className="flex items-center gap-2">
                          <span className="w-6 shrink-0 font-mono text-[11px] text-muted-foreground">{idIdx + 1}.</span>
                          <Input
                            placeholder={item.tracking === "IMEI" ? "15-digit IMEI" : "Serial number"}
                            value={item.identities?.[idIdx] || ""}
                            onChange={(e) => handleIdentityChange(itemIdx, idIdx, e.target.value)}
                            required
                            disabled={busy}
                            autoComplete="off"
                            className="h-9 font-mono text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              3
            </span>
            Payment
          </h3>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <p className="eyebrow">Total value of this bill</p>
              <p className="mt-1 text-2xl font-semibold num">{formatCurrency(totalInvoiceValue)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                From {items.length} line{items.length === 1 ? "" : "s"}, {unitCount} unit{unitCount === 1 ? "" : "s"}
              </p>
            </div>

            <div className="rounded-lg border border-border p-4">
              <label className="block">
                <span className="eyebrow mb-1 block">Amount paid now (₦)</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amountPaid || ""}
                  onChange={(e) => setAmountPaid(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0.00"
                  disabled={busy}
                  className="text-lg font-semibold num"
                />
              </label>
              <div className="mt-2 flex gap-3 text-xs">
                <button type="button" onClick={() => setAmountPaid(totalInvoiceValue)} className="font-medium text-primary hover:underline">
                  Paid in full
                </button>
                <button type="button" onClick={() => setAmountPaid(0)} className="font-medium text-muted-foreground hover:underline">
                  Nothing paid yet
                </button>
              </div>
            </div>

            <div className={`rounded-lg border p-4 ${isFullyPaid ? "border-success/30 bg-success-soft" : "border-border"}`}>
              <p className="eyebrow">Still to be paid</p>
              <p className={`mt-1 text-2xl font-semibold num ${balanceOwed > 0 ? "text-warning" : "text-success"}`}>
                {formatCurrency(balanceOwed)}
              </p>
              <p className="mt-1 text-xs">
                {isFullyPaid ? (
                  <span className="inline-flex items-center gap-1 font-medium text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> This bill is fully cleared
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {amountPaid > 0 ? "Part paid." : "Nothing paid."} The balance stays owed on Goods from supplier.
                  </span>
                )}
              </p>
            </div>
          </div>

          <label className="block text-sm">
            <span className="eyebrow mb-1 block">Note or carton reference</span>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. carton 4 from the Dubai cargo, waybill 88392"
              disabled={busy}
            />
          </label>
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-5 py-3.5">
        <p className="text-sm text-muted-foreground">
          Ready to book <strong className="text-foreground">{unitCount}</strong> unit{unitCount === 1 ? "" : "s"} worth{" "}
          <strong className="text-foreground num">{formatCurrency(totalInvoiceValue)}</strong>
        </p>
        <Button type="submit" size="lg" disabled={busy || totalInvoiceValue <= 0}>
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <PackagePlus className="mr-2 h-4 w-4" /> Upload this stock
            </>
          )}
        </Button>
      </footer>
    </form>
  )
}
