import { shopConditionLabel } from "@/lib/conditions"
import { normalizeStorage } from "@/lib/item-specs"
import { formatCondition } from "@/lib/status"

/** What tells one "iPhone 11 Pro" from another. */
export type ProductSpecSource = {
  storage?: string | null
  ram?: string | null
  color?: string | null
  condition?: string | null
}

/**
 * The details that set an item apart from others with the same name: storage,
 * RAM, colour and condition. Shown faintly under the name wherever an item
 * appears, so a phone booked under the wrong item stands out at a glance.
 */
export function productSpecs(product: ProductSpecSource | null | undefined): string[] {
  if (!product) return []
  const storage = normalizeStorage(product.storage)
  const ram = (product.ram || "").trim()
  const color = (product.color || "").trim()
  const condition = shopConditionLabel(product.condition) || (product.condition ? formatCondition(product.condition) : "")
  return [storage, ram ? `${ram.toUpperCase().endsWith("RAM") ? ram : `${ram} RAM`}` : "", color, condition].filter(Boolean)
}

export function productSpecLine(product: ProductSpecSource | null | undefined) {
  return productSpecs(product).join(" · ")
}

/** Name and specs on one line, for downloads, dropdowns and plain text. */
export function productFullName(product: ({ name: string } & ProductSpecSource) | null | undefined) {
  if (!product) return ""
  const line = productSpecLine(product)
  return line ? `${product.name} (${line})` : product.name
}

/** The Prisma fields these helpers read, to add to a product select. */
export const PRODUCT_SPEC_SELECT = { storage: true, ram: true, color: true, condition: true } as const
