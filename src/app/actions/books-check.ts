"use server"

import { prisma } from "@/lib/prisma"
import { can } from "@/lib/permissions"
import { scopedBranchId } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { verifyAuditChain } from "@/lib/audit"
import { getUnclosedBusinessDays } from "@/app/actions/day-close"
import { getParkedWatch } from "@/app/actions/parked"
import { recentWatDays, shiftWatDay, watBounds, watDayKey } from "@/lib/lagos-day"
import { getAppSettings } from "@/lib/settings"
import { money } from "@/lib/utils"

export type BooksRange = "day" | "week" | "month"

function periodWindow(day: string, range: BooksRange) {
  if (range === "week") {
    const from = shiftWatDay(day, -6)
    return { from, to: day, start: watBounds(from).start, end: watBounds(day).end }
  }
  if (range === "month") {
    const from = `${day.slice(0, 8)}01`
    return { from, to: day, start: watBounds(from).start, end: watBounds(day).end }
  }
  const bounds = watBounds(day)
  return { from: day, to: day, start: bounds.start, end: bounds.end }
}

function previousWindow(from: string, range: BooksRange) {
  if (range === "day") return periodWindow(shiftWatDay(from, -1), "day")
  if (range === "week") return periodWindow(shiftWatDay(from, -1), "week")
  const [year, month] = from.split("-").map(Number)
  const last = new Date(Date.UTC(year, month - 1, 0))
  return periodWindow(last.toISOString().slice(0, 10), "month")
}

function sumSales(rows: Array<{ paymentMethod: string; totalAmount: unknown; paidAmount: unknown }>) {
  const cash = rows.filter((row) => row.paymentMethod === "CASH").reduce((sum, row) => sum + money(row.paidAmount), 0)
  const transfer = rows.filter((row) => row.paymentMethod === "TRANSFER").reduce((sum, row) => sum + money(row.paidAmount), 0)
  const pos = rows.filter((row) => row.paymentMethod === "POS").reduce((sum, row) => sum + money(row.paidAmount), 0)
  const credit = rows.filter((row) => row.paymentMethod === "CREDIT").reduce((sum, row) => sum + money(row.totalAmount), 0)
  const revenue = rows.reduce((sum, row) => sum + money(row.totalAmount), 0)
  const collected = rows.reduce((sum, row) => sum + money(row.paidAmount), 0)
  return { cash, transfer, pos, credit, revenue, collected, due: revenue - collected, methodSum: cash + transfer + pos, count: rows.length }
}

export async function getBooksCheck(branchId?: string, businessDate?: string, range: BooksRange = "day", compareDate?: string) {
  const user = await requireUser()
  const allowed =
    (await can(user.role, "view.audit")) ||
    (await can(user.role, "view.finance")) ||
    (await can(user.role, "view.reports"))
  if (!allowed) return null

  const shops = await prisma.branch.findMany({
    where: { isActive: true },
    orderBy: [{ isHq: "desc" }, { name: "asc" }],
    select: { id: true, name: true, code: true },
  })
  const scoped = await scopedBranchId(user.role, user.branchId, branchId)
  const shopId = scoped || branchId || shops[0]?.id || ""
  const day = businessDate && /^\d{4}-\d{2}-\d{2}$/.test(businessDate) ? businessDate : watDayKey()
  const span = range === "week" || range === "month" ? range : "day"
  const window = periodWindow(day, span)
  const compareDay = compareDate && /^\d{4}-\d{2}-\d{2}$/.test(compareDate) ? compareDate : ""
  const prior = compareDay ? periodWindow(compareDay, span) : previousWindow(window.from, span)
  const shopWhere = shopId ? { branchId: shopId } : {}
  const recentDays = recentWatDays(14, day)
  const recentStart = watBounds(recentDays[recentDays.length - 1]).start

  const [sales, priorSales, expenses, priorExpenses, purchases, priorPurchases, closes, debtors, creditors, stock, vaultCounts, products, unclosed, parked, walkIns, integrity, highRisk, failedLogins, recentSaleDates, recentCloses, settings] =
    await Promise.all([
      prisma.sale.findMany({
        where: { status: "COMPLETED", ...shopWhere, saleDate: { gte: window.start, lt: window.end } },
        include: { customer: true, user: { select: { name: true } } },
        orderBy: { saleDate: "desc" },
      }),
      prisma.sale.findMany({
        where: { status: "COMPLETED", ...shopWhere, saleDate: { gte: prior.start, lt: prior.end } },
        select: { paymentMethod: true, totalAmount: true, paidAmount: true },
      }),
      prisma.expense.aggregate({
        where: { ...shopWhere, date: { gte: window.start, lt: window.end }, approvedAt: { not: null } },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: { ...shopWhere, date: { gte: prior.start, lt: prior.end }, approvedAt: { not: null } },
        _sum: { amount: true },
      }),
      prisma.purchase.aggregate({
        where: { ...shopWhere, createdAt: { gte: window.start, lt: window.end } },
        _sum: { paidAmount: true },
      }),
      prisma.purchase.aggregate({
        where: { ...shopWhere, createdAt: { gte: prior.start, lt: prior.end } },
        _sum: { paidAmount: true },
      }),
      shopId
        ? prisma.dayClose.findMany({
            where: {
              branchId: shopId,
              OR: [
                { businessDate: { gte: window.from, lte: window.to } },
                { closeDate: { gte: window.start, lt: window.end } },
              ],
            },
            include: { user: { select: { name: true } } },
            orderBy: { businessDate: "asc" },
          })
        : Promise.resolve([]),
      prisma.customer.aggregate({
        where: shopId ? { branchId: shopId } : {},
        _sum: { currentBalance: true },
      }),
      prisma.purchase.findMany({
        where: { ...(shopId ? { branchId: shopId } : {}), status: { not: "CANCELLED" } },
        select: { totalAmount: true, paidAmount: true },
      }),
      prisma.inventory.findMany({
        where: shopId ? { branchId: shopId } : {},
        include: { product: true, branch: true },
      }),
      prisma.imeiRecord.groupBy({
        by: ["productId", "branchId"],
        where: { status: "IN_STOCK", ...(shopId ? { branchId: shopId } : {}) },
        _count: { _all: true },
      }),
      prisma.product.findMany({ select: { id: true, name: true, tracking: true } }),
      shopId ? getUnclosedBusinessDays(shopId) : Promise.resolve([]),
      getParkedWatch(),
      prisma.sale.count({
        where: { status: "COMPLETED", ...shopWhere, customerId: null, saleDate: { gte: window.start, lt: window.end } },
      }),
      verifyAuditChain(),
      prisma.auditLog.count({
        where: { risk: "HIGH", createdAt: { gte: window.start, lt: window.end } },
      }),
      prisma.auditLog.count({
        where: { action: "LOGIN", success: false, createdAt: { gte: window.start, lt: window.end } },
      }),
      prisma.sale.findMany({
        where: { status: "COMPLETED", ...shopWhere, saleDate: { gte: recentStart, lt: window.end } },
        select: { saleDate: true },
      }),
      shopId
        ? prisma.dayClose.findMany({
            where: { branchId: shopId, OR: [{ businessDate: { in: recentDays } }, { closeDate: { gte: recentStart, lt: window.end } }] },
            select: { businessDate: true, closeDate: true },
          })
        : Promise.resolve([]),
      getAppSettings(),
    ])

  const now = sumSales(sales)
  const then = sumSales(priorSales)
  const expenseNow = money(expenses._sum.amount)
  const expenseThen = money(priorExpenses._sum.amount)
  const paidNow = money(purchases._sum.paidAmount)
  const paidThen = money(priorPurchases._sum.paidAmount)
  const change = (current: number, previous: number) => {
    if (!previous) return { value: current ? "New" : "0", amount: current - previous, up: current >= previous }
    const pct = ((current - previous) / previous) * 100
    return { value: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, amount: current - previous, up: pct >= 0 }
  }
  const soldOn = new Map<string, number>()
  for (const sale of recentSaleDates) {
    const key = watDayKey(sale.saleDate)
    soldOn.set(key, (soldOn.get(key) ?? 0) + 1)
  }
  const closedOn = new Set(recentCloses.map((row) => row.businessDate || watDayKey(row.closeDate)))
  const shop = shops.find((row) => row.id === shopId)

  const supplierOwed = creditors.reduce((sum, row) => sum + money(row.totalAmount) - money(row.paidAmount), 0)
  const closeForDay = span === "day" ? closes.find((row) => (row.businessDate || "") === day) ?? closes[0] ?? null : null
  const expectedCash = now.cash
  const countedCash = closeForDay ? money(closeForDay.countedCash) : null
  const variance = countedCash == null ? null : countedCash - expectedCash
  const closeVariances = closes.filter((row) => money(row.variance) !== 0)

  const imeiRows = stock
    .filter((row) => {
      const product = products.find((item) => item.id === row.productId)
      return product && product.tracking !== "NONE"
    })
    .map((row) => {
      const imeis = vaultCounts.find((item) => item.productId === row.productId && item.branchId === row.branchId)?._count._all ?? 0
      return {
        product: row.product.name,
        shop: row.branch.code,
        shopQty: row.quantity,
        imeis,
        delta: imeis - row.quantity,
      }
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const imeiGaps = imeiRows.filter((row) => row.delta !== 0)

  const byStaff = Object.values(
    sales.reduce<Record<string, { name: string; count: number; collected: number }>>((acc, sale) => {
      const name = sale.user?.name ?? "Unknown"
      acc[name] = acc[name] ?? { name, count: 0, collected: 0 }
      acc[name].count += 1
      acc[name].collected += money(sale.paidAmount)
      return acc
    }, {})
  ).sort((a, b) => b.collected - a.collected)

  const papers = [
    {
      ok: integrity.ok,
      label: "The trail of who did what",
      detail: integrity.ok ? `We checked ${integrity.checked} locked rows. Nobody changed a past action.` : "A locked row has changed. Keep a backup and treat it like somebody broke in.",
      href: "/audit",
    },
    {
      ok: unclosed.length === 0,
      label: "Till counted every day",
      detail: unclosed.length ? `${unclosed.length} old day(s) with sales are still not closed. Sell now stays locked until you close them.` : "Every old day with sales has been counted.",
      href: "/finance/close",
    },
    {
      ok: span !== "day" || now.count === 0 || Boolean(closeForDay),
      label: "This day is closed",
      detail:
        span !== "day"
          ? `${closes.length} day(s) were closed in this time.`
          : closeForDay
            ? `We counted ${money(closeForDay.countedCash).toFixed(0)}. It should have been ${expectedCash.toFixed(0)}.`
            : now.count
              ? "This day has sales but nobody has closed it."
              : "No sale happened this day, so there is nothing to close.",
      href: `/finance/close?date=${day}`,
    },
    {
      ok: closeVariances.length === 0,
      label: "Till money matches cash sales",
      detail: closeVariances.length ? `On ${closeVariances.length} day(s) the money was short or plenty.` : "The days we closed have the right cash, or no day has been closed yet.",
      href: "/finance/close",
    },
    {
      ok: imeiGaps.length === 0,
      label: "Phones match the IMEI list",
      detail: imeiGaps.length ? `${imeiGaps.length} item(s) do not agree.` : "The shop count and the IMEI count agree for every phone and laptop.",
      href: "/dashboard#imei-check",
    },
    {
      ok: parked.sitting === 0 && parked.vanished === 0,
      label: "Waiting sales",
      detail:
        parked.sitting || parked.vanished
          ? `${parked.sitting} has been waiting too long. ${parked.vanished} disappeared from a phone.`
          : "No waiting sale is waiting too long or missing.",
      href: parked.vanished ? "/audit?risk=HIGH" : "/pos",
    },
    {
      ok: walkIns === 0,
      label: "Every sale has a buyer name",
      detail: walkIns ? `${walkIns} sale(s) have no buyer name. Nobody can bring those things back until you add a name.` : "Every sale has a buyer name.",
      href: "/sales",
    },
    {
      ok: failedLogins === 0,
      label: "People signing in",
      detail: failedLogins ? `${failedLogins} person(s) tried to sign in and failed.` : "Nobody failed to sign in.",
      href: "/audit?result=failed&action=LOGIN",
    },
    {
      ok: highRisk === 0,
      label: "Risky actions",
      detail: highRisk ? `${highRisk} risky action(s) are on Who did what. Go and look at them.` : "Nobody did anything risky.",
      href: "/audit?risk=HIGH",
    },
  ]
  const openPapers = papers.filter((row) => !row.ok)

  return {
    shops,
    shopId,
    shopName: shop?.name ?? "Shop",
    shopCode: shop?.code ?? "SHOP",
    businessDate: day,
    range: span,
    from: window.from,
    to: window.to,
    priorFrom: prior.from,
    priorTo: prior.to,
    salesCount: now.count,
    cash: now.cash,
    transfer: now.transfer,
    pos: now.pos,
    credit: now.credit,
    collected: now.collected,
    revenue: now.revenue,
    due: now.due,
    methodSum: now.methodSum,
    expenses: expenseNow,
    purchasesPaid: paidNow,
    moneyOut: expenseNow + paidNow,
    customersOwe: money(debtors._sum.currentBalance),
    supplierOwed,
    expectedCash,
    countedCash,
    variance,
    closed: Boolean(closeForDay),
    unclosed,
    parked,
    walkIns,
    highRisk,
    failedLogins,
    integrity,
    papers,
    openCount: openPapers.length,
    verdict: openPapers.length
      ? `${openPapers.length} thing${openPapers.length === 1 ? "" : "s"} must be fixed before you can say the books are clean.`
      : "The books are clean for this shop. The money, the phones, and the trail all agree.",
    compare: {
      revenue: change(now.revenue, then.revenue),
      collected: change(now.collected, then.collected),
      count: change(now.count, then.count),
      cash: change(now.cash, then.cash),
      transfer: change(now.transfer, then.transfer),
      pos: change(now.pos, then.pos),
      credit: change(now.credit, then.credit),
      due: change(now.due, then.due),
      expenses: change(expenseNow, expenseThen),
      moneyOut: change(expenseNow + paidNow, expenseThen + paidThen),
      priorRevenue: then.revenue,
      priorCollected: then.collected,
      priorCount: then.count,
      priorCash: then.cash,
      priorTransfer: then.transfer,
      priorPos: then.pos,
      priorCredit: then.credit,
      priorDue: then.due,
      priorExpenses: expenseThen,
      priorPurchasesPaid: paidThen,
      priorMoneyOut: expenseThen + paidThen,
    },
    comparePicked: Boolean(compareDay),
    recentDays: recentDays.map((key) => ({
      day: key,
      sales: soldOn.get(key) ?? 0,
      closed: closedOn.has(key),
    })),
    statementRef: `BK-${shop?.code ?? "SHOP"}-${window.from.replaceAll("-", "")}-${window.to.replaceAll("-", "")}`,
    preparedAt: new Date().toISOString(),
    preparedBy: user.name || user.email,
    company: {
      name: settings.companyName,
      product: settings.productName,
      phone: settings.companyPhone,
      address: settings.companyAddress,
      email: settings.companyEmail,
    },
    invoices: sales.slice(0, 40).map((sale) => ({
      id: sale.id,
      invoice: sale.invoiceNumber,
      when: sale.saleDate.toISOString(),
      customer: sale.customer?.name ?? "Walk-in",
      staff: sale.user?.name ?? "Unknown",
      method: sale.paymentMethod,
      total: money(sale.totalAmount),
      paid: money(sale.paidAmount),
    })),
    closes: closes.map((row) => ({
      id: row.id,
      day: row.businessDate || row.closeDate.toISOString().slice(0, 10),
      staff: row.user.name,
      expected: money(row.expectedCash),
      counted: money(row.countedCash),
      variance: money(row.variance),
      sales: row.saleCount,
    })),
    byStaff,
    imeiGaps: imeiGaps.length,
    imeiRows: imeiRows.slice(0, 20),
  }
}

export type BooksCheck = NonNullable<Awaited<ReturnType<typeof getBooksCheck>>>
