import { cell } from "@/lib/table-file"

/**
 * Working out what a sheet is asking for, with no database and no session.
 *
 * The checking is kept apart from the saving on purpose. It is the part that
 * decides whether a shop gets loaded correctly or not, so it has to be testable
 * on its own: see scripts/check-uploads.ts.
 */

export type CatalogItem = { id: string; sku: string; name: string; tracking: "IMEI" | "SERIAL" | "NONE" }
export type ShopRef = { id: string; name: string; code: string }

export type Plan<T> = { rows: T[]; problems: string[] }

export type ImeiLine = {
  imei1: string
  imei2: string | null
  serialNumber: string | null
  productId: string
  branchId: string
  supplierName: string | null
  notes: string | null
}

export type StockLine = { productId: string; branchId: string; quantity: number; minStock: number | null }

export type CustomerLine = {
  name: string
  phone: string
  branchId: string
  email: string | null
  address: string | null
  creditLimit: number
}

function shopLookup(shops: ShopRef[]) {
  const index = new Map<string, string>()
  for (const shop of shops) {
    index.set(shop.code.toLowerCase(), shop.id)
    index.set(shop.name.toLowerCase(), shop.id)
    index.set(shop.name.split(",")[0].trim().toLowerCase(), shop.id)
  }
  return index
}

function itemLookup(items: CatalogItem[]) {
  const bySku = new Map(items.map((item) => [item.sku.toLowerCase(), item]))
  const byName = new Map<string, CatalogItem[]>()
  for (const item of items) {
    const key = item.name.toLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), item])
  }
  return { bySku, byName }
}

function findItem(
  lookup: ReturnType<typeof itemLookup>,
  sku: string,
  name: string
): { item?: CatalogItem; problem?: "missing" | "ambiguous" } {
  if (sku) {
    const hit = lookup.bySku.get(sku.toLowerCase())
    return hit ? { item: hit } : { problem: "missing" }
  }
  const hits = lookup.byName.get(name.toLowerCase()) ?? []
  if (!hits.length) return { problem: "missing" }
  if (hits.length > 1) return { problem: "ambiguous" }
  return { item: hits[0] }
}

export function planImeis(rows: Record<string, string>[], items: CatalogItem[], shops: ShopRef[]): Plan<ImeiLine> {
  const lookup = itemLookup(items)
  const shopIds = shopLookup(shops)
  const codes = shops.map((s) => s.code).join(", ")
  const out: ImeiLine[] = []
  const problems: string[] = []
  const seen = new Set<string>()

  rows.forEach((row, index) => {
    const line = index + 2
    const imei1 = cell(row, "imei", "imei1", "imei_1", "phone")
    const serial = cell(row, "serial", "serial_number", "sn")
    const code = imei1 || serial
    const sku = cell(row, "item_code", "sku", "code")
    const name = cell(row, "name", "product", "item", "model")
    const shopName = cell(row, "shop", "branch", "store", "location")
    if (!code && !sku && !name && !shopName) return

    if (!code) return void problems.push(`Line ${line}: put the IMEI, or a serial for an item that has no IMEI.`)
    if (imei1 && imei1.length < 14) {
      return void problems.push(`Line ${line}: ${imei1} is too short for an IMEI. Copy all the digits from the box.`)
    }
    if (seen.has(code)) return void problems.push(`Line ${line}: ${code} is on this sheet twice.`)
    seen.add(code)

    const found = findItem(lookup, sku, name)
    if (found.problem === "missing") {
      return void problems.push(`Line ${line}: ${sku || name || "that item"} is not on the item list. Upload the item list first.`)
    }
    if (found.problem === "ambiguous") {
      return void problems.push(`Line ${line}: more than one item is called ${name}. Use the item code instead.`)
    }
    const item = found.item!
    if (item.tracking === "NONE") {
      return void problems.push(`Line ${line}: ${item.name} has no IMEI or serial. Put it on the shelf-count sheet instead.`)
    }
    const branchId = shopIds.get(shopName.toLowerCase())
    if (!branchId) {
      return void problems.push(`Line ${line}: ${shopName || "(no shop)"} is not one of our shops. Use ${codes}.`)
    }

    out.push({
      imei1: code,
      imei2: cell(row, "imei2", "imei_2") || null,
      serialNumber: serial || null,
      productId: item.id,
      branchId,
      supplierName: cell(row, "supplier", "from") || null,
      notes: cell(row, "notes", "note", "remark") || null,
    })
  })

  return { rows: out, problems }
}

export function planStock(rows: Record<string, string>[], items: CatalogItem[], shops: ShopRef[]): Plan<StockLine> {
  const lookup = itemLookup(items)
  const shopIds = shopLookup(shops)
  const codes = shops.map((s) => s.code).join(", ")
  const out: StockLine[] = []
  const problems: string[] = []

  rows.forEach((row, index) => {
    const line = index + 2
    const sku = cell(row, "item_code", "sku", "code")
    const name = cell(row, "name", "product", "item")
    const shopName = cell(row, "shop", "branch", "store", "location")
    const qtyRaw = cell(row, "quantity", "qty", "pieces", "count", "on_hand")
    if (!sku && !name && !shopName && !qtyRaw) return

    const found = findItem(lookup, sku, name)
    if (found.problem === "missing") {
      return void problems.push(`Line ${line}: ${sku || name || "that item"} is not on the item list. Upload the item list first.`)
    }
    if (found.problem === "ambiguous") {
      return void problems.push(`Line ${line}: more than one item is called ${name}. Use the item code instead.`)
    }
    const item = found.item!
    if (item.tracking !== "NONE") {
      return void problems.push(`Line ${line}: ${item.name} is counted by IMEI or serial. Put it on the phones sheet instead.`)
    }
    const branchId = shopIds.get(shopName.toLowerCase())
    if (!branchId) {
      return void problems.push(`Line ${line}: ${shopName || "(no shop)"} is not one of our shops. Use ${codes}.`)
    }
    const quantity = Number(qtyRaw || 0)
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
      return void problems.push(`Line ${line}: how many pieces? Type a whole number, 0 or more.`)
    }
    const minRaw = cell(row, "minimum", "min_stock", "alert_at")
    out.push({
      productId: item.id,
      branchId,
      quantity,
      minStock: minRaw && Number.isFinite(Number(minRaw)) ? Number(minRaw) : null,
    })
  })

  return { rows: out, problems }
}

export function planCustomers(rows: Record<string, string>[], shops: ShopRef[]): Plan<CustomerLine> {
  const shopIds = shopLookup(shops)
  const codes = shops.map((s) => s.code).join(", ")
  const out: CustomerLine[] = []
  const problems: string[] = []
  const seen = new Set<string>()

  rows.forEach((row, index) => {
    const line = index + 2
    const name = cell(row, "name", "customer", "full_name")
    const phone = cell(row, "phone", "number", "mobile")
    const shopName = cell(row, "shop", "branch", "store")
    if (!name && !phone && !shopName) return

    if (!name) return void problems.push(`Line ${line}: the customer needs a name.`)
    if (!phone) return void problems.push(`Line ${line}: ${name} needs a phone number.`)
    if (seen.has(phone)) return void problems.push(`Line ${line}: ${phone} is on this sheet twice.`)
    seen.add(phone)
    const branchId = shopIds.get(shopName.toLowerCase())
    if (!branchId) {
      return void problems.push(`Line ${line}: ${shopName || "(no shop)"} is not one of our shops. Use ${codes}.`)
    }
    out.push({
      name,
      phone,
      branchId,
      email: cell(row, "email") || null,
      address: cell(row, "address") || null,
      creditLimit: Number(cell(row, "credit_limit", "limit") || 0) || 0,
    })
  })

  return { rows: out, problems }
}
