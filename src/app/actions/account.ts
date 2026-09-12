"use server"

import * as bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { isSuperAdmin } from "@/lib/permissions"
import { requireUser } from "@/lib/session"

export async function getAccountState() {
  const user = await requireUser()
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, mustChangePassword: true },
  })
  return {
    email: row?.email ?? user.email,
    mustChangePassword: Boolean(row?.mustChangePassword),
    isSuperAdmin: isSuperAdmin(user.role),
  }
}

export async function changePassword(formData: FormData) {
  const user = await requireUser()
  const current = String(formData.get("currentPassword") || "")
  const next = String(formData.get("newPassword") || "")
  const confirm = String(formData.get("confirmPassword") || "")
  if (next.length < 8) return { error: "Your new password must be at least 8 letters or numbers." }
  if (next !== confirm) return { error: "The new passwords do not match." }
  const row = await prisma.user.findUnique({ where: { id: user.id } })
  if (!row) return { error: "We could not find your login." }
  const valid = await bcrypt.compare(current, row.password)
  if (!valid) return { error: "Current password is not correct." }
  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(next, 10), mustChangePassword: false },
  })
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      entityType: "User",
      entityId: user.id,
      newValue: JSON.stringify({ passwordChanged: true }),
      branchId: user.branchId,
    },
  })
  revalidatePath("/account")
  return { success: true }
}

export async function exportShopBackup() {
  const user = await requireUser()
  if (!isSuperAdmin(user.role)) return { error: "Only the main admin can download a shop backup." }
  const [branches, users, products, inventory, imeis, sales, purchases, incoming, transfers] = await Promise.all([
    prisma.branch.findMany(),
    prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, branchId: true, isActive: true, twoFactorEnabled: true, createdAt: true },
    }),
    prisma.product.findMany({ include: { brand: true, category: true } }),
    prisma.inventory.findMany(),
    prisma.imeiRecord.findMany({
      select: {
        id: true,
        imei1: true,
        imei2: true,
        serialNumber: true,
        productId: true,
        branchId: true,
        status: true,
        cosmeticGrade: true,
        batteryHealth: true,
        createdAt: true,
      },
    }),
    prisma.sale.findMany({ include: { items: true, payments: true } }),
    prisma.purchase.findMany({ include: { items: true } }),
    prisma.incomingLot.findMany({ include: { items: true } }),
    prisma.stockTransfer.findMany({ include: { items: true } }),
  ])
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "EXPORT",
      entityType: "Backup",
      entityId: user.id,
      newValue: JSON.stringify({ at: new Date().toISOString() }),
      branchId: user.branchId,
    },
  })
  return {
    success: true,
    backup: {
      exportedAt: new Date().toISOString(),
      branches,
      users,
      products,
      inventory,
      imeis,
      sales,
      purchases,
      incoming,
      transfers,
    },
  }
}
