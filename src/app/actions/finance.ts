"use server"

import { revalidatePath } from "next/cache"
import { ExpenseCategory, UserRole } from "@prisma/client"
import * as bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { canApprove, canManageFinance, canManageStaff, isSuperAdmin, scopedBranchId } from "@/lib/rbac"
import { can } from "@/lib/permissions"
import { generateDocNumber, money } from "@/lib/utils"

export async function getFinance() {
  const user = await requireUser()
  if (!(await can(user.role, "view.finance")) && !(await can(user.role, "view.expenses"))) {
    return { entries: [], expenses: [], debtors: [], creditors: [], inflow: 0, outflow: 0, net: 0 }
  }
  const branchId = await scopedBranchId(user.role, user.branchId)
  const where = branchId ? { branchId } : {}
  const [entries, expenses, debtors, purchases] = await Promise.all([
    prisma.financeEntry.findMany({
      where,
      include: { branch: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.expense.findMany({
      where,
      include: { branch: true, user: true },
      orderBy: { date: "desc" },
    }),
    prisma.customer.findMany({
      where: { ...(branchId ? { branchId } : {}), currentBalance: { gt: 0 } },
      include: { branch: true },
      orderBy: { currentBalance: "desc" },
    }),
    prisma.purchase.findMany({
      where: { ...(branchId ? { branchId } : {}), status: { not: "CANCELLED" } },
      include: { supplier: true, branch: true },
    }),
  ])

  const inflow = entries.filter((row) => row.type === "INCOME").reduce((sum, row) => sum + money(row.amount), 0)
  const outflow = entries.filter((row) => row.type === "EXPENSE").reduce((sum, row) => sum + money(row.amount), 0)
  const creditors = Object.values(
    purchases.reduce<Record<string, { id: string; name: string; owed: number }>>((acc, row) => {
      const due = money(row.totalAmount) - money(row.paidAmount)
      if (due <= 0) return acc
      acc[row.supplierId] = acc[row.supplierId] ?? { id: row.supplierId, name: row.supplier.name, owed: 0 }
      acc[row.supplierId].owed += due
      return acc
    }, {})
  ).sort((a, b) => b.owed - a.owed)

  return { entries, expenses, debtors, creditors, inflow, outflow, net: inflow - outflow }
}

export async function createExpense(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageFinance(user.role))) {
    return { error: "You cannot post expenses." }
  }
  const amount = Number(formData.get("amount") || 0)
  const branchId = String(formData.get("branchId") || user.branchId || "")
  if (amount <= 0 || !branchId) return { error: "Amount and branch are required." }

  const expense = await prisma.expense.create({
    data: {
      expenseNumber: generateDocNumber("EXP"),
      branchId,
      userId: user.id,
      category: String(formData.get("category")) as ExpenseCategory,
      amount: amount.toFixed(2),
      description: String(formData.get("description") || "Expense"),
      notes: String(formData.get("notes") || "") || null,
    },
  })
  await prisma.approval.create({
    data: {
      type: "EXPENSE",
      entityId: expense.expenseNumber,
      entityType: "Expense",
      requestedBy: user.id,
      reason: expense.description,
    },
  })
  revalidatePath("/expenses")
  revalidatePath("/finance")
  revalidatePath("/approvals")
  return { success: true }
}

export async function getApprovals() {
  const user = await requireUser()
  if (!(await can(user.role, "view.approvals"))) return []
  return prisma.approval.findMany({
    include: { requester: true, decider: true },
    orderBy: { requestedAt: "desc" },
  })
}

export async function decideApproval(id: string, status: "APPROVED" | "REJECTED") {
  const user = await requireUser()
  if (!(await canApprove(user.role))) {
    return { error: "You cannot decide approvals." }
  }
  const approval = await prisma.approval.findUnique({ where: { id } })
  if (!approval || approval.status !== "PENDING") return { error: "Approval is no longer pending." }

  await prisma.approval.update({
    where: { id },
    data: { status, approvedBy: user.id, approvedAt: new Date() },
  })

  if (approval.entityType === "Swap" || approval.type === "SWAP") {
    const swap = await prisma.swap.findFirst({
      where: { OR: [{ id: approval.entityId }, { swapNumber: approval.entityId }, { oldImei: { imei1: approval.entityId } }] },
    })
    if (swap) {
      await prisma.swap.update({
        where: { id: swap.id },
        data: { status: status === "APPROVED" ? "APPROVED" : "REJECTED", approvedBy: user.id, approvedAt: new Date() },
      })
    }
  }

  if (approval.entityType === "Return" || approval.type === "RETURN") {
    const record = await prisma.stockReturn.findFirst({
      where: { OR: [{ id: approval.entityId }, { returnNumber: approval.entityId }] },
    })
    if (record) {
      await prisma.stockReturn.update({
        where: { id: record.id },
        data: { status: status === "APPROVED" ? "APPROVED" : "REJECTED", approvedBy: user.id, approvedAt: new Date() },
      })
      if (status === "REJECTED" && record.imeiId) {
        await prisma.imeiRecord.update({
          where: { id: record.imeiId },
          data: { status: "SOLD" },
        })
      }
    }
  }

  if (approval.entityType === "Expense" || approval.type === "EXPENSE") {
    const expense = await prisma.expense.findFirst({
      where: { OR: [{ id: approval.entityId }, { expenseNumber: approval.entityId }] },
    })
    if (expense && status === "APPROVED") {
      await prisma.expense.update({
        where: { id: expense.id },
        data: { approvedBy: user.id, approvedAt: new Date() },
      })
      const alreadyPosted = await prisma.financeEntry.findFirst({
        where: { reference: expense.expenseNumber },
      })
      if (!alreadyPosted) {
        await prisma.financeEntry.create({
          data: {
            branchId: expense.branchId,
            account: "CASH",
            type: "EXPENSE",
            amount: expense.amount,
            reference: expense.expenseNumber,
            description: expense.description,
          },
        })
      }
    }
  }

  if (approval.type === "RECONCILIATION") {
    const recon = await prisma.reconciliation.findFirst({
      where: { OR: [{ id: approval.entityId }] },
      include: { items: true },
    })
    if (recon) {
      if (status === "APPROVED") {
        for (const item of recon.items) {
          await prisma.inventory.updateMany({
            where: { productId: item.productId, branchId: recon.branchId },
            data: { quantity: item.countedQty, lastStockCheck: new Date() },
          })
        }
      }
      await prisma.reconciliation.update({
        where: { id: recon.id },
        data: {
          status: status === "APPROVED" ? "APPROVED" : "REJECTED",
          approvedBy: user.id,
          approvedAt: new Date(),
          completedAt: new Date(),
        },
      })
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: status === "APPROVED" ? "APPROVE" : "REJECT",
      entityType: approval.entityType,
      entityId: approval.entityId,
      newValue: status,
      branchId: user.branchId,
    },
  })
  await prisma.notification.create({
    data: {
      userId: approval.requestedBy,
      type: "SYSTEM",
      title: `${approval.type} ${status.toLowerCase()}`,
      message: approval.reason || approval.entityId,
      actionUrl: "/approvals",
    },
  })
  revalidatePath("/approvals")
  revalidatePath("/swaps")
  revalidatePath("/returns")
  revalidatePath("/expenses")
  revalidatePath("/reconciliation")
  revalidatePath("/inventory")
  revalidatePath("/finance")
  revalidatePath("/imei")
  revalidatePath("/dashboard")
  return { success: true }
}

export async function approveRequest(formData: FormData) {
  return decideApproval(String(formData.get("id") || ""), "APPROVED")
}

export async function rejectRequest(formData: FormData) {
  return decideApproval(String(formData.get("id") || ""), "REJECTED")
}

export async function getReconciliations() {
  const user = await requireUser()
  if (!(await can(user.role, "view.reconciliation"))) return []
  const branchId = await scopedBranchId(user.role, user.branchId)
  return prisma.reconciliation.findMany({
    where: branchId ? { branchId } : undefined,
    include: { branch: true, user: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  })
}

export async function startReconciliation(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.recon"))) return { error: "You cannot submit a stock count." }
  const branchId = String(formData.get("branchId") || user.branchId || "")
  if (!branchId) return { error: "Select a branch." }
  const scoped = await scopedBranchId(user.role, user.branchId)
  if (scoped && branchId !== scoped) return { error: "You can only count your own branch." }
  const stock = await prisma.inventory.findMany({
    where: { branchId },
    include: { product: true },
  })
  const expected = stock.reduce((sum, row) => sum + row.quantity * money(row.product.costPrice), 0)
  const counted = stock.reduce((sum, row) => {
    const countedQty = Number(formData.get(`count_${row.productId}`) || row.quantity)
    return sum + countedQty * money(row.product.costPrice)
  }, 0)

  const recon = await prisma.reconciliation.create({
    data: {
      branchId,
      userId: user.id,
      startDate: new Date(),
      endDate: new Date(),
      status: "PENDING_APPROVAL",
      totalExpected: expected.toFixed(2),
      totalCounted: counted.toFixed(2),
      variance: (counted - expected).toFixed(2),
      notes: String(formData.get("notes") || "") || null,
      items: {
        create: stock.map((row) => {
          const countedQty = Number(formData.get(`count_${row.productId}`) || row.quantity)
          return {
            productId: row.productId,
            expectedQty: row.quantity,
            countedQty,
            variance: countedQty - row.quantity,
            varianceValue: ((countedQty - row.quantity) * money(row.product.costPrice)).toFixed(2),
          }
        }),
      },
    },
  })
  await prisma.approval.create({
    data: {
      type: "RECONCILIATION",
      entityId: recon.id,
      entityType: "Reconciliation",
      requestedBy: user.id,
      reason: `Stock count variance ${recon.variance}`,
    },
  })
  revalidatePath("/reconciliation")
  revalidatePath("/approvals")
  return { success: true }
}

export async function getAuditLogs() {
  const user = await requireUser()
  if (!(await can(user.role, "view.audit"))) return []
  return prisma.auditLog.findMany({
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 150,
  })
}

export async function getNotifications() {
  const user = await requireUser()
  return prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  })
}

export async function markNotificationsRead() {
  const user = await requireUser()
  await prisma.notification.updateMany({
    where: { userId: user.id, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  })
  revalidatePath("/notifications")
  return { success: true }
}

export async function getStaff() {
  const user = await requireUser()
  if (!(await can(user.role, "view.staff"))) return []
  return prisma.user.findMany({
    include: { branch: true },
    orderBy: { createdAt: "asc" },
  })
}

export async function createStaff(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageStaff(user.role))) return { error: "You cannot add staff." }

  const name = String(formData.get("name") || "").trim()
  const email = String(formData.get("email") || "").trim().toLowerCase()
  const password = String(formData.get("password") || "")
  const role = String(formData.get("role") || "SALES_EXECUTIVE") as UserRole
  const branchId = String(formData.get("branchId") || "") || null

  if (role === "SUPER_ADMIN" && !isSuperAdmin(user.role)) {
    return { error: "Only Super Admin can create another Super Admin." }
  }
  if (!name || !email || password.length < 6) {
    return { error: "Name, email, and a password of at least 6 characters are required." }
  }
  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) return { error: "That email is already on staff." }

  await prisma.user.create({
    data: {
      name,
      email,
      password: await bcrypt.hash(password, 10),
      role,
      branchId: ["SUPER_ADMIN", "CEO", "AUDITOR", "ACCOUNTANT"].includes(role) ? null : branchId,
      isActive: true,
      mustChangePassword: true,
    },
  })
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CREATE",
      entityType: "User",
      entityId: email,
      newValue: JSON.stringify({ name, role, branchId }),
      branchId: user.branchId,
    },
  })
  revalidatePath("/staff")
  revalidatePath("/audit")
  return { success: true }
}

export async function getSettings() {
  await requireUser()
  await prisma.setting.upsert({
    where: { key: "sales.warranty_days" },
    update: {},
    create: {
      key: "sales.warranty_days",
      value: "365",
      description: "Default warranty days when a product has no override",
    },
  })
  return prisma.setting.findMany({ orderBy: { key: "asc" } })
}

export async function saveSetting(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.settings"))) return { error: "Only Super Admin can change settings unless granted." }
  const key = String(formData.get("key"))
  const value = String(formData.get("value"))
  await prisma.setting.update({ where: { key }, data: { value } })
  revalidatePath("/settings")
  revalidatePath("/pos")
  revalidatePath("/inventory")
  revalidatePath("/sales")
  return { success: true }
}

export async function getReportData() {
  const user = await requireUser()
  if (!(await can(user.role, "view.reports"))) {
    return { sales: [], expenses: [], swaps: [], returns: [], inventory: [], debtors: [], creditors: [] }
  }
  const branchId = await scopedBranchId(user.role, user.branchId)
  const [sales, expenses, swaps, returns, inventory, debtors, purchases] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "COMPLETED", ...(branchId ? { branchId } : {}) },
      include: { branch: true, items: true, customer: true },
    }),
    prisma.expense.findMany({
      where: { ...(branchId ? { branchId } : {}), approvedAt: { not: null } },
      include: { branch: true },
    }),
    prisma.swap.findMany({ where: { status: "COMPLETED", ...(branchId ? { branchId } : {}) } }),
    prisma.stockReturn.findMany({ where: branchId ? { branchId } : undefined }),
    prisma.inventory.findMany({
      where: branchId ? { branchId } : undefined,
      include: { product: true, branch: true },
    }),
    prisma.customer.findMany({
      where: { currentBalance: { gt: 0 }, ...(branchId ? { branchId } : {}) },
      include: { branch: true },
      orderBy: { currentBalance: "desc" },
    }),
    prisma.purchase.findMany({
      where: { ...(branchId ? { branchId } : {}), status: { not: "CANCELLED" } },
      include: { supplier: true, branch: true },
    }),
  ])
  const creditors = purchases
    .map((row) => ({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      supplier: row.supplier.name,
      supplierId: row.supplierId,
      branch: row.branch.code,
      total: money(row.totalAmount),
      paid: money(row.paidAmount),
      owed: money(row.totalAmount) - money(row.paidAmount),
    }))
    .filter((row) => row.owed > 0)
  return { sales, expenses, swaps, returns, inventory, debtors, creditors }
}
