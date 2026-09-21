"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { can } from "@/lib/permissions"
import { scopedBranchId } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { recentWatDays, shiftWatDay, watBounds, watDayKey } from "@/lib/lagos-day"
import { money } from "@/lib/utils"
import { saleTenders } from "@/lib/sale-money"
import { canReachBranch, viewBranchFilter } from "@/lib/branch-scope"
import { healDuplicateDayCloses } from "@/lib/day-close-heal"
import { getAppSettings } from "@/lib/settings"

async function resolveShop(user: { role: Parameters<typeof scopedBranchId>[0]; branchId: string | null }, requested?: string) {
  const scoped = await scopedBranchId(user.role, user.branchId, requested)
  let shopId = scoped || requested || user.branchId || ""
  if (!shopId) {
    const fromCookie = await viewBranchFilter(user)
    if (fromCookie) shopId = fromCookie
  }
  if (!shopId) {
    const shop = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: [{ isHq: "desc" }, { name: "asc" }] })
    shopId = shop?.id ?? ""
  }
  return shopId
}

async function closedDates(branchId: string) {
  const rows = await prisma.dayClose.findMany({
    where: { branchId },
    select: { businessDate: true, closeDate: true },
  })
  return new Set(
    rows.map((row) => row.businessDate || watDayKey(row.closeDate)).filter((key) => key.length === 10)
  )
}

export async function getUnclosedBusinessDays(branchId: string) {
  // Exported from a "use server" file, so this is a reachable endpoint on its
  // own. Require a signed-in user and keep it to shops they may see, so a hand
  // -typed branch id cannot reveal another shop's trading days.
  const user = await requireUser()
  if (!(await canReachBranch(user, branchId))) return []
  const today = watDayKey()
  const window = recentWatDays(21).filter((day) => day !== today)
  if (!window.length) return []
  const oldest = watBounds(window[window.length - 1]).start
  const [sales, closed] = await Promise.all([
    prisma.sale.findMany({
      where: { branchId, status: "COMPLETED", saleDate: { gte: oldest } },
      select: { saleDate: true },
    }),
    closedDates(branchId),
  ])
  const sold = new Set(sales.map((sale) => watDayKey(sale.saleDate)))
  return window.filter((day) => sold.has(day) && !closed.has(day))
}

/**
 * Whether an uncounted day stops the till, and what to tell staff.
 *
 * `locked` means the sale is refused. `reminder` means days are still open but
 * trading carries on — the shop sees the days it owes without the counter going
 * dead. Which of the two applies is the shop's own setting, because a till that
 * refuses to sell costs real money on a busy morning, while a till nobody ever
 * counts costs it quietly. Selling rules holds the choice.
 */
export async function getSellLock(branchId?: string) {
  const user = await requireUser()
  const shopId = await resolveShop(user, branchId)
  const idle = {
    locked: false,
    reminder: false,
    dates: [] as string[],
    href: "/finance/close",
    message: "",
    branchId: shopId,
  }
  if (!shopId) return { ...idle, branchId: "" }
  const dates = await getUnclosedBusinessDays(shopId)
  if (!dates.length) return { ...idle, dates }

  const settings = await getAppSettings()
  const more = dates.length > 1 ? ` and ${dates.length - 1} more day(s)` : ""
  const href = `/finance/close?date=${dates[0]}&branchId=${shopId}`
  if (settings.blockSellUntilDayClosed) {
    return {
      locked: true,
      reminder: false,
      dates,
      href,
      message: `This shop has not closed ${dates[0]}${more}. Close that day before any new sale.`,
      branchId: shopId,
    }
  }
  return {
    locked: false,
    reminder: true,
    dates,
    href,
    message: `This shop still has to count the till for ${dates[0]}${more}. You can keep selling today.`,
    branchId: shopId,
  }
}

export async function getDayClosePreview(branchId?: string, businessDate?: string) {
  const user = await requireUser()
  if (!(await can(user.role, "view.finance")) && !(await can(user.role, "action.sell"))) {
    return {
      sales: [],
      totalSales: 0,
      totalPaid: 0,
      expectedCash: 0,
      transferTotal: 0,
      posTotal: 0,
      creditTotal: 0,
      saleCount: 0,
      onOlderSales: [] as Array<{
        invoice: string
        customer: string
        soldOn: string
        method: string
        amount: number
      }>,
      onOlderSalesTotal: 0,
      alreadyClosed: false,
      closedRecord: null as null | {
        id: string
        closedBy: string
        closeDate: Date
        expectedCash: number
        countedCash: number
        variance: number
        transferTotal: number
        posTotal: number
        creditTotal: number
        notes: string | null
        cashDrift: number
        liveExpectedCash: number
      },
      branchId: "",
      branchName: "",
      businessDate: watDayKey(),
      unclosed: [] as string[],
    }
  }
  const shopId = await resolveShop(user, branchId)
  await healDuplicateDayCloses()
  const [unclosed, shop] = await Promise.all([
    shopId ? getUnclosedBusinessDays(shopId) : Promise.resolve([]),
    shopId ? prisma.branch.findUnique({ where: { id: shopId }, select: { name: true } }) : Promise.resolve(null),
  ])
  const day = businessDate && businessDate.length === 10 ? businessDate : watDayKey()
  const { start, end } = watBounds(day)
  const [sales, moneyIn, existing] = await Promise.all([
    prisma.sale.findMany({
      where: {
        status: "COMPLETED",
        ...(shopId ? { branchId: shopId } : {}),
        saleDate: { gte: start, lt: end },
      },
      include: {
        customer: true,
        user: true,
        items: { include: { product: true, imei: true } },
        payments: true,
      },
      orderBy: { saleDate: "desc" },
    }),
    // Money that actually came in on this day, whichever day the sale was made.
    // Counting a debt collected today against the day the goods left meant the
    // cash was expected in a till that closed days ago — and never expected in
    // the one it was really dropped into.
    prisma.payment.findMany({
      where: {
        paidAt: { gte: start, lt: end },
        sale: { status: "COMPLETED", ...(shopId ? { branchId: shopId } : {}) },
      },
      select: {
        amount: true,
        method: true,
        paidAt: true,
        sale: { select: { invoiceNumber: true, saleDate: true, customer: { select: { name: true } } } },
      },
    }),
    shopId
      ? prisma.dayClose.findFirst({
          where: {
            branchId: shopId,
            OR: [{ businessDate: day }, { closeDate: { gte: start, lt: end } }],
          },
          include: { user: true },
        })
      : Promise.resolve(null),
  ])

  const totalSales = sales.reduce((sum, sale) => sum + money(sale.totalAmount), 0)
  const totalPaid = sales.reduce((sum, sale) => sum + money(sale.paidAmount), 0)

  // What the shop is still owed on the goods that left today. This belongs to
  // the day of the sale, so it stays with the sales.
  const creditTotal = sales.reduce((sum, sale) => sum + saleTenders(sale).credit, 0)

  // Till money is counted by the day it arrived. Each payment row carries its
  // own date, so a deposit taken at the counter and a debt paid off weeks later
  // each land on the day the money was really handed over.
  const tillMix = moneyIn.reduce(
    (acc, row) => {
      const amount = money(row.amount)
      if (row.method === "CASH") acc.cash += amount
      else if (row.method === "TRANSFER") acc.transfer += amount
      else if (row.method === "POS") acc.pos += amount
      return acc
    },
    { cash: 0, transfer: 0, pos: 0 }
  )

  // Sales old enough to predate payment rows kept their money on the sale alone.
  // Without this they would drop out of the till figures entirely.
  const legacy = sales.reduce(
    (acc, sale) => {
      if (sale.payments.length > 0) return acc
      const row = saleTenders(sale)
      acc.cash += row.cash
      acc.transfer += row.transfer
      acc.pos += row.pos
      if (row.cash === 0 && row.transfer === 0 && row.pos === 0) acc.unknown += row.collected
      return acc
    },
    { cash: 0, transfer: 0, pos: 0, unknown: 0 }
  )

  const expectedCash = tillMix.cash + legacy.cash
  const transferTotal = tillMix.transfer + legacy.transfer
  const posTotal = tillMix.pos + legacy.pos + legacy.unknown

  // Money taken today on goods that left on an earlier day. Shown on its own so
  // the till count is not mistaken for the day's trading.
  const onOlderSales = moneyIn
    .filter((row) => watDayKey(row.sale.saleDate) !== day)
    .map((row) => ({
      invoice: row.sale.invoiceNumber,
      customer: row.sale.customer?.name ?? "Walk-in",
      soldOn: watDayKey(row.sale.saleDate),
      method: row.method,
      amount: money(row.amount),
    }))
    .sort((a, b) => b.amount - a.amount)
  const onOlderSalesTotal = onOlderSales.reduce((sum, row) => sum + row.amount, 0)

  return {
    sales: sales.map((sale) => ({
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      saleDate: sale.saleDate,
      customer: sale.customer?.name ?? "Walk-in customer",
      staff: sale.user?.name ?? "Staff",
      method: sale.paymentMethod,
      paid: money(sale.paidAmount),
      total: money(sale.totalAmount),
      itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
      itemsSummary: sale.items.map((it) => `${it.quantity}x ${it.product.name}`).join(", "),
      items: sale.items.map((it) => ({
        id: it.id,
        name: it.product.name,
        storage: it.product.storage,
        condition: it.product.condition,
        color: it.product.color,
        imei: it.imei?.imei1 ?? null,
        serialNumber: it.imei?.serialNumber ?? null,
        quantity: it.quantity,
        unitPrice: money(it.unitPrice),
        totalPrice: money(it.totalPrice),
        warrantyDays: it.warrantyDays ?? 0,
      })),
    })),
    totalSales,
    totalPaid,
    expectedCash,
    transferTotal,
    posTotal,
    creditTotal,
    saleCount: sales.length,
    /** Money taken today on goods that left on an earlier day. */
    onOlderSales,
    onOlderSalesTotal,
    alreadyClosed: Boolean(existing),
    closedRecord: existing
      ? {
          id: existing.id,
          closedBy: existing.user?.name ?? "Staff",
          closeDate: existing.closeDate,
          expectedCash: money(existing.expectedCash),
          countedCash: money(existing.countedCash),
          variance: money(existing.variance),
          transferTotal: money(existing.transferTotal),
          posTotal: money(existing.posTotal),
          creditTotal: money(existing.creditTotal),
          notes: existing.notes,
          /**
           * The close keeps the figures as they stood when it was signed. When
           * the day's money has moved since, the old record still reads
           * "balanced" against a total that no longer exists — so the gap is
           * reported rather than left to be discovered in a shortfall.
           */
          cashDrift: money(money(existing.expectedCash) - expectedCash),
          liveExpectedCash: expectedCash,
        }
      : null,
    branchId: shopId,
    branchName: shop?.name ?? "",
    businessDate: day,
    unclosed,
  }
}

export async function closeDay(formData: FormData) {
  try {
    const user = await requireUser()
    if (!(await can(user.role, "action.finance")) && !(await can(user.role, "action.sell"))) {
      return { error: "You are not allowed to close the day. Ask the main admin." }
    }
    const businessDate = String(formData.get("businessDate") || watDayKey())
    const rawBranchId = String(formData.get("branchId") || "")
    const preview = await getDayClosePreview(rawBranchId || undefined, businessDate)
    if (!preview.branchId) return { error: "Choose a shop." }
    if (preview.alreadyClosed) return { error: "This shop already closed that day." }
    // Cash remittance is only required when cash came into the till. Transfer
    // and POS days still close, so Sell now can open tomorrow, but with ₦0 remitted.
    let countedCash = 0
    if (preview.expectedCash > 0) {
      const raw = String(formData.get("countedCash") ?? "").trim()
      if (!raw) return { error: "Cash came in today. Count the till and type the cash remitted." }
      countedCash = Number(raw)
      if (Number.isNaN(countedCash)) return { error: "Enter the cash you counted." }
    }

    // Re-check inside the posting. Two clicks on Close the day used to write two
    // closes for the same date, which then confused the till lock and the books.
    // The lasting fix is the unique index noted in scripts/check-day-closes.ts;
    // this stops the double click that actually happens on the shop floor.
    const closed = await prisma.$transaction(async (tx) => {
      const existing = await tx.dayClose.findFirst({
        where: { branchId: preview.branchId, businessDate },
        select: { id: true },
      })
      if (existing) return null
      return tx.dayClose.create({
        data: {
          branchId: preview.branchId,
          userId: user.id,
          closeDate: new Date(),
          businessDate,
          expectedCash: preview.expectedCash.toFixed(2),
          countedCash: countedCash.toFixed(2),
          variance: (countedCash - preview.expectedCash).toFixed(2),
          transferTotal: preview.transferTotal.toFixed(2),
          posTotal: preview.posTotal.toFixed(2),
          creditTotal: preview.creditTotal.toFixed(2),
          saleCount: preview.saleCount,
          notes: String(formData.get("notes") || "") || null,
        },
      })
    })
    if (!closed) return { error: "This shop already closed that day." }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entityType: "DayClose",
        entityId: `${preview.branchId}:${businessDate}`,
        newValue: JSON.stringify({ businessDate, expectedCash: preview.expectedCash, countedCash }),
        branchId: preview.branchId,
      },
    })
    revalidatePath("/finance/close")
    revalidatePath("/finance")
    revalidatePath("/reports")
    revalidatePath("/audit/books")
    revalidatePath("/pos")
    revalidatePath("/dashboard")
    const leftover = await getUnclosedBusinessDays(preview.branchId)
    return {
      success: true,
      redirectTo: leftover[0]
        ? `/finance/close?date=${leftover[0]}&branchId=${preview.branchId}`
        : `/finance/close?branchId=${preview.branchId}&date=${businessDate}`,
    }
  } catch (error) {
    console.error("Failed to close day:", error)
    return { error: error instanceof Error ? error.message : "Failed to close the day. Please try again." }
  }
}

export async function getDayCloses(requestedBranchId?: string) {
  const user = await requireUser()
  if (!(await can(user.role, "view.finance"))) return []
  const branchId = await resolveShop(user, requestedBranchId)
  const rows = await prisma.dayClose.findMany({
    where: branchId ? { branchId } : {},
    include: { branch: true, user: true },
    orderBy: { closeDate: "desc" },
    take: 40,
  })
  return rows.map((row) => {
    const expectedCash = money(row.expectedCash)
    const transferTotal = money(row.transferTotal)
    const posTotal = money(row.posTotal)
    const creditTotal = money(row.creditTotal)
    const totalSales = expectedCash + transferTotal + posTotal + creditTotal
    return {
      id: row.id,
      branch: row.branch.name,
      user: row.user.name,
      closeDate: row.closeDate,
      businessDate: row.businessDate || watDayKey(row.closeDate),
      totalSales,
      expectedCash,
      countedCash: money(row.countedCash),
      variance: money(row.variance),
      transferTotal,
      posTotal,
      creditTotal,
      saleCount: row.saleCount,
      notes: row.notes,
    }
  })
}
