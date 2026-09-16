import { money } from "@/lib/utils"
import { isOpeningStockPurchase } from "@/lib/purchase-money"

export const SUPPLIER_RETURNABLE_STATUSES = ["IN_STOCK", "FAULTY", "RETURNED"] as const

export function isSupplierReturnableStatus(status: string) {
  return (SUPPLIER_RETURNABLE_STATUSES as readonly string[]).includes(status)
}

/** Cost on the supplier bill line, or the item cost if that line is missing. */
export function unitCostForReturn(lineCost: unknown, productCost: unknown) {
  const line = money(lineCost)
  if (line > 0) return line
  return money(productCost)
}

export function supplierReturnMoneyPlan(input: {
  supplierId?: string | null
  productId: string
  productCost: unknown
  purchase?: {
    invoiceNumber?: string | null
    notes?: string | null
    openingStock?: unknown
    items?: Array<{ productId: string; costPrice: unknown }>
  } | null
}) {
  const line = input.purchase?.items?.find((item) => item.productId === input.productId)
  const cost = unitCostForReturn(line?.costPrice, input.productCost)
  if (!input.supplierId) {
    return { cost, moneyMoves: false, reason: "no-supplier" as const }
  }
  if (input.purchase && isOpeningStockPurchase(input.purchase)) {
    return { cost, moneyMoves: false, reason: "opening-stock" as const }
  }
  if (cost <= 0) {
    return { cost: 0, moneyMoves: false, reason: "no-cost" as const }
  }
  if (input.purchase) {
    return { cost, moneyMoves: true, reason: "bill" as const }
  }
  return { cost, moneyMoves: true, reason: "house-credit" as const }
}
