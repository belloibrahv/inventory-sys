import { keyName } from "@/lib/table-file"
import type { ProductCondition, ProductTracking } from "@prisma/client"

/**
 * Abu Twins opening stock workbook.
 *
 * One Excel file per shop. Tabs they already use: PHONES, ACCESSORIES, SCREEN,
 * LAPTOPS. Same columns on every tab. The middle column is either an IMEI, a
 * serial, or a piece count, depending on the tab and what is written there.
 */

export type OpeningIdentity =
  | { kind: "imei"; value: string }
  | { kind: "serial"; value: string }
  | { kind: "qty"; value: number }

export type OpeningProductDraft = {
  sku: string
  name: string
  brand: string
  category: string
  tracking: ProductTracking
  condition: ProductCondition
  storage: string | null
  costPrice: number
  minimumPrice: number
  sellingPrice: number
}

export type OpeningUnitLine = {
  sheet: string
  line: number
  productKey: string
  identity: Extract<OpeningIdentity, { kind: "imei" | "serial" }>
}

export type OpeningQtyLine = {
  sheet: string
  line: number
  productKey: string
  quantity: number
}

export type OpeningPlan = {
  products: OpeningProductDraft[]
  units: OpeningUnitLine[]
  quantities: OpeningQtyLine[]
  problems: string[]
}

const CONDITIONS: Record<string, ProductCondition> = {
  brand_new: "BRAND_NEW",
  brandnew: "BRAND_NEW",
  new: "BRAND_NEW",
  open_box: "OPEN_BOX",
  openbox: "OPEN_BOX",
  uk: "UK_USED",
  uk_used: "UK_USED",
  ukused: "UK_USED",
  refurbished: "REFURBISHED",
  swap: "SWAP_DEVICE",
  swap_device: "SWAP_DEVICE",
  faulty: "FAULTY",
  repair: "REPAIR_DEVICE",
  repair_device: "REPAIR_DEVICE",
  // Shop words on their own sheet that are not our enum names.
  standard: "BRAND_NEW",
  perfect: "BRAND_NEW",
  like_new: "BRAND_NEW",
  used: "UK_USED",
}

const HEADER_MARKERS = ["product_name", "s_n", "sn", "brand", "qty_imei_serial_no"]

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function slugPart(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
}

export function makeOpeningSku(parts: { brand: string; name: string; storage: string; condition: ProductCondition }) {
  const joined = [parts.brand, parts.name, parts.storage, parts.condition.replaceAll("_", "-")]
    .map(slugPart)
    .filter(Boolean)
    .join("-")
  return (joined || "ITEM").slice(0, 60)
}

function findHeaderRow(grid: string[][]) {
  for (let i = 0; i < Math.min(grid.length, 8); i += 1) {
    const keys = grid[i].map((cell) => keyName(cell))
    const hits = keys.filter((key) => HEADER_MARKERS.includes(key) || key.includes("product_name") || key.includes("imei") || key.includes("qty")).length
    if (hits >= 3) return i
  }
  return -1
}

function mapHeaders(cells: string[]) {
  const index: Record<string, number> = {}
  cells.forEach((cell, i) => {
    const key = keyName(cell)
    if (!key) return
    if (key.includes("product") && key.includes("name")) index.name = i
    else if (key === "brand") index.brand = i
    else if (key === "category") index.category = i
    else if (key.includes("qty") || key.includes("imei") || key.includes("serial")) index.identity = i
    else if (key === "condition") index.condition = i
    else if (key.includes("specification") || key.includes("storage") || key === "spec") index.spec = i
    else if (key.includes("unit_cost") || (key.includes("cost") && key.includes("price"))) index.cost = i
    else if (key.includes("min") && key.includes("sell")) index.minSell = i
    else if (key.includes("selling") && key.includes("price")) index.selling = i
    else if (key === "s_n" || key === "sn" || key === "s_no") index.sn = i
  })
  return index
}

function at(row: string[], index: number | undefined) {
  if (index == null) return ""
  return clean(row[index] ?? "")
}

function money(raw: string) {
  if (!raw) return NaN
  const n = Number(String(raw).replace(/,/g, "").replace(/₦/g, "").trim())
  return Number.isFinite(n) ? n : NaN
}

function mapCondition(raw: string): ProductCondition | null {
  if (!raw) return "BRAND_NEW"
  const hit = CONDITIONS[keyName(raw)]
  return hit ?? null
}

function sheetHint(sheet: string): "phone" | "laptop" | "pieces" {
  const key = keyName(sheet)
  if (key.includes("phone") || key.includes("tablet")) return "phone"
  if (key.includes("laptop") || key.includes("computer") || key.includes("macbook")) return "laptop"
  return "pieces"
}

function defaultCategory(sheet: string, written: string) {
  if (written) return written
  const key = keyName(sheet)
  if (key.includes("phone")) return "Phones"
  if (key.includes("laptop")) return "Laptops"
  if (key.includes("screen")) return "Screens"
  if (key.includes("accessor")) return "Accessories"
  return sheet.trim() || "General"
}

/**
 * Read the QTY / IMEI / SERIAL cell the way the shop fills it.
 * Phones tab → IMEI. Laptops tab → serial. Accessories / screens → piece count,
 * unless the cell is clearly an IMEI or a serial.
 */
export function classifyOpeningIdentity(sheet: string, raw: string): OpeningIdentity | { kind: "bad"; reason: string } {
  const value = clean(raw)
  if (!value) return { kind: "bad", reason: "put the IMEI, the serial, or how many pieces" }

  const digits = value.replace(/\D/g, "")
  const hint = sheetHint(sheet)
  const asNumber = Number(value.replace(/,/g, ""))
  const wholeNumber = Number.isFinite(asNumber) && Number.isInteger(asNumber) && String(asNumber) === value.replace(/,/g, "")

  if (digits.length >= 14 && (/^\d[\d\s-]*$/.test(value) || digits === value.replace(/\s/g, ""))) {
    return { kind: "imei", value: digits }
  }

  if (hint === "phone") {
    if (digits.length >= 14) return { kind: "imei", value: digits }
    if (wholeNumber && asNumber > 0 && asNumber < 10_000) {
      return { kind: "bad", reason: "a phone needs its own IMEI on this tab, not a piece count" }
    }
    if (value.length >= 4) return { kind: "serial", value }
    return { kind: "bad", reason: "IMEI is too short. Copy all the digits from the box" }
  }

  if (hint === "laptop") {
    if (wholeNumber && asNumber > 0 && asNumber < 100) {
      return { kind: "bad", reason: "a laptop needs its serial on this tab, not a piece count" }
    }
    return { kind: "serial", value }
  }

  // Accessories / screens: small whole numbers are piece counts.
  if (wholeNumber && asNumber >= 0) return { kind: "qty", value: asNumber }
  if (value.length >= 4) return { kind: "serial", value }
  return { kind: "bad", reason: "put how many pieces, or a serial if this unit has one" }
}

function productKey(draft: OpeningProductDraft) {
  return [
    draft.name.toLowerCase(),
    draft.brand.toLowerCase(),
    draft.condition,
    (draft.storage || "").toLowerCase(),
    draft.tracking,
  ].join("|")
}

export function planOpeningStock(sheets: Array<{ sheet: string; grid: string[][] }>): OpeningPlan {
  const products = new Map<string, OpeningProductDraft>()
  const units: OpeningUnitLine[] = []
  const quantities: OpeningQtyLine[] = []
  const problems: string[] = []
  const seenCodes = new Set<string>()
  const qtyByKey = new Map<string, OpeningQtyLine>()

  for (const { sheet, grid } of sheets) {
    if (!grid.length) continue
    const headerAt = findHeaderRow(grid)
    if (headerAt < 0) {
      // Empty or title-only tabs are fine; ignore them.
      const hasData = grid.some((row) => row.some((cell) => cell))
      if (hasData) problems.push(`Tab ${sheet}: could not find the header row with PRODUCT NAME.`)
      continue
    }
    const headers = mapHeaders(grid[headerAt])
    if (headers.name == null || headers.identity == null) {
      problems.push(`Tab ${sheet}: the header must include PRODUCT NAME and QTY/IMEI/SERIAL NO.`)
      continue
    }

    for (let r = headerAt + 1; r < grid.length; r += 1) {
      const row = grid[r]
      const line = r + 1
      const name = at(row, headers.name)
      const brand = at(row, headers.brand)
      const identityRaw = at(row, headers.identity)
      const costRaw = at(row, headers.cost)
      const minSellRaw = at(row, headers.minSell) || at(row, headers.selling)
      if (!name && !brand && !identityRaw && !costRaw && !minSellRaw) continue

      const label = `${sheet} line ${line}`
      if (!name) {
        problems.push(`${label}: product name is missing.`)
        continue
      }
      if (!brand) {
        problems.push(`${label}: ${name} needs a brand.`)
        continue
      }

      const condition = mapCondition(at(row, headers.condition))
      if (!condition) {
        problems.push(`${label}: condition "${at(row, headers.condition)}" is not one we know. Use Brand new, UK, Open box, Perfect, or similar.`)
        continue
      }

      const costPrice = money(costRaw)
      const minSell = money(minSellRaw)
      if (!Number.isFinite(costPrice) || costPrice < 0) {
        problems.push(`${label}: ${name} needs a unit cost price.`)
        continue
      }
      if (!Number.isFinite(minSell) || minSell <= 0) {
        problems.push(`${label}: ${name} needs a minimum selling price above 0.`)
        continue
      }

      const identity = classifyOpeningIdentity(sheet, identityRaw)
      if (identity.kind === "bad") {
        problems.push(`${label}: ${name}: ${identity.reason}.`)
        continue
      }

      const storage = at(row, headers.spec) || null
      const tracking: ProductTracking = identity.kind === "qty" ? "NONE" : identity.kind === "imei" ? "IMEI" : "SERIAL"
      const draft: OpeningProductDraft = {
        sku: makeOpeningSku({ brand, name, storage: storage || "", condition }),
        name,
        brand,
        category: defaultCategory(sheet, at(row, headers.category)),
        tracking,
        condition,
        storage,
        costPrice,
        minimumPrice: minSell,
        sellingPrice: minSell,
      }
      const key = productKey(draft)
      const existing = products.get(key)
      if (existing) {
        if (existing.tracking !== draft.tracking) {
          problems.push(`${label}: ${name} was already listed with a different tracking type. Keep one model consistent.`)
          continue
        }
        // Keep the first prices; later rows of the same model may differ slightly.
      } else {
        // Avoid SKU clashes when two models collapse to the same slug.
        let sku = draft.sku
        let n = 2
        while ([...products.values()].some((p) => p.sku === sku && productKey(p) !== key)) {
          sku = `${draft.sku}-${n}`.slice(0, 60)
          n += 1
        }
        draft.sku = sku
        products.set(key, draft)
      }

      if (identity.kind === "qty") {
        const prev = qtyByKey.get(key)
        if (prev) {
          prev.quantity += identity.value
        } else {
          const lineQty = { sheet, line, productKey: key, quantity: identity.value }
          qtyByKey.set(key, lineQty)
          quantities.push(lineQty)
        }
        continue
      }

      if (seenCodes.has(identity.value)) {
        problems.push(`${label}: ${identity.value} is on this workbook twice.`)
        continue
      }
      seenCodes.add(identity.value)
      units.push({ sheet, line, productKey: key, identity })
    }
  }

  return {
    products: [...products.values()],
    units,
    quantities,
    problems,
  }
}
