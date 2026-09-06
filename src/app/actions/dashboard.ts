"use server"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { scopedBranchId } from "@/lib/rbac"
import { money } from "@/lib/utils"

export async function getDashboardData() {
  const user = await requireUser()
  const branchId = await scopedBranchId(user.role, user.branchId)

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
      include: { product: { include: { brand: true } }, branch: true },
    }),
    prisma.sale.findMany({
      where: saleWhere,
      include: { customer: true, branch: true },
      orderBy: { saleDate: "desc" },
      take: 6,
    }),
    prisma.product.findMany({
      include: { brand: true, imeiRecords: true },
    }),
    prisma.stockReturn.count({ where: branchId ? { branchId } : {} }),
    prisma.swap.count({ where: { ...(branchId ? { branchId } : {}), status: "COMPLETED" } }),
    prisma.notification.count({ where: { userId: user.id, status: "UNREAD" } }),
    prisma.branch.findMany({
      where: { isActive: true },
      include: { sales: { where: { status: "COMPLETED" } } },
    }),
    prisma.approval.count({ where: { status: "PENDING" } }),
    prisma.sale.count({ where: { ...saleWhere, customerId: null } }),
    prisma.purchase.findMany({
      where: { ...(branchId ? { branchId } : {}), status: { not: "CANCELLED" } },
      select: { totalAmount: true, paidAmount: true },
    }),
    prisma.imeiRecord.groupBy({
      by: ["productId", "branchId"],
      where: { status: "IN_STOCK", ...(branchId ? { branchId } : {}) },
      _count: { _all: true },
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

  const stockValue = stock.reduce((sum, row) => sum + row.quantity * money(row.product.costPrice), 0)

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
    brandGroups.reduce<Record<string, { name: string; value: number }>>((acc, product) => {
      const name = product.brand.name
      acc[name] = acc[name] ?? { name, value: 0 }
      acc[name].value += product.imeiRecords.filter((item) => item.status === "IN_STOCK").length
      return acc
    }, {})
  )

  const ranking = branches
    .map((branch) => ({
      name: branch.name,
      revenue: branch.sales.reduce((sum, sale) => sum + money(sale.totalAmount), 0),
    }))
    .sort((a, b) => b.revenue - a.revenue)

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
    stock: stock
      .slice()
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 6),
    ranking,
    exceptions: {
      pendingApprovals,
      walkIns,
      creditorOwed: openPurchases.reduce((sum, row) => sum + money(row.totalAmount) - money(row.paidAmount), 0),
      imeiGaps: stock.filter((row) => {
        const vault = vaultCounts.find((item) => item.productId === row.productId && item.branchId === row.branchId)?._count._all ?? 0
        const serialized = brandGroups.some((product) => product.id === row.productId && product.imeiRecords.length > 0)
        return serialized && vault !== row.quantity
      }).length,
    },
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
