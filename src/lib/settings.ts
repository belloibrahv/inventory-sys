import { prisma } from "@/lib/prisma"

export { lowStockLimit } from "@/lib/stock-limits"

export async function getAppSettings() {
  const rows = await prisma.setting.findMany()
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]))
  return {
    companyName: map["company.name"] || "Abu Twins",
    productName: map["company.product"] || "Abu Twins Softskills",
    companyPhone: map["company.phone"] || "07062454854",
    companyAddress: map["company.address"] || "Iwo Road, Ibadan",
    companyEmail: map["company.email"] || "hello@abutwins.com",
    currency: map["company.currency"] || "NGN",
    allowBelowMinimum: map["sales.allow_below_minimum"] === "true",
    lowStockThreshold: Number(map["inventory.low_stock_threshold"] || 3) || 3,
    warrantyDays: Number(map["sales.warranty_days"] || 365) || 365,
  }
}
