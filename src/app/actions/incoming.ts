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
  const notes = String(formData.get("notes") || "") || null
  const expectedRaw = String(formData.get("expectedDate") || "")
  const productIds = formData.getAll("productId").map(String).filter(Boolean)
  if (!branchId) return { error: "Choose the shop these goods are going to." }
  if (productIds.length === 0) return { error: "Add at least one item." }

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
          supplierId,
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
        if (identity !== "NONE" && ids.length === 0) throw new Error("Paste IMEIs or serials for tracked items.")

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
              supplierId,
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
  return { success: true }
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
