"use server"

import { revalidatePath } from "next/cache"
import { IMEIStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { scopedBranchId } from "@/lib/rbac"
import { can } from "@/lib/permissions"

export async function getImeiRecords(search?: string, status?: string) {
  const user = await requireUser()
  const branchId = await scopedBranchId(user.role, user.branchId)

  return prisma.imeiRecord.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      ...(status ? { status: status as IMEIStatus } : {}),
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
    include: {
      product: { include: { brand: true } },
      branch: true,
      supplier: true,
      customer: true,
      sale: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
}

export async function intakeImei(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.intake"))) return { error: "You cannot receive IMEIs." }
  const imei1 = String(formData.get("imei1") ?? "").trim()
  const productId = String(formData.get("productId") ?? "")
  const branchId = String(formData.get("branchId") ?? user.branchId ?? "")

  if (!imei1 || imei1.length < 14) return { error: "Enter a valid IMEI 1." }
  if (!productId || !branchId) return { error: "Product and branch are required." }

  const duplicate = await prisma.imeiRecord.findFirst({
    where: { OR: [{ imei1 }, { imei2: imei1 }] },
  })
  if (duplicate) return { error: "This IMEI is already in the shop." }

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
    return { error: "You cannot update phone condition." }
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
  await requireUser()
  const record = await prisma.imeiRecord.findFirst({
    where: { OR: [{ id }, { imei1: id }] },
    include: {
      product: { include: { brand: true, category: true } },
      branch: true,
      supplier: true,
      customer: true,
      sale: { include: { customer: true, branch: true } },
      returns: { include: { customer: true }, orderBy: { createdAt: "desc" } },
      repairs: { include: { customer: true }, orderBy: { createdAt: "desc" } },
      swapsOld: { include: { customer: true, newProduct: true }, orderBy: { createdAt: "desc" } },
      swapsNew: { include: { customer: true, newProduct: true }, orderBy: { createdAt: "desc" } },
    },
  })
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
  const branchId = await scopedBranchId(user.role, user.branchId)
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
