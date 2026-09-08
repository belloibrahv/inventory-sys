"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { can } from "@/lib/permissions"
import { scopedBranchId } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { recentWatDays, shiftWatDay, watBounds, watDayKey } from "@/lib/lagos-day"
import { money } from "@/lib/utils"

async function resolveShop(user: { role: Parameters<typeof scopedBranchId>[0]; branchId: string | null }, requested?: string) {
  const scoped = await scopedBranchId(user.role, user.branchId)
  let shopId = scoped || requested || user.branchId || ""
  if (!shopId) {
    const shop = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { isHq: "desc" } })
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

export async function getSellLock(branchId?: string) {
  const user = await requireUser()
  const shopId = await resolveShop(user, branchId)
  if (!shopId) return { locked: false, dates: [] as string[], href: "/finance/close", message: "", branchId: "" }
  const dates = await getUnclosedBusinessDays(shopId)
  if (!dates.length) return { locked: false, dates, href: "/finance/close", message: "", branchId: shopId }
  return {
    locked: true,
    dates,
    href: `/finance/close?date=${dates[0]}`,
    message: `This shop has not closed ${dates[0]}${dates.length > 1 ? ` and ${dates.length - 1} more day(s)` : ""}. Count the till before any new sale.`,
    branchId: shopId,
  }
}

export async function getDayClosePreview(branchId?: string, businessDate?: string) {
  const user = await requireUser()
  if (!(await can(user.role, "view.finance")) && !(await can(user.role, "action.sell"))) {
    return {
      sales: [],
      expectedCash: 0,
      transferTotal: 0,
      posTotal: 0,
      creditTotal: 0,
      saleCount: 0,
      alreadyClosed: false,
      branchId: "",
      businessDate: watDayKey(),
      unclosed: [] as string[],
    }
  }
  const shopId = await resolveShop(user, branchId)
  const unclosed = shopId ? await getUnclosedBusinessDays(shopId) : []
  const day = businessDate && businessDate.length === 10 ? businessDate : unclosed[0] || watDayKey()
  const { start, end } = watBounds(day)
  const [sales, existing] = await Promise.all([
    prisma.sale.findMany({
      where: {
        status: "COMPLETED",
        ...(shopId ? { branchId: shopId } : {}),
        saleDate: { gte: start, lt: end },
      },
      include: { customer: true },
      orderBy: { saleDate: "desc" },
    }),
    shopId
      ? prisma.dayClose.findFirst({
          where: {
            branchId: shopId,
            OR: [{ businessDate: day }, { closeDate: { gte: start, lt: end } }],
          },
        })
      : Promise.resolve(null),
  ])
  const expectedCash = sales
    .filter((sale) => sale.paymentMethod === "CASH")
    .reduce((sum, sale) => sum + money(sale.paidAmount), 0)
  const transferTotal = sales
    .filter((sale) => sale.paymentMethod === "TRANSFER")
    .reduce((sum, sale) => sum + money(sale.paidAmount), 0)
  const posTotal = sales
    .filter((sale) => sale.paymentMethod === "POS")
    .reduce((sum, sale) => sum + money(sale.paidAmount), 0)
  const creditTotal = sales
    .filter((sale) => sale.paymentMethod === "CREDIT")
    .reduce((sum, sale) => sum + money(sale.totalAmount), 0)
  return {
    sales: sales.map((sale) => ({
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      customer: sale.customer?.name ?? "Walk-in",
      method: sale.paymentMethod,
      paid: money(sale.paidAmount),
      total: money(sale.totalAmount),
    })),
    expectedCash,
    transferTotal,
    posTotal,
    creditTotal,
    saleCount: sales.length,
    alreadyClosed: Boolean(existing),
    branchId: shopId,
    businessDate: day,
    unclosed,
  }
}

export async function closeDay(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.finance")) && !(await can(user.role, "action.sell"))) {
    return { error: "You cannot close the day." }
  }
  const businessDate = String(formData.get("businessDate") || watDayKey())
  const preview = await getDayClosePreview(String(formData.get("branchId") || ""), businessDate)
  if (!preview.branchId) return { error: "Choose a shop." }
  if (preview.alreadyClosed) return { error: "This shop already closed that day." }
  const countedCash = Number(formData.get("countedCash") || 0)
  if (Number.isNaN(countedCash)) return { error: "Enter the cash you counted." }

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
  revalidatePath("/finance")
  revalidatePath("/finance/close")
  revalidatePath("/pos")
  revalidatePath("/dashboard")
  const leftover = await getUnclosedBusinessDays(preview.branchId)
  return { success: true, redirectTo: leftover[0] ? `/finance/close?date=${leftover[0]}` : "/pos" }
}

export async function getDayCloses() {
  const user = await requireUser()
  if (!(await can(user.role, "view.finance"))) return []
  const branchId = await scopedBranchId(user.role, user.branchId)
  const rows = await prisma.dayClose.findMany({
    where: branchId ? { branchId } : {},
    include: { branch: true, user: true },
    orderBy: { closeDate: "desc" },
    take: 40,
  })
  return rows.map((row) => ({
    id: row.id,
    branch: row.branch.name,
    user: row.user.name,
    closeDate: row.closeDate,
    businessDate: row.businessDate || watDayKey(row.closeDate),
    expectedCash: money(row.expectedCash),
    countedCash: money(row.countedCash),
    variance: money(row.variance),
    transferTotal: money(row.transferTotal),
    posTotal: money(row.posTotal),
    creditTotal: money(row.creditTotal),
    saleCount: row.saleCount,
    notes: row.notes,
  }))
}

export { shiftWatDay }
