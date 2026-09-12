"use server"

import { prisma } from "@/lib/prisma"
import { viewBranchFilter } from "@/lib/branch-scope"
import { requireUser } from "@/lib/session"
import { scopedBranchId } from "@/lib/rbac"
import { money } from "@/lib/utils"
import { getUnclosedBusinessDays } from "@/app/actions/day-close"
import { getParkedWatch } from "@/app/actions/parked"

export async function getDashboardData() {
  const user = await requireUser()
  const branchId = await viewBranchFilter(user)

  const saleWhere = {
    status: "COMPLETED" as const,
    ...(branchId ? { branchId } : {}),
  }
  const expenseWhere = branchId ? { branchId } : {}

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  const [
    sales,
    lastSales,
    expenses,
    lastExpenses,
    paymentsIn,
    lastPaymentsIn,
    purchasesPaid,
    debts,
    stock,
    recentSales,
    brandGroups,
    returns,
    swaps,
    unread,
    branches,
    pendingApprovals,
    walkIns,
    openPurchases,
    vaultCounts,
    overdueIncoming,
    revenueByBranch,
    inStockByProduct,
    pendingTransfers,
  ] = await Promise.all([
    prisma.sale.aggregate({
      where: { ...saleWhere, saleDate: { gte: monthStart } },
      _sum: { totalAmount: true, paidAmount: true },
      _count: true,
    }),
    prisma.sale.aggregate({
      where: { ...saleWhere, saleDate: { gte: lastMonthStart, lte: lastMonthEnd } },
      _sum: { totalAmount: true },
    }),
    prisma.expense.aggregate({
      where: { ...expenseWhere, date: { gte: monthStart }, approvedAt: { not: null } },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { ...expenseWhere, date: { gte: lastMonthStart, lte: lastMonthEnd }, approvedAt: { not: null } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { paidAt: { gte: monthStart }, ...(branchId ? { sale: { branchId } } : {}) },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { paidAt: { gte: lastMonthStart, lte: lastMonthEnd }, ...(branchId ? { sale: { branchId } } : {}) },
      _sum: { amount: true },
    }),
    prisma.purchase.aggregate({
      where: { ...(branchId ? { branchId } : {}), createdAt: { gte: monthStart } },
      _sum: { paidAmount: true },
    }),
    prisma.customer.aggregate({
      where: branchId ? { branchId } : {},
      _sum: { currentBalance: true },
    }),
    prisma.inventory.findMany({
      where: branchId ? { branchId } : {},
      select: { productId: true, branchId: true, quantity: true, minStock: true },
    }),
    prisma.sale.findMany({
      where: saleWhere,
      include: { customer: true, branch: true },
      orderBy: { saleDate: "desc" },
      take: 6,
    }),
    // Names, cost and brand only. This used to pull every IMEI record in the
    // business into memory on every dashboard load, just to count them.
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        tracking: true,
        costPrice: true,
        brand: { select: { name: true } },
      },
    }),
    prisma.stockReturn.count({ where: branchId ? { branchId } : {} }),
    prisma.swap.count({ where: { ...(branchId ? { branchId } : {}), status: "COMPLETED" } }),
    prisma.notification.count({ where: { userId: user.id, status: "UNREAD" } }),
    prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    }),
    prisma.approval.count({ where: { status: "PENDING" } }),
    prisma.sale.count({ where: { ...saleWhere, customerId: null } }),
    prisma.purchase.aggregate({
      where: { ...(branchId ? { branchId } : {}), status: { not: "CANCELLED" } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    prisma.imeiRecord.groupBy({
      by: ["productId", "branchId"],
      where: { status: "IN_STOCK", ...(branchId ? { branchId } : {}) },
      _count: { _all: true },
    }),
    prisma.incomingLot.count({
      where: {
        status: "COMING",
        expectedDate: { lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        ...(branchId ? { branchId } : {}),
      },
    }),
    // Revenue per shop, added up by the database. Reading every completed sale
    // to add them up in memory was the heaviest query on the busiest page.
    prisma.sale.groupBy({
      by: ["branchId"],
      where: { status: "COMPLETED" },
      _sum: { totalAmount: true },
    }),
    // In-shop units per item, for the device mix. Left unscoped so the chart
    // shows the same figures it always has.
    prisma.imeiRecord.groupBy({
      by: ["productId"],
      where: { status: "IN_STOCK" },
      _count: { _all: true },
    }),
    prisma.stockTransfer.count({
      where: {
        status: { in: ["PENDING", "IN_TRANSIT"] },
        ...(branchId ? { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] } : {}),
      },
    }),
  ])

  const thisSales = money(sales._sum.totalAmount)
  const prevSales = money(lastSales._sum.totalAmount)
  const thisExp = money(expenses._sum.amount)
  const prevExp = money(lastExpenses._sum.amount)
  const received = money(paymentsIn._sum.amount)
  const sent = money(purchasesPaid._sum.paidAmount) + thisExp
  const lastSent = money(
    (
      await prisma.purchase.aggregate({
        where: { ...(branchId ? { branchId } : {}), createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum: { paidAmount: true },
      })
    )._sum.paidAmount
  ) + prevExp

  // One pass to index the catalogue, then every figure below is a map lookup
  // instead of a nested query result.
  const productById = new Map(brandGroups.map((row) => [row.id, row]))
  const branchById = new Map(branches.map((row) => [row.id, row]))

  const stockValue = stock.reduce(
    (sum, row) => sum + row.quantity * money(productById.get(row.productId)?.costPrice),
    0
  )

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: date.toLocaleString("en-NG", { month: "short" }),
      start: date,
      end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
    }
  })

  const chartSales = await Promise.all(
    months.map(async (month) => {
      const [monthSales, monthPurchases] = await Promise.all([
        prisma.sale.aggregate({
          where: { ...saleWhere, saleDate: { gte: month.start, lt: month.end } },
          _sum: { totalAmount: true },
        }),
        prisma.purchase.aggregate({
          where: { ...(branchId ? { branchId } : {}), createdAt: { gte: month.start, lt: month.end } },
          _sum: { totalAmount: true },
        }),
      ])
      return {
        month: month.label,
        sales: money(monthSales._sum.totalAmount),
        purchases: money(monthPurchases._sum.totalAmount),
        target: 0,
      }
    })
  )

  const devices = Object.values(
    inStockByProduct.reduce<Record<string, { name: string; value: number }>>((acc, row) => {
      const name = productById.get(row.productId)?.brand.name
      if (!name) return acc
      acc[name] = acc[name] ?? { name, value: 0 }
      acc[name].value += row._count._all
      return acc
    }, {})
  )

  const revenueById = new Map(revenueByBranch.map((row) => [row.branchId, money(row._sum.totalAmount)]))
  const ranking = branches
    .map((branch) => ({
      name: branch.name,
      revenue: revenueById.get(branch.id) ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const [parked, unclosedLists] = await Promise.all([
    getParkedWatch(),
    Promise.all((branchId ? branches.filter((branch) => branch.id === branchId) : branches).map((branch) => getUnclosedBusinessDays(branch.id))),
  ])
  const unclosedCount = unclosedLists.reduce((sum, days) => sum + days.length, 0)

  // Indexed once. Matching these two lists with .find() inside a loop was
  // catalogue-size squared work on every load.
  const vaultByKey = new Map(
    vaultCounts.map((row) => [`${row.productId}:${row.branchId}`, row._count._all])
  )
  const seenImeiKeys = new Set<string>()
  const imeiCheck = stock
    .flatMap((row) => {
      const product = productById.get(row.productId)
      if (!product || product.tracking === "NONE") return []
      const key = `${row.productId}:${row.branchId}`
      seenImeiKeys.add(key)
      const imeis = vaultByKey.get(key) ?? 0
      return [
        {
          id: key,
          product: product.name,
          shop: branchById.get(row.branchId)?.code ?? "Shop",
          shopQty: row.quantity,
          imeis,
          delta: imeis - row.quantity,
        },
      ]
    })
    .concat(
      vaultCounts.flatMap((vault) => {
        const key = `${vault.productId}:${vault.branchId}`
        if (seenImeiKeys.has(key)) return []
        const product = productById.get(vault.productId)
        if (!product || product.tracking === "NONE") return []
        return [
          {
            id: key,
            product: product.name,
            shop: branchById.get(vault.branchId)?.code ?? "Shop",
            shopQty: 0,
            imeis: vault._count._all,
            delta: vault._count._all,
          },
        ]
      })
    )
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.product.localeCompare(b.product))

  return {
    user,
    unread,
    kpis: {
      totalSales: thisSales,
      totalExpense: thisExp,
      paymentSent: sent,
      paymentReceived: received,
      paymentSentTrend: trend(sent, lastSent),
      paymentReceivedTrend: trend(received, money(lastPaymentsIn._sum.amount)),
      stockValue,
      outstanding: money(debts._sum.currentBalance),
      returns,
      swaps,
      salesCount: sales._count,
      salesTrend: trend(thisSales, prevSales),
      expenseTrend: trend(thisExp, prevExp),
    },
    chartSales,
    devices,
    recentSales,
    // Only the six thinnest lines reach the screen, so only those six are
    // dressed with a product and shop name.
    stock: stock
      .slice()
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 6)
      .map((row) => ({
        id: `${row.productId}:${row.branchId}`,
        quantity: row.quantity,
        minStock: row.minStock,
        product: { name: productById.get(row.productId)?.name ?? "Item" },
        branch: { code: branchById.get(row.branchId)?.code ?? "Shop" },
      })),
    ranking,
    imeiCheck,
    exceptions: {
      pendingApprovals,
      walkIns,
      creditorOwed: money(openPurchases._sum.totalAmount) - money(openPurchases._sum.paidAmount),
      imeiGaps: imeiCheck.filter((row) => row.delta !== 0).length,
    },
    tasks: [
      { href: "/finance/close", label: "Days you have not closed. Sell now stays locked until you count the till", count: unclosedCount },
      { href: "/pos", label: "Waiting sales that have waited too long", count: parked.sitting },
      { href: "/audit?risk=HIGH", label: "Waiting sales that disappeared from a phone", count: parked.vanished },
      { href: "/incoming", label: "Goods on the way that are late", count: overdueIncoming },
      { href: "/transfers", label: "Goods sent to another shop, waiting to be confirmed", count: pendingTransfers },
      { href: "/sales", label: "Sales with no buyer name", count: walkIns },
      {
        href: "/inventory",
        label: "Items running low",
        count: stock.filter((row) => row.quantity <= (row.minStock > 0 ? row.minStock : 3)).length,
      },
      { href: "/approvals", label: "Things waiting for somebody to say yes", count: pendingApprovals },
    ].filter((task) => task.count > 0),
  }
}

function trend(current: number, previous: number) {
  if (!previous) return { value: "+0%", up: true }
  const change = ((current - previous) / previous) * 100
  return {
    value: `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`,
    up: change >= 0,
  }
}
