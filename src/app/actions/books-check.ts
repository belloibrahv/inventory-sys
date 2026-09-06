"use server"

import { prisma } from "@/lib/prisma"
import { can } from "@/lib/permissions"
import { scopedBranchId } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { verifyAuditChain } from "@/lib/audit"
import { getUnclosedBusinessDays } from "@/app/actions/day-close"
import { getParkedWatch } from "@/app/actions/parked"
import { shiftWatDay, watBounds, watDayKey } from "@/lib/lagos-day"
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

export async function getBooksCheck(branchId?: string, businessDate?: string, range: BooksRange = "day") {
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
  const prior = previousWindow(window.from, span)
  const shopWhere = shopId ? { branchId: shopId } : {}

  const [sales, priorSales, expenses, purchases, closes, debtors, creditors, stock, vaultCounts, products, unclosed, parked, walkIns, integrity, highRisk, failedLogins] =
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
      prisma.purchase.aggregate({
        where: { ...shopWhere, createdAt: { gte: window.start, lt: window.end } },
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
    ])

  const now = sumSales(sales)
  const then = sumSales(priorSales)
  const change = (current: number, previous: number) => {
    if (!previous) return { value: current ? "New" : "0", up: current >= 0 }
    const pct = ((current - previous) / previous) * 100
    return { value: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, up: pct >= 0 }
  }

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
      label: "Who did what trail",
      detail: integrity.ok ? `${integrity.checked} sealed rows checked. Nobody rewrote a past action.` : "A sealed row no longer matches. Keep a backup and treat this as a break-in.",
      href: "/audit",
    },
    {
      ok: unclosed.length === 0,
      label: "Till counted",
      detail: unclosed.length ? `${unclosed.length} older day(s) with sales are still open. Sell now stays locked.` : "Every older day with sales has a till count.",
      href: "/finance/close",
    },
    {
      ok: span !== "day" || now.count === 0 || Boolean(closeForDay),
      label: "This period close",
      detail:
        span !== "day"
          ? `${closes.length} close(s) in this period.`
          : closeForDay
            ? `Counted ${money(closeForDay.countedCash).toFixed(0)} against expected ${expectedCash.toFixed(0)}.`
            : now.count
              ? "This day has sales and is not closed."
              : "No sales this day, so no close is required.",
      href: `/finance/close?date=${day}`,
    },
    {
      ok: closeVariances.length === 0,
      label: "Till matches cash sales",
      detail: closeVariances.length ? `${closeVariances.length} close(s) have a shortfall or leftover.` : "Closed days match expected cash, or there is no close yet.",
      href: "/finance/close",
    },
    {
      ok: imeiGaps.length === 0,
      label: "Phones match IMEI list",
      detail: imeiGaps.length ? `${imeiGaps.length} product line(s) do not match.` : "Shop quantity and IMEI count match for every phone and laptop.",
      href: "/dashboard#imei-check",
    },
    {
      ok: parked.sitting === 0 && parked.vanished === 0,
      label: "Parked sales",
      detail:
        parked.sitting || parked.vanished
          ? `${parked.sitting} sitting too long. ${parked.vanished} vanished from a device.`
          : "No parked sale is sitting or missing.",
      href: parked.vanished ? "/audit?risk=HIGH" : "/pos",
    },
    {
      ok: walkIns === 0,
      label: "Buyers named",
      detail: walkIns ? `${walkIns} sale(s) in this period have no customer name. A return cannot start until a name is added.` : "Every sale in this period has a buyer name, or there were no walk-ins.",
      href: "/sales",
    },
    {
      ok: failedLogins === 0,
      label: "Sign-ins",
      detail: failedLogins ? `${failedLogins} failed sign-in(s) in this period.` : "No failed sign-ins in this period.",
      href: "/audit?result=failed&action=LOGIN",
    },
    {
      ok: highRisk === 0,
      label: "High-risk actions",
      detail: highRisk ? `${highRisk} high-risk row(s) in Who did what.` : "No high-risk actions in this period.",
      href: "/audit?risk=HIGH",
    },
  ]
  const openPapers = papers.filter((row) => !row.ok)

  return {
    shops,
    shopId,
    shopName: shops.find((shop) => shop.id === shopId)?.name ?? "Shop",
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
    expenses: money(expenses._sum.amount),
    purchasesPaid: money(purchases._sum.paidAmount),
    moneyOut: money(expenses._sum.amount) + money(purchases._sum.paidAmount),
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
      ? `${openPapers.length} item${openPapers.length === 1 ? "" : "s"} need a person before you can say the books are clean.`
      : "The books look clean for this shop and period. Money, phones, and the trail agree.",
    compare: {
      revenue: change(now.revenue, then.revenue),
      collected: change(now.collected, then.collected),
      count: change(now.count, then.count),
      priorRevenue: then.revenue,
      priorCollected: then.collected,
      priorCount: then.count,
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
