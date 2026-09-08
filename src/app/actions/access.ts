"use server"

import { UserRole } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { shiftCustomerBalance } from "@/lib/concurrency"
import { requireUser } from "@/lib/session"
import { isSuperAdmin } from "@/lib/rbac"
import { ALL_PERM_KEYS, ensureRolePermissions } from "@/lib/permissions"

export async function getRoleMatrix() {
  const user = await requireUser()
  if (!isSuperAdmin(user.role)) return { error: "Only Super Admin can open access control." as const }
  await ensureRolePermissions()
  const rows = await prisma.rolePermission.findMany()
  return { rows }
}

export async function saveRoleAccess(formData: FormData) {
  const user = await requireUser()
  if (!isSuperAdmin(user.role)) return { error: "Only Super Admin can change what others see." }
  const role = String(formData.get("role") || "") as UserRole
  if (!role || role === "SUPER_ADMIN") return { error: "Super Admin access cannot be reduced." }

  await ensureRolePermissions()
  for (const key of ALL_PERM_KEYS) {
    if (key === "view.access") {
      await prisma.rolePermission.upsert({
        where: { role_permKey: { role, permKey: key } },
        update: { allowed: false },
        create: { role, permKey: key, allowed: false },
      })
      continue
    }
    const allowed = formData.get(key) === "on"
    await prisma.rolePermission.upsert({
      where: { role_permKey: { role, permKey: key } },
      update: { allowed },
      create: { role, permKey: key, allowed },
    })
  }
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      entityType: "RolePermission",
      entityId: role,
      newValue: "Access matrix updated",
      branchId: user.branchId,
    },
  })
  revalidatePath("/staff")
  revalidatePath("/staff/access")
  return { success: true }
}

export async function setStaffActive(formData: FormData) {
  const user = await requireUser()
  if (!isSuperAdmin(user.role)) return { error: "Only Super Admin can disable or restore staff." }
  const id = String(formData.get("id") || "")
  const next = String(formData.get("active") || "") === "true"
  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) return { error: "Staff not found." }
  if (target.id === user.id) return { error: "You cannot disable your own Super Admin login." }
  if (target.role === "SUPER_ADMIN" && !next) return { error: "Disable another Super Admin from the database owner only after handover." }

  await prisma.user.update({ where: { id }, data: { isActive: next } })
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      entityType: "User",
      entityId: target.email,
      oldValue: String(target.isActive),
      newValue: String(next),
      branchId: user.branchId,
    },
  })
  revalidatePath("/staff")
  revalidatePath("/audit")
  return { success: true }
}

export async function reverseInvoicePayment(formData: FormData) {
  const user = await requireUser()
  if (!isSuperAdmin(user.role)) return { error: "Only Super Admin can undo a collection." }
  const saleId = String(formData.get("saleId") || "")
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { customer: true, payments: { orderBy: { paidAt: "desc" } } },
  })
  if (!sale) return { error: "Invoice not found." }
  const last = sale.payments[0]
  if (!last) return { error: "This sale has no payment to undo." }

  const amount = Number(last.amount)
  await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: last.id } })
    // The database does the subtraction and the addition, so an undo landing at
    // the same moment as a collection cannot wipe the other one out.
    const reversed = await tx.sale.update({
      where: { id: sale.id },
      data: { paidAmount: { decrement: amount } },
      select: { paidAmount: true },
    })
    if (Number(reversed.paidAmount) < -0.005) {
      await tx.sale.update({ where: { id: sale.id }, data: { paidAmount: "0.00" } })
    }
    if (sale.customerId && sale.customer) {
      const after = await shiftCustomerBalance(tx, sale.customerId, amount)
      await tx.ledgerEntry.create({
        data: {
          customerId: sale.customerId,
          type: "ADJUSTMENT",
          amount: amount.toFixed(2),
          balance: Number(after.currentBalance).toFixed(2),
          reference: sale.invoiceNumber,
          description: `Super Admin reversed collection on ${sale.invoiceNumber}`,
        },
      })
    }
    await tx.financeEntry.create({
      data: {
        branchId: sale.branchId,
        account: last.method === "CASH" ? "CASH" : "BANK",
        type: "EXPENSE",
        amount: amount.toFixed(2),
        reference: sale.invoiceNumber,
        description: `Reversal of collection ${sale.invoiceNumber}`,
      },
    })
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "DELETE",
        entityType: "Payment",
        entityId: sale.invoiceNumber,
        oldValue: String(amount),
        newValue: "REVERSED",
        branchId: sale.branchId,
      },
    })
  })
  revalidatePath(`/sales/${sale.id}`)
  revalidatePath("/sales")
  revalidatePath("/finance")
  if (sale.customerId) revalidatePath(`/customers/${sale.customerId}`)
  return { success: true }
}

export async function reverseSupplierPayment(formData: FormData) {
  const user = await requireUser()
  if (!isSuperAdmin(user.role)) return { error: "Only Super Admin can undo a supplier payment." }
  const id = String(formData.get("id") || "")
  const purchase = await prisma.purchase.findUnique({ where: { id } })
  if (!purchase) return { error: "Purchase not found." }
  const paid = Number(purchase.paidAmount)
  if (paid <= 0) return { error: "Nothing has been paid on this PO." }

  const last = await prisma.financeEntry.findFirst({
    where: { description: { contains: purchase.invoiceNumber } },
    orderBy: { createdAt: "desc" },
  })
  const amount = last ? Number(last.amount) : paid
  const undo = Math.min(amount, paid)

  await prisma.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id: purchase.id },
      data: { paidAmount: (paid - undo).toFixed(2) },
    })
    await tx.financeEntry.create({
      data: {
        branchId: purchase.branchId,
        account: "BANK",
        type: "INCOME",
        amount: undo.toFixed(2),
        reference: purchase.invoiceNumber,
        description: `Reversal of supplier payment ${purchase.invoiceNumber}`,
      },
    })
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "DELETE",
        entityType: "PurchasePayment",
        entityId: purchase.invoiceNumber,
        oldValue: String(undo),
        newValue: "REVERSED",
        branchId: purchase.branchId,
      },
    })
  })
  revalidatePath(`/purchases/${purchase.id}`)
  revalidatePath("/purchases")
  revalidatePath("/finance")
  revalidatePath("/suppliers")
  return { success: true }
}
