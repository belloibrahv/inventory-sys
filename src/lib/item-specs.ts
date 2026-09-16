import type { ProductCondition } from "@prisma/client"
import { mapOpeningCondition } from "@/lib/opening-stock"

/**
 * What staff fill on a supplier bill line, separate from the product name.
 * The name stays the model. Condition, storage, cost, and quantity sit beside it.
 */
export const BILL_CONDITION_OPTIONS = [
  { value: "BRAND_NEW", label: "Brand new" },
  { value: "UK_USED", label: "Uk" },
  { value: "OPEN_BOX", label: "Open box" },
  { value: "STANDARD", label: "Standard" },
] as const

export const STORAGE_OPTIONS = ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB", "2TB"] as const

export function mapBillCondition(raw?: string | null): ProductCondition | null {
  if (!raw?.trim()) return null
  return mapOpeningCondition(raw)
}

export function normalizeStorage(raw?: string | null): string {
  const trimmed = (raw || "").trim()
  if (!trimmed) return ""
  const compact = trimmed.toUpperCase().replace(/\s+/g, "")
  if (compact === "1TERABYTE" || compact === "1TB" || compact === "1024GB") return "1TB"
  if (compact === "2TERABYTE" || compact === "2TB" || compact === "2048GB") return "2TB"
  if (/^\d+GB$/.test(compact)) return compact
  if (/^\d+$/.test(compact)) return `${compact}GB`
  return trimmed
}
