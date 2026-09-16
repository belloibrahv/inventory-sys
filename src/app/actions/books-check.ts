"use server"

import { prisma } from "@/lib/prisma"
import { can } from "@/lib/permissions"
import { scopedBranchId } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { verifyAuditChain } from "@/lib/audit"
import { getUnclosedBusinessDays } from "@/app/actions/day-close"
import { getParkedWatch } from "@/app/actions/parked"
import { recentWatDays, shopPeriodWindow, shopPreviousWindow, watBounds, watDayKey, type ShopRange } from "@/lib/lagos-day"
import { getAppSettings } from "@/lib/settings"
import { money } from "@/lib/utils"
import { sumSaleTenders } from "@/lib/sale-money"
import { healOpeningStockBills } from "@/lib/opening-stock-money"
import { payablePurchaseWhere } from "@/lib/purchase-money"
import { healDuplicateDayCloses } from "@/lib/day-close-heal"

export type BooksRange = ShopRange

function sumSales(
  rows: Array<{
    paymentMethod: string
    totalAmount: unknown
    paidAmount: unknown
    payments?: Array<{ method: string; amount: unknown }> | null
  }>
) {
  const mix = sumSaleTenders(rows)
  return {
    cash: mix.cash,
    transfer: mix.transfer,
    pos: mix.pos,
    credit: mix.credit,
    revenue: mix.revenue,
    collected: mix.collected,
    due: mix.revenue - mix.collected,
    methodSum: mix.received,
    count: mix.count,
  }
}


export async function getBooksCheck(branchId?: string, businessDate?: string, range: BooksRange = "day", compareDate?: string) {
  const user = await requireUser()
  const allowed =
    (await can(user.role, "view.audit")) ||
    (await can(user.role, "view.finance")) ||
    (await can(user.role, "view.reports"))
  if (!allowed) return null
  await healOpeningStockBills()
  await healDuplicateDayCloses()

  const shops = await prisma.branch.findMany({
    where: { isActive: true },
    orderBy: [{ isHq: "desc" }, { name: "asc" }],
    select: { id: true, name: true, code: true },
  })
  const scoped = await scopedBranchId(user.role, user.branchId, branchId)
  const shopId = scoped || branchId || shops[0]?.id || ""
  const day = businessDate && /^\d{4}-\d{2}-\d{2}$/.test(businessDate) ? businessDate : watDayKey()
  const span = range === "week" || range === "month" ? range : "day"
  const window = shopPeriodWindow(day, span)
  const compareDay = compareDate && /^\d{4}-\d{2}-\d{2}$/.test(compareDate) ? compareDate : ""
  const prior = compareDay ? shopPeriodWindow(compareDay, span) : shopPreviousWindow(window.from, span)
  const shopWhere = shopId ? { branchId: shopId } : {}
  const recentDays = recentWatDays(14, day)
  const recentStart = watBounds(recentDays[recentDays.length - 1]).start

  const [sales, priorSales, expenses, priorExpenses, purchases, priorPurchases, closes, debtors, creditors, stock, vaultCounts, products, unclosed, parked, walkIns, integrity, highRisk, failedLogins, recentSaleDates, recentCloses, settings] =
    await Promise.all([
      prisma.sale.findMany({
        where: { status: "COMPLETED", ...shopWhere, saleDate: { gte: window.start, lt: window.end } },
        include: { customer: true, user: { select: { name: true } }, payments: true },
        orderBy: { saleDate: "desc" },
      }),
      prisma.sale.findMany({
        where: { status: "COMPLETED", ...shopWhere, saleDate: { gte: prior.start, lt: prior.end } },
        select: { paymentMethod: true, totalAmount: true, paidAmount: true, payments: { select: { method: true, amount: true } } },
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
        where: {
          ...shopWhere,
          createdAt: { gte: window.start, lt: window.end },
          ...payablePurchaseWhere,
        },
        _sum: { paidAmount: true },
      }),
      prisma.purchase.aggregate({
        where: {
          ...shopWhere,
          createdAt: { gte: prior.start, lt: prior.end },
          ...payablePurchaseWhere,
        },
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
        where: {
          ...(shopId ? { branchId: shopId } : {}),
          ...payablePurchaseWhere,
        },
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
      detail: integrity.ok
        ? `Audit chain verified — ${integrity.checked} locked records checked. No tampering detected.`
        : "A locked audit record has been altered. This is a critical integrity alert.",
      fix: integrity.ok
        ? null
        : "Go to Audit Trail → look for rows flagged as changed. Identify who made the change and when. If data was tampered with, restore from the last backup. This flag clears automatically once the audit chain is re-verified.",
      href: "/audit",
    },
    {
      ok: unclosed.length === 0,
      label: "Till counted every day",
      detail: unclosed.length
        ? `${unclosed.length} previous business day(s) with sales have not been closed yet.`
        : "All previous days with sales have been closed and counted.",
      fix: unclosed.length
        ? `Go to Close the day. Pick each open day. If cash came in, count the till and type cash remitted. If the day was transfer and POS only, just click Close the day. This flag clears once every past day with sales is closed.`
        : null,
      href: "/finance/close",
    },
    {
      ok: span !== "day" || now.count === 0 || Boolean(closeForDay),
      label: "Business day closed",
      detail:
        span !== "day"
          ? `${closes.length} day(s) closed in this period.`
          : closeForDay
            ? `Day closed — ₦${money(closeForDay.countedCash).toFixed(0)} remitted. Expected cash: ₦${expectedCash.toFixed(0)}.`
            : now.count
              ? "Today has transactions but the end-of-day register has not been closed yet."
              : "No transactions recorded for this business day.",
      fix:
        span === "day" && !closeForDay && now.count
          ? `Go to Finance → Close Day → select today's date → count the physical cash in the till, enter the amount → click "Close Day". This flag clears once today's register is closed.`
          : null,
      href: `/finance/close?date=${day}`,
    },
    {
      ok: closeVariances.length === 0,
      label: "Cash drawer reconciled with cash sales",
      detail: closeVariances.length
        ? `${closeVariances.length} closed day(s) show a cash shortage or overage between the till count and expected cash sales.`
        : "All closed day registers match expected cash with zero variance.",
      fix: closeVariances.length
        ? "Go to Finance → Close Day → review the days showing a variance. Recount the physical cash for those days and update the remittance amount. If there is a genuine shortage, record it as an approved expense. This flag clears once all closed days show zero variance."
        : null,
      href: "/finance/close",
    },
    {
      ok: imeiGaps.length === 0,
      label: "Serialized devices match IMEI registry",
      detail: imeiGaps.length
        ? `${imeiGaps.length} product(s) have a mismatch between physical stock count and the IMEI records on the system.`
        : "Physical serialized inventory matches all IMEI records perfectly.",
      fix: imeiGaps.length
        ? "Go to Inventory → IMEI Records → compare the physical device count on the shelf against the system count. For missing devices, mark them as sold or lost. For extra devices, register the new IMEIs. This flag clears once all counts match."
        : null,
      href: "/dashboard#imei-check",
    },
    {
      ok: parked.sitting === 0 && parked.vanished === 0,
      label: "Held / Draft transactions",
      detail:
        parked.sitting || parked.vanished
          ? `${parked.sitting} active hold(s) on the POS. ${parked.vanished} draft(s) were discarded without completing.`
          : "No stale or abandoned hold transactions on the POS.",
      fix:
        parked.sitting || parked.vanished
          ? "Go to POS → review any held (parked) sales → either complete the transaction or cancel it. For discarded drafts, check the Audit Trail for the HIGH-risk events. This flag clears once all holds are resolved."
          : null,
      href: parked.vanished ? "/audit?risk=HIGH" : "/pos",
    },
    {
      ok: walkIns === 0,
      label: "Customer identity KYC on transactions",
      detail: walkIns
        ? `${walkIns} transaction(s) were recorded without a registered customer (walk-in / unidentified buyer).`
        : "All transactions in this period are assigned to registered customer accounts.",
      fix: walkIns
        ? "Go to Sales → filter by 'Walk-in' customer → for each unidentified sale, open the invoice and update the customer field with the correct registered customer. This flag clears once all transactions have a known customer assigned."
        : null,
      href: "/sales",
    },
    {
      ok: failedLogins === 0,
      label: "User authentication security",
      detail: failedLogins
        ? `${failedLogins} failed login attempt(s) recorded in this period.`
        : "No failed authentication attempts detected.",
      fix: failedLogins
        ? "Go to Audit Trail → filter by Action: LOGIN and Result: Failed → check if the attempts are from a known staff member who forgot their password (reset it via Staff settings) or from an unknown source (change the affected account's password immediately and review access). This flag clears when no new failed logins occur in the next report period."
        : null,
      href: "/audit?result=failed&action=LOGIN",
    },
    {
      ok: highRisk === 0,
      label: "High-severity audit events",
      detail: highRisk
        ? `${highRisk} high-severity operational event(s) logged in this period.`
        : "No high-severity audit anomalies detected.",
      fix: highRisk
        ? "Go to Audit Trail → filter by Risk: HIGH → review each flagged event and confirm whether it was an authorised action. If unauthorised, escalate to the Managing Director and consider a security review. This flag clears when no HIGH-risk events are logged in the next report period."
        : null,
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
      ? `${openPapers.length} exception(s) require auditor resolution before certifying ledger.`
      : "All accounts, physical inventory, and audit controls are reconciled and certified.",
    compare: {
      revenue: change(now.revenue, then.revenue),
      collected: change(now.collected, then.collected),
      methodSum: change(now.methodSum, then.methodSum),
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
      priorMethodSum: then.methodSum,
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
      logo: settings.companyLogo,
      footer: settings.companyFooter,
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
    closes: closes.map((row) => {
      const expectedCash = money(row.expectedCash)
      const transferTotal = money(row.transferTotal)
      const posTotal = money(row.posTotal)
      const creditTotal = money(row.creditTotal)
      return {
        id: row.id,
        day: row.businessDate || row.closeDate.toISOString().slice(0, 10),
        staff: row.user.name,
        totalSales: expectedCash + transferTotal + posTotal + creditTotal,
        expected: expectedCash,
        counted: money(row.countedCash),
        variance: money(row.variance),
        sales: row.saleCount,
      }
    }),
    byStaff,
    imeiGaps: imeiGaps.length,
    imeiRows: imeiRows.slice(0, 20),
  }
}

export type BooksCheck = NonNullable<Awaited<ReturnType<typeof getBooksCheck>>>
