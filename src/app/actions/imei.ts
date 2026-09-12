"use server"

import { revalidatePath } from "next/cache"
import { IMEIStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { canReachBranch, viewBranchFilter } from "@/lib/branch-scope"
import { requireUser } from "@/lib/session"
import { scopedBranchId } from "@/lib/rbac"
import { can } from "@/lib/permissions"
import { recentWatDays, watBounds } from "@/lib/lagos-day"
import { IMEI_LIFE } from "@/lib/imei-life"

function whenBounds(when?: string) {
  if (!when || when === "all") return null
  const days = when === "today" ? 1 : when === "week" ? 7 : when === "month" ? 30 : 0
  if (!days) return null
  const keys = recentWatDays(days)
  const newest = watBounds(keys[0])
  const oldest = watBounds(keys[keys.length - 1])
  return { start: oldest.start, end: newest.end }
}

export async function getImeiStatusCounts() {
  const user = await requireUser()
  const branchId = await viewBranchFilter(user)
  const rows = await prisma.imeiRecord.groupBy({
    by: ["status"],
    where: branchId ? { branchId } : {},
    _count: { _all: true },
  })
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row._count._all])) as Record<string, number>
  const total = rows.reduce((sum, row) => sum + row._count._all, 0)
  const byLife = Object.fromEntries(
    IMEI_LIFE.map((life) => [life.key, life.statuses.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0)])
  ) as Record<string, number>
  return { total, byStatus, byLife }
}

export async function getImeiRecords(search?: string, status?: string, life?: string, when?: string) {
  const user = await requireUser()
  const branchId = await viewBranchFilter(user)
  const lifeBucket = IMEI_LIFE.find((row) => row.key === life)
  const range = whenBounds(when)

  const rows = await prisma.imeiRecord.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      ...(status
        ? { status: status as IMEIStatus }
        : lifeBucket
          ? { status: { in: [...lifeBucket.statuses] } }
          : {}),
      ...(range ? { updatedAt: { gte: range.start, lt: range.end } } : {}),
      ...(search
        ? {
            OR: [
              { imei1: { contains: search } },
              { imei2: { contains: search } },
              { serialNumber: { contains: search } },
              { product: { name: { contains: search } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      imei1: true,
      serialNumber: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      product: { select: { name: true, warrantyDays: true } },
      branch: { select: { code: true } },
      customer: { select: { name: true } },
      supplier: { select: { name: true } },
      sale: { select: { saleDate: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 500,
  })

  // Hand only plain values to Client Components — no Prisma Decimal bags.
  return rows.map((row) => ({
    id: row.id,
    imei1: row.imei1,
    serialNumber: row.serialNumber,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    product: { name: row.product.name, warrantyDays: row.product.warrantyDays },
    branch: { code: row.branch.code },
    customer: row.customer ? { name: row.customer.name } : null,
    supplier: row.supplier ? { name: row.supplier.name } : null,
    sale: row.sale ? { saleDate: row.sale.saleDate } : null,
  }))
}

export async function intakeImei(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.intake"))) return { error: "You are not allowed to receive phones. Ask the main admin." }
  const imei1 = String(formData.get("imei1") ?? "").trim()
  const productId = String(formData.get("productId") ?? "")
  const branchId = String(formData.get("branchId") ?? user.branchId ?? "")

  if (!imei1 || imei1.length < 14) return { error: "Type the full IMEI. It must be at least 14 digits." }
  if (!productId || !branchId) return { error: "Pick the item and the shop." }

  const duplicate = await prisma.imeiRecord.findFirst({
    where: { OR: [{ imei1 }, { imei2: imei1 }] },
  })
  if (duplicate) return { error: "That IMEI is already in the shop." }

  await prisma.imeiRecord.create({
    data: {
      imei1,
      imei2: String(formData.get("imei2") || "") || null,
      serialNumber: String(formData.get("serialNumber") || "") || null,
      productId,
      supplierId: String(formData.get("supplierId") || "") || null,
      branchId,
      status: "IN_STOCK",
      notes: String(formData.get("notes") || "") || null,
      cosmeticGrade: String(formData.get("cosmeticGrade") || "") || null,
      batteryHealth: formData.get("batteryHealth") ? Number(formData.get("batteryHealth")) : null,
      conditionNotes: String(formData.get("conditionNotes") || "") || null,
      photoData: String(formData.get("photoData") || "") || null,
    },
  })

  await prisma.inventory.upsert({
    where: { productId_branchId: { productId, branchId } },
    update: { quantity: { increment: 1 } },
    create: { productId, branchId, quantity: 1 },
  })

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CREATE",
      entityType: "IMEIRecord",
      entityId: imei1,
      newValue: JSON.stringify({ productId, branchId, status: "IN_STOCK" }),
      branchId,
    },
  })

  revalidatePath("/imei")
  revalidatePath("/inventory")
  return { success: true }
}

export async function updateImeiCondition(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.intake")) && !(await can(user.role, "action.repair"))) {
    return { error: "You are not allowed to change the condition of a phone. Ask the main admin." }
  }
  const id = String(formData.get("id") || "")
  const batteryRaw = String(formData.get("batteryHealth") || "")
  const batteryHealth = batteryRaw ? Number(batteryRaw) : null
  await prisma.imeiRecord.update({
    where: { id },
    data: {
      cosmeticGrade: String(formData.get("cosmeticGrade") || "") || null,
      batteryHealth: Number.isFinite(batteryHealth) ? batteryHealth : null,
      conditionNotes: String(formData.get("conditionNotes") || "") || null,
      photoData: String(formData.get("photoData") || "") || null,
    },
  })
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      entityType: "IMEIRecord",
      entityId: id,
      newValue: JSON.stringify({ cosmeticGrade: String(formData.get("cosmeticGrade") || ""), batteryHealth }),
      branchId: user.branchId,
    },
  })
  revalidatePath("/imei")
  revalidatePath(`/imei/${id}`)
  return { success: true }
}

export async function getImeiDetail(id: string) {
  const user = await requireUser()
  const record = await prisma.imeiRecord.findFirst({
    where: { OR: [{ id }, { imei1: id }] },
    include: {
      product: { include: { brand: true, category: true } },
      branch: true,
      supplier: true,
      customer: true,
      sale: { include: { customer: true, branch: true } },
      purchase: { select: { id: true, invoiceNumber: true } },
      returns: { include: { customer: true }, orderBy: { createdAt: "desc" } },
      repairs: { include: { customer: true }, orderBy: { createdAt: "desc" } },
      swapsOld: { include: { customer: true, newProduct: true }, orderBy: { createdAt: "desc" } },
      swapsNew: { include: { customer: true, newProduct: true }, orderBy: { createdAt: "desc" } },
    },
  })
  // A phone belongs to the shop holding it. Looking one up by IMEI must not
  // become a way to read another shop's stock and sales history.
  if (!(await canReachBranch(user, record?.branchId))) return null
  if (!record) return null
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [{ entityId: record.id }, { entityId: record.imei1 }],
    },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  })
  return { record, logs }
}

export async function getInventory() {
  const user = await requireUser()
  const branchId = await viewBranchFilter(user)
  return prisma.inventory.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      branch: { isActive: true },
    },
    include: {
      product: { include: { brand: true, category: true } },
      branch: true,
    },
    orderBy: [{ incomingQty: "desc" }, { quantity: "asc" }],
  })
}

export async function getInStockImeiCounts() {
  await requireUser()
  const rows = await prisma.imeiRecord.groupBy({
    by: ["productId", "branchId"],
    where: { status: "IN_STOCK" },
    _count: { _all: true },
  })
  return rows.map((row) => ({
    productId: row.productId,
    branchId: row.branchId,
    count: row._count._all,
  }))
}

export async function getIncomingImeiCounts() {
  await requireUser()
  const rows = await prisma.imeiRecord.groupBy({
    by: ["productId", "branchId"],
    where: { status: "INCOMING" },
    _count: { _all: true },
  })
  return rows.map((row) => ({
    productId: row.productId,
    branchId: row.branchId,
    count: row._count._all,
  }))
}

export async function getSerializedProductIds() {
  await requireUser()
  const rows = await prisma.product.findMany({
    where: { tracking: { in: ["IMEI", "SERIAL"] } },
    select: { id: true },
  })
  return rows.map((row) => row.id)
}
