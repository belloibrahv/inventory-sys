"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { canSell, canSeeCost, isShopOwner } from "@/lib/rbac"
import { writeAudit } from "@/lib/audit"
import { signPriceApproval, type ApprovedDeal } from "@/lib/price-approval"
import { belowCost, sellFloor } from "@/lib/pricing"
import { formatCurrency, generateDocNumber, money } from "@/lib/utils"

/**
 * Price approvals asked for from the till and answered in the app.
 *
 * The seller used to hand the till to the CEO or main admin, who typed their
 * own email and password on it. Now the seller sends a request; both approvers
 * see it straight away wherever they are in the app (see NotificationCenter),
 * and the first answer decides. On yes, the signed approval for this exact
 * deal is handed back to the seller's till, which sends it with the sale as
 * before, so checkout still refuses any price that was not approved.
 */

/** A request nobody answers in this long lapses; the seller can send it again. */
const PENDING_MINUTES = 30

/** The link a price-request alert opens. Also how its alerts are found again. */
export async function priceRequestLink(id: string) {
  return `/approvals?price=${id}`
}

type SummaryLine = {
  name: string
  unit: string | null
  quantity: number
  asked: number
  standard: number
  floor: number
  underFloor: boolean
  underCost: boolean
  reason: string
}

type Summary = {
  lines: SummaryLine[]
  orderDiscount: number
  discountReason: string
  gross: number
  total: number
}

async function approvers() {
  return prisma.user.findMany({
    where: { isActive: true, role: { in: ["CEO", "SUPER_ADMIN"] } },
    select: { id: true, name: true, role: true },
  })
}

/** Pending requests past their time become EXPIRED, and their alerts are closed. */
async function expireStale() {
  const cutoff = new Date(Date.now() - PENDING_MINUTES * 60 * 1000)
  const stale = await prisma.priceRequest.findMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    select: { id: true },
  })
  if (stale.length === 0) return
  await prisma.priceRequest.updateMany({
    where: { id: { in: stale.map((row) => row.id) }, status: "PENDING" },
    data: { status: "EXPIRED" },
  })
  await prisma.notification.updateMany({
    where: { actionUrl: { in: await Promise.all(stale.map((row) => priceRequestLink(row.id))) }, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  })
}

/**
 * The seller asks for this deal to be approved. Prices, names and the floor
 * are read from the shop's own records, not taken from the till, so the
 * approver sees what the sale will really be.
 */
export async function requestPriceApproval(input: {
  branchId: string
  deal: ApprovedDeal
  /** Why, per line, in the same order as deal.items. */
  reasons?: string[]
  discountReason?: string
  customerName?: string
}) {
  const seller = await requireUser()
  if (!(await canSell(seller.role))) return { error: "You are not allowed to sell. Ask the main admin." }
  if (!input.deal?.items?.length) return { error: "Add at least one item." }
  const branch = await prisma.branch.findFirst({ where: { id: input.branchId, isActive: true }, select: { id: true, name: true, code: true } })
  if (!branch) return { error: "Pick the shop this sale is in." }

  const products = await prisma.product.findMany({
    where: { id: { in: input.deal.items.map((item) => item.productId) } },
    select: { id: true, name: true, storage: true, costPrice: true, minimumPrice: true, sellingPrice: true, category: { select: { resellerMarkup: true } } },
  })
  const imeis = await prisma.imeiRecord.findMany({
    where: { id: { in: input.deal.items.map((item) => item.imeiId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, imei1: true, serialNumber: true },
  })
  const byProduct = new Map(products.map((row) => [row.id, row]))
  const byImei = new Map(imeis.map((row) => [row.id, row]))

  const lines: SummaryLine[] = []
  for (const [index, item] of input.deal.items.entries()) {
    const product = byProduct.get(item.productId)
    if (!product) return { error: "One item on this sale is no longer on the list. Refresh the till." }
    const basis = {
      costPrice: money(product.costPrice),
      minimumPrice: money(product.minimumPrice),
      sellingPrice: money(product.sellingPrice),
      resellerMarkup: money(product.category.resellerMarkup),
    }
    const floor = sellFloor(basis, { reseller: Boolean(input.deal.wholesale) })
    const asked = money(item.unitPrice)
    const unit = item.imeiId ? byImei.get(item.imeiId) : null
    lines.push({
      // Most names already carry the storage ("iPhone 17 Pro Max 256GB").
      name:
        product.storage && !product.name.toLowerCase().includes(product.storage.toLowerCase())
          ? `${product.name} ${product.storage}`
          : product.name,
      unit: unit ? unit.imei1 || unit.serialNumber : null,
      quantity: Number(item.quantity) || 1,
      asked,
      standard: basis.sellingPrice,
      floor,
      underFloor: asked < floor,
      underCost: belowCost(asked, basis.costPrice),
      reason: String(input.reasons?.[index] ?? "").trim(),
    })
  }
  // Going under the lowest price is a special sale, and the CEO or main admin
  // decides it on the reason: no reason, no request.
  const unexplained = lines.find((line) => (line.underFloor || line.underCost) && !line.reason)
  if (unexplained) {
    return { error: `Say why ${unexplained.name} is going below the lowest allowed price before asking for approval.` }
  }
  const gross = lines.reduce((sum, line) => sum + line.asked * line.quantity, 0)
  const orderDiscount = Math.max(0, money(input.deal.orderDiscount ?? 0))
  const total = Math.max(0, gross - orderDiscount)
  const summary: Summary = { lines, orderDiscount, discountReason: String(input.discountReason ?? "").trim(), gross, total }
  if (orderDiscount > 0 && !summary.discountReason) {
    const floorTotal = lines.reduce((sum, line) => sum + line.floor * line.quantity, 0)
    if (total < floorTotal) return { error: "Say why this order is going below what the stock may be sold for before asking for approval." }
  }

  const people = await approvers()
  if (people.length === 0) return { error: "There is no CEO or main admin login to send this to." }

  // One open request per seller: a new ask replaces the one before it.
  await prisma.priceRequest.updateMany({
    where: { sellerId: seller.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  })

  const request = await prisma.priceRequest.create({
    data: {
      requestNumber: generateDocNumber("PRQ"),
      branchId: branch.id,
      sellerId: seller.id,
      deal: JSON.stringify(input.deal),
      summary: JSON.stringify(summary),
      total: total.toFixed(2),
      reason: [summary.discountReason, ...lines.map((line) => line.reason)].filter(Boolean).join(" · ") || null,
      customerName: String(input.customerName ?? "").trim() || null,
    },
  })

  const link = await priceRequestLink(request.id)
  const flagged = lines.filter((line) => line.underFloor || line.underCost)
  const first = flagged[0] ?? lines[0]
  const headline = `${first.name} at ${formatCurrency(first.asked)} (lowest ${formatCurrency(first.floor)})`
  await prisma.notification.createMany({
    data: people.map((person) => ({
      userId: person.id,
      type: "PRICE_REQUEST" as const,
      title: `Price approval · ${branch.code}`,
      message: `${seller.name ?? "A seller"} asks: ${headline}${flagged.length > 1 ? ` and ${flagged.length - 1} more` : ""}. Sale total ${formatCurrency(total)}.`,
      actionUrl: link,
    })),
  })
  await writeAudit({
    userId: seller.id,
    action: "CREATE",
    entityType: "PriceRequest",
    entityId: request.requestNumber,
    newValue: JSON.stringify({ total, lines: lines.length, flagged: flagged.length, orderDiscount }),
    branchId: branch.id,
    risk: "MEDIUM",
  })
  revalidatePath("/approvals")
  return {
    request: {
      id: request.id,
      requestNumber: request.requestNumber,
      sentTo: people.map((person) => person.name || (person.role === "CEO" ? "CEO" : "Main admin")),
    },
  }
}

/** The seller's till asks where its request stands. Only the seller gets the approval. */
export async function getMyPriceRequest(id: string) {
  const seller = await requireUser()
  await expireStale()
  const row = await prisma.priceRequest.findFirst({
    where: { id, sellerId: seller.id },
    select: {
      status: true,
      requestNumber: true,
      approvalToken: true,
      decisionNote: true,
      decidedAt: true,
      decidedBy: { select: { name: true } },
    },
  })
  if (!row) return { error: "That request is not yours, or it is gone." }
  return {
    status: row.status,
    requestNumber: row.requestNumber,
    decidedBy: row.decidedBy?.name ?? null,
    note: row.decisionNote,
    approval: row.status === "APPROVED" ? row.approvalToken : null,
  }
}

export async function cancelPriceRequest(id: string) {
  const seller = await requireUser()
  const done = await prisma.priceRequest.updateMany({
    where: { id, sellerId: seller.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  })
  if (done.count) {
    await prisma.notification.updateMany({
      where: { actionUrl: await priceRequestLink(id), status: "UNREAD" },
      data: { status: "READ", readAt: new Date() },
    })
  }
  revalidatePath("/approvals")
  return { success: true }
}

export type PendingPriceRequest = {
  id: string
  requestNumber: string
  shop: string
  seller: string
  customerName: string | null
  createdAt: string
  minutesLeft: number
  summary: Summary
  /** Cost and margin, for those who may see cost. */
  margin: { cost: number; kept: number } | null
}

/** What waits for the CEO or main admin. Empty for anyone else. */
export async function getPendingPriceRequests(): Promise<PendingPriceRequest[]> {
  const user = await requireUser()
  if (!isShopOwner(user.role)) return []
  await expireStale()
  const rows = await prisma.priceRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 20,
    include: { seller: { select: { name: true } }, branch: { select: { name: true, code: true } } },
  })
  const showCost = canSeeCost(user.role)
  const costs = showCost
    ? new Map(
        (
          await prisma.product.findMany({
            where: { id: { in: rows.flatMap((row) => (JSON.parse(row.deal) as ApprovedDeal).items.map((item) => item.productId)) } },
            select: { id: true, costPrice: true },
          })
        ).map((row) => [row.id, money(row.costPrice)])
      )
    : null
  return rows.map((row) => {
    const summary = JSON.parse(row.summary) as Summary
    const deal = JSON.parse(row.deal) as ApprovedDeal
    const cost = costs ? deal.items.reduce((sum, item) => sum + (costs.get(item.productId) ?? 0) * (Number(item.quantity) || 1), 0) : 0
    return {
      id: row.id,
      requestNumber: row.requestNumber,
      shop: `${row.branch.name} (${row.branch.code})`,
      seller: row.seller.name ?? "A seller",
      customerName: row.customerName,
      createdAt: row.createdAt.toISOString(),
      minutesLeft: Math.max(0, Math.ceil(PENDING_MINUTES - (Date.now() - row.createdAt.getTime()) / 60000)),
      summary,
      margin: costs ? { cost, kept: summary.total - cost } : null,
    }
  })
}

/** The CEO or main admin answers. The first answer wins; a second one is told it was already decided. */
export async function decidePriceRequest(input: { id: string; approve: boolean; note?: string }) {
  const user = await requireUser()
  if (!isShopOwner(user.role)) return { error: "Only the CEO or the main admin can answer price approvals." }
  await expireStale()
  const row = await prisma.priceRequest.findUnique({
    where: { id: input.id },
    include: { branch: { select: { code: true } } },
  })
  if (!row) return { error: "That request is gone." }
  const note = String(input.note ?? "").trim() || null
  const approverName = user.name || user.email
  const token = input.approve
    ? signPriceApproval({ approverId: user.id, approverName, sellerId: row.sellerId, deal: JSON.parse(row.deal) as ApprovedDeal })
    : null

  const decided = await prisma.priceRequest.updateMany({
    where: { id: row.id, status: "PENDING" },
    data: {
      status: input.approve ? "APPROVED" : "DECLINED",
      decidedById: user.id,
      decidedAt: new Date(),
      decisionNote: note,
      approvalToken: token,
    },
  })
  if (decided.count !== 1) {
    const now = await prisma.priceRequest.findUnique({
      where: { id: row.id },
      select: { status: true, decidedBy: { select: { name: true } } },
    })
    const who = now?.decidedBy?.name
    return {
      error:
        now?.status === "APPROVED" || now?.status === "DECLINED"
          ? `${who ?? "Someone"} already ${now.status === "APPROVED" ? "approved" : "declined"} this.`
          : now?.status === "EXPIRED"
            ? "This request ran out of time. The seller can send it again."
            : "The seller cancelled this request.",
    }
  }

  const link = await priceRequestLink(row.id)
  // Close the alert for every approver, and tell the seller.
  await prisma.notification.updateMany({
    where: { actionUrl: link, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  })
  const summary = JSON.parse(row.summary) as Summary
  await prisma.notification.create({
    data: {
      userId: row.sellerId,
      type: "PRICE_REQUEST",
      title: input.approve ? "Price approved" : "Price declined",
      message: `${approverName} ${input.approve ? "approved" : "declined"} your sale of ${formatCurrency(summary.total)} (${row.requestNumber})${note ? `: "${note}"` : "."}`,
      actionUrl: "/pos",
    },
  })
  await writeAudit({
    userId: user.id,
    action: input.approve ? "APPROVE" : "REJECT",
    entityType: "PriceApproval",
    entityId: row.requestNumber,
    newValue: JSON.stringify({ seller: row.sellerId, total: money(row.total), note, deal: JSON.parse(row.deal) }),
    branchId: row.branchId,
    risk: "MEDIUM",
  })
  revalidatePath("/approvals")
  return { success: true, message: input.approve ? `Approved ${row.requestNumber}.` : `Declined ${row.requestNumber}.` }
}

/** The last answers given, for the record on Needs approval. CEO and main admin only. */
export async function getRecentPriceDecisions(limit = 15) {
  const user = await requireUser()
  if (!isShopOwner(user.role)) return []
  const rows = await prisma.priceRequest.findMany({
    where: { status: { in: ["APPROVED", "DECLINED", "USED", "EXPIRED", "CANCELLED"] } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      seller: { select: { name: true } },
      decidedBy: { select: { name: true } },
      branch: { select: { code: true } },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    requestNumber: row.requestNumber,
    status: row.status,
    shop: row.branch.code,
    seller: row.seller.name ?? "A seller",
    decidedBy: row.decidedBy?.name ?? null,
    note: row.decisionNote,
    total: money(row.total),
    at: (row.decidedAt ?? row.updatedAt).toISOString(),
  }))
}
