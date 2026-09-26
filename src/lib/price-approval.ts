import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { money } from "@/lib/utils"

/**
 * A CEO or Super Admin can let a seller's sale go under the lowest allowed
 * price, or under cost, by typing their own password on the seller's till.
 *
 * What they sign off is this exact deal: these items, at these prices, with
 * this order discount, for this seller. Change a price afterwards and the
 * approval no longer fits, so it cannot be reused for a different deal.
 *
 * It lasts a day so a sale parked on the phone while the network was down can
 * still post with the approval it was given.
 */

const LIFETIME_MS = 24 * 60 * 60 * 1000

export type ApprovedDeal = {
  wholesale?: boolean
  orderDiscount?: number
  items: Array<{ productId: string; imeiId?: string; quantity: number; unitPrice: number }>
}

type Claim = { a: string; n: string; s: string; h: string; t: number }

function secret() {
  return process.env.NEXTAUTH_SECRET || "development-only-price-approval"
}

function dealHash(deal: ApprovedDeal) {
  const lines = deal.items
    .map((item) => [item.productId, item.imeiId ?? "", Number(item.quantity) || 0, money(item.unitPrice)].join(":"))
    .sort()
  const body = [deal.wholesale ? "R" : "S", money(deal.orderDiscount ?? 0), ...lines].join("|")
  return createHash("sha256").update(body).digest("base64url")
}

function sign(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url")
}

export function signPriceApproval(args: {
  approverId: string
  approverName: string
  sellerId: string
  deal: ApprovedDeal
}) {
  const claim: Claim = {
    a: args.approverId,
    n: args.approverName,
    s: args.sellerId,
    h: dealHash(args.deal),
    t: Date.now(),
  }
  const body = Buffer.from(JSON.stringify(claim)).toString("base64url")
  return `${body}.${sign(body)}`
}

/** The approver on a valid approval for this seller and this deal, else null. */
export function readPriceApproval(token: string | undefined, sellerId: string, deal: ApprovedDeal) {
  if (!token) return null
  const [body, mac] = token.split(".")
  if (!body || !mac) return null
  const expected = Buffer.from(sign(body))
  const given = Buffer.from(mac)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  let claim: Claim
  try {
    claim = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (claim.s !== sellerId) return null
  if (!(Date.now() - claim.t < LIFETIME_MS)) return null
  if (claim.h !== dealHash(deal)) return null
  return { approverId: claim.a, approverName: claim.n }
}
