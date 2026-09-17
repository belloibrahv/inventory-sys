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
import { displayPartyName } from "@/lib/party-key"
import { findDuplicateSupplier } from "@/lib/supplier-identity"
import { money } from "@/lib/utils"

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

  if (!productId || !branchId) return { error: "Pick the item and the shop." }

  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product || !product.isActive) return { error: "That item is not on the active list." }

  const tracked = product.tracking !== "NONE"
  const quantityRaw = Number(formData.get("quantity") || (tracked ? 1 : 0))
  const quantity = tracked ? 1 : Math.floor(quantityRaw)
  if (!tracked && (!Number.isFinite(quantity) || quantity < 1)) {
    return { error: "Enter how many pieces you are putting on the shelf." }
  }
  if (tracked && (!imei1 || imei1.length < 14)) {
    return { error: "Type the full IMEI. It must be at least 14 digits." }
  }

  const costPrice = Number(formData.get("costPrice") || 0)
  const minimumPrice = Number(formData.get("minimumPrice") || 0)
  const sellingPrice = Number(formData.get("sellingPrice") || 0)
  if (![costPrice, minimumPrice, sellingPrice].every((value) => Number.isFinite(value) && value >= 0)) {
    return { error: "Enter cost, lowest sell, and selling price as numbers." }
  }
  if (minimumPrice < costPrice) {
    return { error: "Lowest sell cannot sit below cost." }
  }
  if (sellingPrice < minimumPrice) {
    return { error: "Selling price cannot sit below the lowest sell." }
  }

  if (tracked) {
    const duplicate = await prisma.imeiRecord.findFirst({
      where: { OR: [{ imei1 }, { imei2: imei1 }] },
    })
    if (duplicate) return { error: "That IMEI is already in the shop." }
  }

  let supplierId = String(formData.get("supplierId") || "").trim()
  if (supplierId === "__new__") supplierId = ""
  const newSupplierName = String(formData.get("newSupplierName") || "").trim()
  const newSupplierPhone = String(formData.get("newSupplierPhone") || "").trim()
  if (newSupplierName) {
    if (!newSupplierPhone) return { error: "Type the new supplier phone number." }
    const clash = await findDuplicateSupplier({ name: newSupplierName, phone: newSupplierPhone })
    if (clash) return clash
    const created = await prisma.supplier.create({
      data: {
        name: displayPartyName(newSupplierName),
        phone: newSupplierPhone,
        city: String(formData.get("newSupplierCity") || "").trim() || null,
      },
    })
    supplierId = created.id
    revalidatePath("/suppliers")
  }

  const cosmeticGrade = String(formData.get("cosmeticGrade") || "") || null
  const isFaulty = cosmeticGrade === "FAULTY"
  const status = isFaulty ? "FAULTY" : "IN_STOCK"
  const priceChanged =
    money(product.costPrice) !== costPrice ||
    money(product.minimumPrice) !== minimumPrice ||
    money(product.sellingPrice) !== sellingPrice

  await prisma.$transaction(async (tx) => {
    if (priceChanged) {
      await tx.product.update({
        where: { id: productId },
        data: {
          costPrice: costPrice.toFixed(2),
          minimumPrice: minimumPrice.toFixed(2),
          sellingPrice: sellingPrice.toFixed(2),
        },
      })
    }

    if (tracked) {
      await tx.imeiRecord.create({
        data: {
          imei1,
          imei2: String(formData.get("imei2") || "") || null,
          serialNumber: String(formData.get("serialNumber") || "") || null,
          productId,
          supplierId: supplierId || null,
          branchId,
          status,
          notes: String(formData.get("notes") || "") || null,
          cosmeticGrade,
          batteryHealth: null,
          conditionNotes: String(formData.get("conditionNotes") || "") || null,
          photoData: String(formData.get("photoData") || "") || null,
        },
      })
    }

    const addQty = tracked ? (isFaulty ? 0 : 1) : quantity
    if (addQty > 0) {
      await tx.inventory.upsert({
        where: { productId_branchId: { productId, branchId } },
        update: { quantity: { increment: addQty } },
        create: { productId, branchId, quantity: addQty },
      })
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entityType: tracked ? "IMEIRecord" : "Inventory",
        entityId: tracked ? imei1 : productId,
        newValue: JSON.stringify({
          productId,
          branchId,
          status: tracked ? status : "IN_STOCK",
          cosmeticGrade,
          quantity: tracked ? 1 : quantity,
          costPrice,
          minimumPrice,
          sellingPrice,
          note: isFaulty && tracked
            ? "Received as Faulty. Not added to sellable In shop stock."
            : priceChanged
              ? "Received on One phone at a time. Item prices updated."
              : "Received on One phone at a time.",
        }),
        branchId,
      },
    })
  })

  revalidatePath("/imei")
  revalidatePath("/inventory")
  revalidatePath("/products")
  revalidatePath("/pos")
  return { success: true }
}

export async function updateImeiCondition(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.intake")) && !(await can(user.role, "action.repair"))) {
    return { error: "You are not allowed to change the condition of a phone. Ask the main admin." }
  }
  const id = String(formData.get("id") || "")
  if (!id) return { error: "Phone record missing." }

  const current = await prisma.imeiRecord.findUnique({ where: { id } })
  if (!current) return { error: "We could not find that phone." }

  if (current.status !== "IN_STOCK" && current.status !== "FAULTY") {
    return { error: "Only In shop or Damaged phones can change how they look here." }
  }

  const nextGrade = String(formData.get("cosmeticGrade") || "") || null
  const willBeDamaged = nextGrade === "FAULTY"
  const conditionNotes = String(formData.get("conditionNotes") || "") || null
  const photoData = String(formData.get("photoData") || "") || null

  // Picking Damaged / Faulty look moves shelf state with it. Picking a good look
  // while Damaged puts the phone back on sellable In shop stock.
  if (willBeDamaged && current.status === "IN_STOCK") {
    return applyShelfState({
      userId: user.id,
      current,
      shelfState: "DAMAGED",
      cosmeticGrade: "FAULTY",
      conditionNotes,
      photoData,
    })
  }

  if (!willBeDamaged && current.status === "FAULTY") {
    return applyShelfState({
      userId: user.id,
      current,
      shelfState: "GOOD",
      cosmeticGrade: nextGrade,
      conditionNotes,
      photoData,
    })
  }

  await prisma.imeiRecord.update({
    where: { id },
    data: {
      cosmeticGrade: nextGrade,
      conditionNotes,
      photoData,
    },
  })
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      entityType: "IMEIRecord",
      entityId: id,
      newValue: JSON.stringify({ cosmeticGrade: nextGrade }),
      branchId: user.branchId,
    },
  })

  revalidatePath("/imei")
  revalidatePath(`/imei/${id}`)
  revalidatePath("/inventory")
  revalidatePath("/pos")
  return { success: true }
}

export async function setImeiShelfState(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.intake")) && !(await can(user.role, "action.repair"))) {
    return { error: "You are not allowed to change Good or Damaged on a phone. Ask the main admin." }
  }
  const id = String(formData.get("id") || "")
  const shelfState = String(formData.get("shelfState") || "").toUpperCase()
  if (!id) return { error: "Phone record missing." }
  if (shelfState !== "GOOD" && shelfState !== "DAMAGED") {
    return { error: "Pick Good (sellable) or Damaged." }
  }

  const current = await prisma.imeiRecord.findUnique({ where: { id } })
  if (!current) return { error: "We could not find that phone." }
  if (current.status !== "IN_STOCK" && current.status !== "FAULTY") {
    return { error: "Only In shop or Damaged phones can switch between Good and Damaged." }
  }

  return applyShelfState({
    userId: user.id,
    current,
    shelfState: shelfState as "GOOD" | "DAMAGED",
    cosmeticGrade: shelfState === "DAMAGED" ? "FAULTY" : current.cosmeticGrade === "FAULTY" ? "UK" : current.cosmeticGrade,
  })
}

async function applyShelfState(input: {
  userId: string
  current: {
    id: string
    productId: string
    branchId: string
    status: string
    cosmeticGrade: string | null
    imei1: string
  }
  shelfState: "GOOD" | "DAMAGED"
  cosmeticGrade?: string | null
  conditionNotes?: string | null
  photoData?: string | null
}) {
  const { userId, current, shelfState } = input
  const nextStatus = shelfState === "DAMAGED" ? "FAULTY" : "IN_STOCK"
  const nextGrade =
    input.cosmeticGrade !== undefined
      ? input.cosmeticGrade
      : shelfState === "DAMAGED"
        ? "FAULTY"
        : current.cosmeticGrade === "FAULTY"
          ? "UK"
          : current.cosmeticGrade

  if (current.status === nextStatus && (current.cosmeticGrade ?? null) === (nextGrade ?? null)) {
    return { success: true }
  }

  const leavingSellable = current.status === "IN_STOCK" && nextStatus === "FAULTY"
  const returningSellable = current.status === "FAULTY" && nextStatus === "IN_STOCK"

  await prisma.$transaction(async (tx) => {
    await tx.imeiRecord.update({
      where: { id: current.id },
      data: {
        status: nextStatus,
        cosmeticGrade: nextGrade,
        ...(input.conditionNotes !== undefined ? { conditionNotes: input.conditionNotes } : {}),
        ...(input.photoData !== undefined ? { photoData: input.photoData } : {}),
      },
    })

    if (leavingSellable) {
      await tx.inventory.updateMany({
        where: { productId: current.productId, branchId: current.branchId, quantity: { gt: 0 } },
        data: { quantity: { decrement: 1 } },
      })
    }
    if (returningSellable) {
      await tx.inventory.upsert({
        where: { productId_branchId: { productId: current.productId, branchId: current.branchId } },
        update: { quantity: { increment: 1 } },
        create: { productId: current.productId, branchId: current.branchId, quantity: 1 },
      })
    }

    await tx.auditLog.create({
      data: {
        userId,
        action: "UPDATE",
        entityType: "IMEIRecord",
        entityId: current.id,
        oldValue: JSON.stringify({ status: current.status, cosmeticGrade: current.cosmeticGrade }),
        newValue: JSON.stringify({
          status: nextStatus,
          cosmeticGrade: nextGrade,
          shelfState,
          note:
            shelfState === "DAMAGED"
              ? "Set Damaged. Taken off sellable In shop stock."
              : "Set Good (sellable). Back on In shop stock for Sell now.",
        }),
        branchId: current.branchId,
        risk: "MEDIUM",
      },
    })
  })

  revalidatePath("/imei")
  revalidatePath(`/imei/${current.id}`)
  revalidatePath("/inventory")
  revalidatePath("/pos")
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
