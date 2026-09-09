"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, PlusCircle } from "lucide-react"
import { toast } from "sonner"
import { addStockManually, type UploadResult } from "@/app/actions/uploads"
import { ScanField } from "@/components/scan-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"
import type { OpenUploadBill } from "./upload-bill-session"

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

const CONDITIONS = [
  "BRAND_NEW",
  "OPEN_BOX",
  "UK_USED",
  "REFURBISHED",
  "SWAP_DEVICE",
  "FAULTY",
  "REPAIR_DEVICE",
] as const

function trackingLabel(tracking: Product["tracking"]) {
  if (tracking === "SERIAL") return "serial number"
  if (tracking === "NONE") return "piece count"
  return "IMEI"
}

function trackingHint(tracking: Product["tracking"]) {
  if (tracking === "SERIAL") return "One row for each unit. Type or scan the serial from the box."
  if (tracking === "NONE") return "No unique number on this item. Say how many pieces you are adding."
  return "One row for each phone. Type or scan the IMEI from the box."
}

/**
 * Add stock one unit at a time onto an open upload bill.
 */
export function ManualStockForm({
  brands,
  categories,
  products,
  openBill,
}: {
  brands: Brand[]
  categories: Category[]
  products: Product[]
  openBill: OpenUploadBill | null
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState(false)
  const [productMode, setProductMode] = useState<"existing" | "new">("existing")
  const [search, setSearch] = useState("")
  const [productId, setProductId] = useState(products[0]?.id ?? "")
  const [newTracking, setNewTracking] = useState<Product["tracking"]>("IMEI")
  const [identity, setIdentity] = useState("")

  const selectedProduct = products.find((row) => row.id === productId)
  const activeTracking = productMode === "existing" ? selectedProduct?.tracking ?? "IMEI" : newTracking
  const locked = !openBill

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return products
    return products.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        row.sku.toLowerCase().includes(needle) ||
        row.brand.name.toLowerCase().includes(needle)
    )
  }, [products, search])

  useEffect(() => {
    if (!filteredProducts.length) return
    if (!filteredProducts.some((row) => row.id === productId)) {
      setProductId(filteredProducts[0].id)
    }
  }, [filteredProducts, productId])

  async function handleSubmit(formData: FormData) {
    if (!openBill) {
      toast.error("Start an upload bill first. Pick the supplier and whether it is paid.")
      return
    }
    setBusy(true)
    formData.set("purchaseId", openBill.id)
    formData.set("productMode", productMode)
    if (productMode === "existing") formData.set("productId", productId)
    if (activeTracking !== "NONE") formData.set("identity", identity)

    let result: UploadResult
    try {
      result = await addStockManually(formData)
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

    const parts: string[] = []
    if (result.products) parts.push(`${result.products} new item name on the list`)
    if (result.phones) parts.push(`${result.phones} unit booked In shop`)
    if (result.pieces) parts.push(`${result.pieces} piece${result.pieces === 1 ? "" : "s"} added to the shelf`)
    if (result.invoiceNumber) parts.push(`bill ${result.invoiceNumber}`)
    if (result.submissionValue != null) parts.push(`submission value ${formatCurrency(result.submissionValue)}`)
    toast.success(parts.join(". ") || "Added to the shelf.")

    setIdentity("")
    if (activeTracking === "NONE") {
      const qty = formRef.current?.elements.namedItem("quantity") as HTMLInputElement | null
      if (qty) qty.value = "1"
    }
    router.refresh()
  }

  return (
    <div className="surface-card p-5">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Everyday way</p>
        <h2 className="text-lg font-semibold tracking-tight">Add one item to the shelf</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Units go onto the open upload bill above. Scan or type each IMEI or serial, or say how many cords. When the form
        saves, the number fields clear for the next unit. For dozens or hundreds of lines, use the opening stock Excel
        below instead.
      </p>

      {locked ? (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
          Start an upload bill first. That creates the PO number, supplier, and paid or not paid trail for this carton.
        </p>
      ) : null}

      <form ref={formRef} className="mt-4 space-y-4" action={handleSubmit}>
        <fieldset className="space-y-2" disabled={locked || busy}>
          <legend className="text-sm font-medium">Item on the list</legend>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={productMode === "existing" ? "default" : "outline"}
              onClick={() => setProductMode("existing")}
              disabled={locked || busy}
            >
              Pick from the list
            </Button>
            <Button
              type="button"
              size="sm"
              variant={productMode === "new" ? "default" : "outline"}
              onClick={() => setProductMode("new")}
              disabled={locked || busy}
            >
              Add a new item name
            </Button>
          </div>
        </fieldset>

        {productMode === "existing" ? (
          <div className="space-y-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find by name, item code, or brand"
              disabled={locked || busy}
            />
            <Select
              name="productIdDisplay"
              required
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              disabled={locked || busy || filteredProducts.length === 0}
              emptyLabel="No items on the list yet. Add a new item name or upload the opening stock Excel."
            >
              {filteredProducts.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.brand.name} · {trackingLabel(row.tracking)} · cost {formatCurrency(row.costPrice)}
                </option>
              ))}
            </Select>
            {selectedProduct ? (
              <p className="text-xs text-muted-foreground">
                Item code {selectedProduct.sku}. Cost {formatCurrency(selectedProduct.costPrice)} goes onto the bill.
                {` ${trackingHint(selectedProduct.tracking)}`}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-dashed border-border p-3">
            <Input name="name" placeholder="Item name, for example iPhone 17 Pro Max 256GB" required disabled={locked || busy} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Select name="brandId" required disabled={locked || busy} emptyLabel="Add a brand on Phones and items first.">
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </Select>
              <Select name="categoryId" required disabled={locked || busy} emptyLabel="Add a category on Phones and items first.">
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <Select
              name="tracking"
              value={newTracking}
              onChange={(event) => setNewTracking(event.target.value as Product["tracking"])}
              disabled={locked || busy}
            >
              <option value="IMEI">Phone or tablet with IMEI</option>
              <option value="SERIAL">Laptop or accessory with serial</option>
              <option value="NONE">No number (cords, chargers, screens by count)</option>
            </Select>
            <Select name="condition" defaultValue="BRAND_NEW" disabled={locked || busy}>
              {CONDITIONS.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
            <Input name="storage" placeholder="Storage or size (optional)" disabled={locked || busy} />
            <div className="grid gap-2 sm:grid-cols-3">
              <Input name="costPrice" type="number" min={0} step="0.01" placeholder="Cost price" required disabled={locked || busy} />
              <Input name="minimumPrice" type="number" min={0} step="0.01" placeholder="Lowest price" required disabled={locked || busy} />
              <Input name="sellingPrice" type="number" min={0} step="0.01" placeholder="Selling price" required disabled={locked || busy} />
            </div>
            <p className="text-xs text-muted-foreground">{trackingHint(newTracking)}</p>
          </div>
        )}

        <div className="space-y-2 rounded-xl bg-muted/40 p-3">
          <p className="text-sm font-medium">
            {activeTracking === "NONE" ? "How many pieces" : `Enter the ${trackingLabel(activeTracking)}`}
          </p>
          {activeTracking === "NONE" ? (
            <Input
              name="quantity"
              type="number"
              min={1}
              step={1}
              defaultValue={1}
              required
              disabled={locked || busy}
              placeholder="How many pieces you are putting on the shelf"
            />
          ) : activeTracking === "IMEI" ? (
            <>
              <ScanField kind="IMEI" onScan={setIdentity} placeholder="Scan IMEI from the box, then press Enter" />
              <Input
                value={identity}
                onChange={(event) => setIdentity(event.target.value.replace(/[\s-]/g, ""))}
                placeholder="Or type the full IMEI"
                disabled={locked || busy}
                inputMode="numeric"
                autoComplete="off"
              />
            </>
          ) : (
            <>
              <ScanField kind="SERIAL" onScan={setIdentity} placeholder="Scan serial from the box, then press Enter" />
              <Input
                value={identity}
                onChange={(event) => setIdentity(event.target.value.trim())}
                placeholder="Or type the serial number"
                disabled={locked || busy}
                autoComplete="off"
              />
            </>
          )}
        </div>

        <Button type="submit" disabled={locked || busy} aria-busy={busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Adding this to the shelf
            </>
          ) : (
            <>
              <PlusCircle className="h-4 w-4" aria-hidden />
              {activeTracking === "NONE" ? "Add pieces to the shelf" : "Add this unit to the shelf"}
            </>
          )}
        </Button>
      </form>
    </div>
  )
}
