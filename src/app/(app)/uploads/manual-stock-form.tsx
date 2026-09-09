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

type Shop = { id: string; name: string; code: string }
type Brand = { id: string; name: string }
type Category = { id: string; name: string }
type Product = {
  id: string
  name: string
  sku: string
  tracking: "IMEI" | "SERIAL" | "NONE"
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
 * Add stock one unit at a time without a spreadsheet.
 * Phones and serial items book In shop. Piece items raise the shelf count.
 */
export function ManualStockForm({
  shops,
  brands,
  categories,
  products,
}: {
  shops: Shop[]
  brands: Brand[]
  categories: Category[]
  products: Product[]
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
    setBusy(true)
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
    toast.success(parts.join(". ") || "Added to the shelf.")

    setIdentity("")
    if (activeTracking === "NONE") {
      const qty = formRef.current?.elements.namedItem("quantity") as HTMLInputElement | null
      if (qty) qty.value = "1"
    }
    router.refresh()
  }

  return (
    <div className="surface-card border-primary/30 p-5">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Everyday way</p>
        <h2 className="text-lg font-semibold tracking-tight">Add one item to the shelf</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Use this when you have one phone, one laptop, or a few cords to book in. Pick the shop, pick or add the item name,
        then enter the IMEI, serial, or how many pieces. When the form saves, the fields clear so you can add the next unit.
        For dozens or hundreds of lines, use the opening stock Excel below instead.
      </p>

      <form ref={formRef} className="mt-4 space-y-4" action={handleSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="manual-branch">
            Shop
          </label>
          <Select id="manual-branch" name="branchId" required defaultValue={shops[0]?.id || ""} disabled={busy}>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name} ({shop.code})
              </option>
            ))}
          </Select>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Item on the list</legend>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={productMode === "existing" ? "default" : "outline"}
              onClick={() => setProductMode("existing")}
              disabled={busy}
            >
              Pick from the list
            </Button>
            <Button
              type="button"
              size="sm"
              variant={productMode === "new" ? "default" : "outline"}
              onClick={() => setProductMode("new")}
              disabled={busy}
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
              disabled={busy}
            />
            <Select
              name="productIdDisplay"
              required
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              disabled={busy || filteredProducts.length === 0}
              emptyLabel="No items on the list yet. Add a new item name below or upload the opening stock Excel."
            >
              {filteredProducts.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.brand.name} · {trackingLabel(row.tracking)}
                </option>
              ))}
            </Select>
            {selectedProduct ? (
              <p className="text-xs text-muted-foreground">
                Item code {selectedProduct.sku}. {trackingHint(selectedProduct.tracking)}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-dashed border-border p-3">
            <Input name="name" placeholder="Item name, for example iPhone 17 Pro Max 256GB" required disabled={busy} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Select name="brandId" required disabled={busy} emptyLabel="Add a brand on Phones and items first.">
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </Select>
              <Select name="categoryId" required disabled={busy} emptyLabel="Add a category on Phones and items first.">
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
              disabled={busy}
            >
              <option value="IMEI">Phone or tablet with IMEI</option>
              <option value="SERIAL">Laptop or accessory with serial</option>
              <option value="NONE">No number (cords, chargers, screens by count)</option>
            </Select>
            <Select name="condition" defaultValue="BRAND_NEW" disabled={busy}>
              {CONDITIONS.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
            <Input name="storage" placeholder="Storage or size (optional)" disabled={busy} />
            <div className="grid gap-2 sm:grid-cols-3">
              <Input name="costPrice" type="number" min={0} step="0.01" placeholder="Cost price" required disabled={busy} />
              <Input name="minimumPrice" type="number" min={0} step="0.01" placeholder="Lowest price" required disabled={busy} />
              <Input name="sellingPrice" type="number" min={0} step="0.01" placeholder="Selling price" required disabled={busy} />
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
              disabled={busy}
              placeholder="How many pieces you are putting on the shelf"
            />
          ) : activeTracking === "IMEI" ? (
            <>
              <ScanField
                kind="IMEI"
                onScan={setIdentity}
                placeholder="Scan IMEI from the box, then press Enter"
              />
              <Input
                value={identity}
                onChange={(event) => setIdentity(event.target.value.replace(/[\s-]/g, ""))}
                placeholder="Or type the full IMEI"
                disabled={busy}
                inputMode="numeric"
                autoComplete="off"
              />
            </>
          ) : (
            <>
              <ScanField
                kind="SERIAL"
                onScan={setIdentity}
                placeholder="Scan serial from the box, then press Enter"
              />
              <Input
                value={identity}
                onChange={(event) => setIdentity(event.target.value.trim())}
                placeholder="Or type the serial number"
                disabled={busy}
                autoComplete="off"
              />
            </>
          )}
        </div>

        <Button type="submit" disabled={busy || shops.length === 0} aria-busy={busy}>
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
