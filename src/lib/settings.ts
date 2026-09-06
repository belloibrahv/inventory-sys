import { prisma } from "@/lib/prisma"

export async function getAppSettings() {
  const rows = await prisma.setting.findMany()
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]))
  return {
    companyName: map["company.name"] || "Abu Twins",
    productName: map["company.product"] || "Abu Twins Softskills",
    currency: map["company.currency"] || "NGN",
    allowBelowMinimum: map["sales.allow_below_minimum"] === "true",
    lowStockThreshold: Number(map["inventory.low_stock_threshold"] || 3) || 3,
    warrantyDays: Number(map["sales.warranty_days"] || 365) || 365,
  }
}

export function lowStockLimit(minStock: number, threshold: number) {
  return minStock > 0 ? minStock : threshold
}
