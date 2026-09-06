"use server"

import { IncomingIdentity, IncomingStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { can, isSuperAdmin } from "@/lib/permissions"
import { scopedBranchId } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { generateDocNumber } from "@/lib/utils"

function parseIds(raw: string) {
  return [...new Set(raw.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean))]
}

function unitKey(identity: IncomingIdentity, value: string) {
  if (identity === "SERIAL") return value.toUpperCase().startsWith("SN-") ? value.toUpperCase() : `SN-${value}`
  return value
}

async function canBookIncoming(role: Parameters<typeof can>[0]) {
  return isSuperAdmin(role) || (await can(role, "action.incoming"))
}

async function canViewIncoming(role: Parameters<typeof can>[0]) {
  return isSuperAdmin(role) || (await can(role, "view.incoming")) || (await can(role, "action.incoming"))
}

export async function getIncomingLots() {
  const user = await requireUser()
  if (!(await canViewIncoming(user.role))) return []
  const branchId = await scopedBranchId(user.role, user.branchId)
  const booker = await canBookIncoming(user.role)
  const lots = await prisma.incomingLot.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      ...(booker || isSuperAdmin(user.role) ? {} : { visible: true }),
    },
    include: {
      branch: true,
      supplier: true,
      user: true,
      purchase: true,
      items: { include: { product: { include: { brand: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  })
  return lots
}

export async function createIncomingLot(formData: FormData) {
  const user = await requireUser()
  if (!(await canBookIncoming(user.role))) return { error: "You cannot book goods before they arrive." }

  const branchId = String(formData.get("branchId") || user.branchId || "")
  const supplierId = String(formData.get("supplierId") || "") || null
  const purchaseId = String(formData.get("purchaseId") || "") || null
  const notes = String(formData.get("notes") || "") || null
  const expectedRaw = String(formData.get("expectedDate") || "")
  const productIds = formData.getAll("productId").map(String).filter(Boolean)
  if (!branchId) return { error: "Choose the shop these goods are going to." }
  if (productIds.length === 0) return { error: "Add at least one item." }

  let linkedSupplierId = supplierId
  if (purchaseId) {
    const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } })
    if (!purchase) return { error: "That supplier order was not found." }
    if (purchase.branchId !== branchId) return { error: "This order is for a different shop." }
    linkedSupplierId = linkedSupplierId || purchase.supplierId
  }

  const identities = formData.getAll("identity").map(String) as IncomingIdentity[]
  const quantities = formData.getAll("quantity").map((value) => Number(value))
  const identifierBlocks = formData.getAll("identifiers").map(String)
  const lotNumber = generateDocNumber("IN")

  try {
    await prisma.$transaction(async (tx) => {
      const lot = await tx.incomingLot.create({
        data: {
          lotNumber,
          branchId,
          supplierId: linkedSupplierId,
          purchaseId,
          userId: user.id,
          notes,
          expectedDate: expectedRaw ? new Date(expectedRaw) : null,
          visible: false,
        },
      })

      for (let index = 0; index < productIds.length; index += 1) {
        const productId = productIds[index]
        const identity = identities[index] ?? "NONE"
        const ids = identity === "NONE" ? [] : parseIds(identifierBlocks[index] ?? "")
        const quantity = identity === "NONE" ? Math.max(1, quantities[index] || 0) : ids.length
        if (!productId || quantity < 1) throw new Error("Each line needs a product and a quantity or list of numbers.")
        if (identity !== "NONE" && ids.length === 0) throw new Error("Scan IMEIs or serials for tracked items.")

        await tx.incomingItem.create({
          data: {
            lotId: lot.id,
            productId,
            quantity,
            identity,
            identifiers: ids.length ? ids.join("\n") : null,
          },
        })

        await tx.inventory.upsert({
          where: { productId_branchId: { productId, branchId } },
          update: { incomingQty: { increment: quantity } },
          create: { productId, branchId, quantity: 0, incomingQty: quantity },
        })

        if (identity === "NONE") continue

        for (const raw of ids) {
          const key = unitKey(identity, raw)
          const duplicate = await tx.imeiRecord.findFirst({
            where: { OR: [{ imei1: key }, { imei2: key }, { serialNumber: raw }] },
          })
          if (duplicate) throw new Error(`${raw} is already on the system.`)
          if (identity === "IMEI" && raw.length < 14) throw new Error(`${raw} is not a valid IMEI.`)
          await tx.imeiRecord.create({
            data: {
              imei1: key,
              serialNumber: identity === "SERIAL" ? raw : null,
              productId,
              supplierId: linkedSupplierId,
              branchId,
              status: "INCOMING",
              notes: `Coming on ${lotNumber}`,
            },
          })
        }
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "IncomingLot",
          entityId: lotNumber,
          newValue: JSON.stringify({ branchId, lines: productIds.length }),
          branchId,
        },
      })
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not book these goods." }
  }

  revalidatePath("/incoming")
  revalidatePath("/inventory")
  revalidatePath("/imei")
  return { success: true }
}

export async function markIncomingArrived(formData: FormData) {
  const user = await requireUser()
  if (!(await canBookIncoming(user.role))) return { error: "You cannot mark goods as arrived." }
  const id = String(formData.get("id") || "")
  const lot = await prisma.incomingLot.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!lot || lot.status !== "COMING") return { error: "This list is not waiting to arrive." }

  await prisma.$transaction(async (tx) => {
    for (const item of lot.items) {
      if (item.identity === "NONE") {
        await tx.inventory.upsert({
          where: { productId_branchId: { productId: item.productId, branchId: lot.branchId } },
          update: {
            incomingQty: { decrement: item.quantity },
            quantity: { increment: item.quantity },
          },
          create: { productId: item.productId, branchId: lot.branchId, quantity: item.quantity, incomingQty: 0 },
        })
        continue
      }
      await tx.imeiRecord.updateMany({
        where: { branchId: lot.branchId, productId: item.productId, status: "INCOMING", notes: { contains: lot.lotNumber } },
        data: { status: "IN_STOCK", notes: `Arrived from ${lot.lotNumber}` },
      })
      await tx.inventory.upsert({
        where: { productId_branchId: { productId: item.productId, branchId: lot.branchId } },
        update: {
          incomingQty: { decrement: item.quantity },
          quantity: { increment: item.quantity },
        },
        create: { productId: item.productId, branchId: lot.branchId, quantity: item.quantity, incomingQty: 0 },
      })
    }
    await tx.incomingLot.update({
      where: { id: lot.id },
      data: { status: IncomingStatus.ARRIVED },
    })
    if (lot.purchaseId) {
      const purchase = await tx.purchase.findUnique({
        where: { id: lot.purchaseId },
        include: { items: true },
      })
      if (purchase) {
        for (const incoming of lot.items) {
          const line =
            purchase.items.find((item) => item.productId === incoming.productId) ?? purchase.items[0]
          if (!line) continue
          const receivedQty = Math.min(line.quantity, line.receivedQty + incoming.quantity)
          await tx.purchaseItem.update({ where: { id: line.id }, data: { receivedQty } })
          line.receivedQty = receivedQty
        }
        const done = purchase.items.every((item) => item.receivedQty >= item.quantity)
        await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            status: done ? "RECEIVED" : "PARTIAL_RECEIVED",
            receivedDate: done ? new Date() : purchase.receivedDate,
          },
        })
      }
    }
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "IncomingLot",
        entityId: lot.lotNumber,
        newValue: JSON.stringify({ status: "ARRIVED" }),
        branchId: lot.branchId,
      },
    })
  })

  revalidatePath("/incoming")
  revalidatePath("/inventory")
  revalidatePath("/imei")
  revalidatePath("/pos")
  revalidatePath("/purchases")
  return { success: true }
}

export async function getOpenPurchases() {
  const user = await requireUser()
  if (!(await canBookIncoming(user.role))) return []
  const branchId = await scopedBranchId(user.role, user.branchId)
  return prisma.purchase.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      status: { in: ["PENDING", "ORDERED", "PARTIAL_RECEIVED"] },
    },
    select: { id: true, invoiceNumber: true, branchId: true, supplierId: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  })
}

export async function bookPurchaseAsComing(formData: FormData) {
  const user = await requireUser()
  if (!(await canBookIncoming(user.role))) return { error: "You cannot book goods before they arrive." }
  const purchaseId = String(formData.get("id") || "")
  const identifiers = parseIds(String(formData.get("imeis") || ""))
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: { include: { product: true } } },
  })
  if (!purchase) return { error: "Purchase not found." }
  const item = purchase.items[0]
  if (!item) return { error: "This order has no lines." }

  const alreadyComing = await prisma.incomingItem.aggregate({
    where: { lot: { purchaseId, status: "COMING" }, productId: item.productId },
    _sum: { quantity: true },
  })
  const remaining = item.quantity - item.receivedQty - (alreadyComing._sum.quantity ?? 0)
  if (remaining < 1) return { error: "Nothing left to book as coming for this order." }

  const tracking = item.product.tracking === "SERIAL" ? "SERIAL" : item.product.tracking === "NONE" ? "NONE" : "IMEI"
  if (tracking !== "NONE" && identifiers.length === 0) {
    return { error: "Scan the IMEIs or serials that are on the way." }
  }
  if (tracking !== "NONE" && identifiers.length > remaining) {
    return { error: `Only ${remaining} units are still expected.` }
  }

  const next = new FormData()
  next.set("branchId", purchase.branchId)
  next.set("supplierId", purchase.supplierId)
  next.set("purchaseId", purchase.id)
  next.set("productId", item.productId)
  next.set("identity", tracking)
  next.set("quantity", tracking === "NONE" ? String(remaining) : "0")
  next.set("identifiers", identifiers.join("\n"))
  next.set("notes", `Booked from ${purchase.invoiceNumber}`)
  return createIncomingLot(next)
}

export async function setIncomingVisible(formData: FormData) {
  const user = await requireUser()
  if (!isSuperAdmin(user.role)) return { error: "Only Super Admin can show or hide goods on the way." }
  const id = String(formData.get("id") || "")
  const visible = String(formData.get("visible") || "") === "true"
  await prisma.incomingLot.update({ where: { id }, data: { visible } })
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      entityType: "IncomingLot",
      entityId: id,
      newValue: JSON.stringify({ visible }),
      branchId: user.branchId,
    },
  })
  revalidatePath("/incoming")
  return { success: true }
}
