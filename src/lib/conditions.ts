import type { ProductCondition } from "@prisma/client"
import { keyName } from "@/lib/table-file"

/**
 * How the phone looks on shop screens. One list for Add item, Upload stock,
 * One phone at a time, Shop stock, and Swap Deal.
 */
export const SHOP_CONDITION_OPTIONS = [
  { value: "BRAND_NEW", label: "Brand New" },
  { value: "BRAND_NEW_LOCKED", label: "Brand New (Locked)" },
  { value: "BRAND_NEW_NA", label: "Brand New (N/A)" },
  { value: "UK_USED", label: "UK" },
  { value: "UK_LOCKED", label: "UK (Locked)" },
  { value: "OPEN_BOX", label: "Open Box" },
  { value: "STANDARD", label: "Standard" },
  { value: "FAULTY", label: "Faulty" },
] as const

export type ShopConditionValue = (typeof SHOP_CONDITION_OPTIONS)[number]["value"]

const BY_KEY: Record<string, ProductCondition> = {
  brand_new: "BRAND_NEW",
  brandnew: "BRAND_NEW",
  new: "BRAND_NEW",
  brand_new_locked: "BRAND_NEW_LOCKED",
  brandnewlocked: "BRAND_NEW_LOCKED",
  brand_new_n_a: "BRAND_NEW_NA",
  brand_new_na: "BRAND_NEW_NA",
  brandnewna: "BRAND_NEW_NA",
  open_box: "OPEN_BOX",
  openbox: "OPEN_BOX",
  uk: "UK_USED",
  uk_used: "UK_USED",
  ukused: "UK_USED",
  uk_locked: "UK_LOCKED",
  uklocked: "UK_LOCKED",
  standard: "STANDARD",
  refurbished: "REFURBISHED",
  swap: "SWAP_DEVICE",
  swap_device: "SWAP_DEVICE",
  faulty: "FAULTY",
  damaged: "FAULTY",
  non_active: "FAULTY",
  nonactive: "FAULTY",
  repair: "REPAIR_DEVICE",
  repair_device: "REPAIR_DEVICE",
}

export const SHOP_CONDITION_LABELS: Record<string, string> = Object.fromEntries(
  SHOP_CONDITION_OPTIONS.map((row) => [row.value, row.label])
)

SHOP_CONDITION_LABELS.UK = "UK"
SHOP_CONDITION_LABELS.OPENBOX = "Open Box"
SHOP_CONDITION_LABELS.UK_USED = "UK"

export function shopConditionLabel(value?: string | null) {
  if (!value) return ""
  return SHOP_CONDITION_LABELS[value] ?? SHOP_CONDITION_OPTIONS.find((row) => row.value === value)?.label ?? ""
}

export function parseShopCondition(raw?: string | null): ProductCondition | null {
  if (!raw?.trim()) return "BRAND_NEW"
  const key = keyName(raw)
  if (BY_KEY[key]) return BY_KEY[key]
  const withoutNote = raw.replace(/\([^)]*\)/g, " ")
  const retry = BY_KEY[keyName(withoutNote)]
  if (retry) return retry
  const words = keyName(withoutNote)
  if (words.includes("lock") && words.includes("uk")) return "UK_LOCKED"
  if (words.includes("lock") && (words.includes("brand") || words.includes("new"))) return "BRAND_NEW_LOCKED"
  if ((words.includes("n_a") || words.endsWith("na")) && (words.includes("brand") || words.includes("new"))) {
    return "BRAND_NEW_NA"
  }
  if (words.startsWith("bran_new") || words.startsWith("brand_new") || words.startsWith("bran_")) return "BRAND_NEW"
  if (words.includes("uk")) return "UK_USED"
  if (words.includes("open") && words.includes("box")) return "OPEN_BOX"
  if (words.includes("standard")) return "STANDARD"
  if (words.includes("fault") || words.includes("damage")) return "FAULTY"
  if (words.includes("non") && words.includes("active")) return "FAULTY"
  return null
}

export function isShopCondition(value: string): value is ShopConditionValue {
  return SHOP_CONDITION_OPTIONS.some((row) => row.value === value)
}

/** Full How the phone looks list, for error lines and the guidebook. */
export function shopConditionHelp() {
  const names = SHOP_CONDITION_OPTIONS.map((row) => row.label)
  if (names.length < 2) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`
}
