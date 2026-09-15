"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { can } from "@/lib/permissions"
import { scopedBranchId } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { recentWatDays, shiftWatDay, watBounds, watDayKey } from "@/lib/lagos-day"
import { money } from "@/lib/utils"
import { viewBranchFilter } from "@/lib/branch-scope"

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
    href: `/finance/close?date=${dates[0]}&branchId=${shopId}`,
    message: `This shop has not closed ${dates[0]}${dates.length > 1 ? ` and ${dates.length - 1} more day(s)` : ""}. Count the till before any new sale.`,
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
      alreadyClosed: false,
      closedRecord: null,
      branchId: "",
      branchName: "",
      businessDate: watDayKey(),
      unclosed: [] as string[],
    }
  }
  const shopId = await resolveShop(user, branchId)
  const [unclosed, shop] = await Promise.all([
    shopId ? getUnclosedBusinessDays(shopId) : Promise.resolve([]),
    shopId ? prisma.branch.findUnique({ where: { id: shopId }, select: { name: true } }) : Promise.resolve(null),
  ])
  const day = businessDate && businessDate.length === 10 ? businessDate : watDayKey()
  const { start, end } = watBounds(day)
  const [sales, existing] = await Promise.all([
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

  let expectedCash = 0
  let transferTotal = 0
  let posTotal = 0

  for (const sale of sales) {
    if (sale.payments && sale.payments.length > 0) {
      for (const p of sale.payments) {
        const amt = money(p.amount)
        if (p.method === "CASH") expectedCash += amt
        else if (p.method === "TRANSFER") transferTotal += amt
        else if (p.method === "POS") posTotal += amt
      }
    } else {
      const paid = money(sale.paidAmount)
      if (sale.paymentMethod === "CASH") expectedCash += paid
      else if (sale.paymentMethod === "TRANSFER") transferTotal += paid
      else if (sale.paymentMethod === "POS") posTotal += paid
    }
  }

  const creditTotal = sales.reduce((sum, sale) => sum + Math.max(0, money(sale.totalAmount) - money(sale.paidAmount)), 0)

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
