/** Shop words for the big stock groups the client counts by hand. */
export const STOCK_CATEGORY_FILTERS = [
  { key: "ALL", label: "All categories", match: null as RegExp | null },
  { key: "PHONES", label: "Phones", match: /phone/i },
  { key: "ACCESSORIES", label: "Accessories", match: /accessor/i },
  { key: "SCREEN", label: "Screen", match: /screen/i },
  { key: "LAPTOP", label: "Laptop", match: /laptop/i },
  // Anything the groups above do not name. Without this a category like
  // Tablets sat inside All with no chip of its own, so the chips did not add
  // up to the total and the stock read as missing.
  { key: "OTHER", label: "Other", match: null as RegExp | null },
] as const

export type StockCategoryKey = (typeof STOCK_CATEGORY_FILTERS)[number]["key"]

/** True when this item belongs to one of the named groups above. */
function inAnyNamedGroup(categoryName: string | null | undefined) {
  const name = String(categoryName || "")
  return STOCK_CATEGORY_FILTERS.some((row) => row.match && row.match.test(name))
}

export function matchesStockCategory(categoryName: string | null | undefined, key: string) {
  if (key === "ALL") return true
  if (key === "OTHER") return !inAnyNamedGroup(categoryName)
  const filter = STOCK_CATEGORY_FILTERS.find((row) => row.key === key)
  if (!filter?.match) return true
  return filter.match.test(String(categoryName || ""))
}

export function countByStockCategory(lines: Array<{ category?: string | null }>) {
  const counts: Record<string, number> = { ALL: lines.length }
  for (const filter of STOCK_CATEGORY_FILTERS) {
    if (filter.key === "ALL") continue
    counts[filter.key] = lines.filter((line) => matchesStockCategory(line.category, filter.key)).length
  }
  return counts
}
