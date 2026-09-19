/** Shop words for the big stock groups the client counts by hand. */
export const STOCK_CATEGORY_FILTERS = [
  { key: "ALL", label: "All categories", match: null as RegExp | null },
  { key: "PHONES", label: "Phones", match: /phone/i },
  { key: "ACCESSORIES", label: "Accessories", match: /accessor/i },
  { key: "SCREEN", label: "Screen", match: /screen/i },
  { key: "LAPTOP", label: "Laptop", match: /laptop/i },
] as const

export type StockCategoryKey = (typeof STOCK_CATEGORY_FILTERS)[number]["key"]

export function matchesStockCategory(categoryName: string | null | undefined, key: string) {
  if (key === "ALL") return true
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
