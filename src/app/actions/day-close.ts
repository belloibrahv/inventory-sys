"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { can } from "@/lib/permissions"
import { scopedBranchId } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { money } from "@/lib/utils"

function dayBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return { start, end }
}

export async function getDayClosePreview(branchId?: string) {
  const user = await requireUser()
  if (!(await can(user.role, "view.finance"))) {
    return { sales: [], expectedCash: 0, transferTotal: 0, posTotal: 0, creditTotal: 0, saleCount: 0, alreadyClosed: false, branchId: "" }
  }
  const scoped = await scopedBranchId(user.role, user.branchId)
  let shopId = scoped || branchId || user.branchId || ""
  if (!shopId) {
    const shop = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { isHq: "desc" } })
    shopId = shop?.id ?? ""
  }
  const { start, end } = dayBounds()
  const sales = await prisma.sale.findMany({
    where: {
      status: "COMPLETED",
      ...(shopId ? { branchId: shopId } : {}),
      saleDate: { gte: start, lt: end },
    },
    include: { customer: true },
    orderBy: { saleDate: "desc" },
  })
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
  const existing = shopId
    ? await prisma.dayClose.findFirst({
        where: { branchId: shopId, closeDate: { gte: start, lt: end } },
      })
    : null
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
  }
}

export async function closeDay(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.finance")) && !(await can(user.role, "action.sell"))) {
    return { error: "You cannot close the day." }
  }
  const preview = await getDayClosePreview(String(formData.get("branchId") || ""))
  if (!preview.branchId) return { error: "Choose a shop." }
  if (preview.alreadyClosed) return { error: "This shop already closed today." }
  const countedCash = Number(formData.get("countedCash") || 0)
  if (Number.isNaN(countedCash)) return { error: "Enter the cash you counted." }

  await prisma.dayClose.create({
    data: {
      branchId: preview.branchId,
      userId: user.id,
      closeDate: new Date(),
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
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CREATE",
      entityType: "DayClose",
      entityId: preview.branchId,
      newValue: JSON.stringify({ expectedCash: preview.expectedCash, countedCash }),
      branchId: preview.branchId,
    },
  })
  revalidatePath("/finance")
  revalidatePath("/finance/close")
  return { success: true }
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
