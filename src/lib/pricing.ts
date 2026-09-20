import { money } from "@/lib/utils"

/**
 * Every rule about what a thing may be sold for lives here, so the till and the
 * shop system cannot drift apart. They used to hold the same rule in two places
 * and answer differently: the till floored a sale at the standard selling price
 * while the price list floored it at the lowest allowed price.
 *
 * The shop's own words for these figures:
 *   cost      what we paid for it
 *   lowest    the lowest a member of staff may sell it for
 *   standard  what the till offers first
 *   reseller  what a reseller is quoted, worked out from cost
 */

export type PriceBasis = {
  costPrice: number
  minimumPrice: number
  sellingPrice: number
  /** Reseller markup over cost for this item's category, as a percentage. */
  resellerMarkup?: number
}

/** What a reseller is quoted: cost plus the category markup. 0 when no markup is set. */
export function resellerPrice(basis: PriceBasis) {
  const cost = money(basis.costPrice)
  const markup = Number(basis.resellerMarkup ?? 0)
  if (!(cost > 0) || !Number.isFinite(markup) || markup <= 0) return 0
  return money(cost * (1 + markup / 100))
}

/**
 * The lowest price staff may charge without the CEO or Super Admin.
 *
 * Retail: the item's lowest allowed price. On a reseller sale the reseller
 * quote is a price we are willing to take, so it opens the floor when it sits
 * under the lowest allowed price.
 *
 * An item with no lowest allowed price falls back to the standard price, so a
 * half-filled item cannot be sold for a naira. Cost is the other guard, and it
 * is checked separately — see `belowCost`.
 */
export function sellFloor(basis: PriceBasis, opts?: { reseller?: boolean }) {
  const lowest = money(basis.minimumPrice)
  const retailFloor = lowest > 0 ? lowest : money(basis.sellingPrice)
  if (!opts?.reseller) return retailFloor
  const quote = resellerPrice(basis)
  if (!(quote > 0)) return retailFloor
  return Math.min(retailFloor, quote)
}

/** What the till puts on a new line: the reseller quote on a reseller sale, else the standard price. */
export function openingPrice(basis: PriceBasis, opts?: { reseller?: boolean }) {
  if (opts?.reseller) {
    const quote = resellerPrice(basis)
    if (quote > 0) return quote
  }
  const standard = money(basis.sellingPrice)
  return standard > 0 ? standard : sellFloor(basis, opts)
}

/** True when this price loses the shop money on the item itself. */
export function belowCost(unitPrice: number, costPrice: number) {
  const cost = money(costPrice)
  return cost > 0 && money(unitPrice) < cost
}

/** What the shop keeps on a line, in naira and as a share of the price charged. */
export function lineMargin(unitPrice: number, costPrice: number, quantity = 1) {
  const price = money(unitPrice)
  const cost = money(costPrice)
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1
  const amount = money((price - cost) * qty)
  const percent = price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : 0
  return { amount, percent, hasCost: cost > 0 }
}

/** How far a charged price fell below the standard one. 0 when it did not. */
export function discountOff(listPrice: number, unitPrice: number, quantity = 1) {
  const list = money(listPrice)
  const charged = money(unitPrice)
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1
  if (!(list > charged)) return 0
  return money((list - charged) * qty)
}

/** A reason is only demanded where the money is genuinely at risk. */
export function needsReason(args: { unitPrice: number; floor: number; costPrice: number }) {
  return money(args.unitPrice) < money(args.floor) || belowCost(args.unitPrice, args.costPrice)
}
