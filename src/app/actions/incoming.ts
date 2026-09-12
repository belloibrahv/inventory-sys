"use server"

import { IncomingIdentity, IncomingStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { can, isSuperAdmin } from "@/lib/permissions"
import { scopedBranchId } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { generateDocNumber } from "@/lib/utils"
import { shopError } from "@/lib/shop-speak"

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
              purchaseId,
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
    return { error: shopError(error, "Could not book these goods.") }
  }

  revalidatePath("/incoming")
  revalidatePath("/inventory")
  revalidatePath("/imei")
  revalidatePath("/purchases")
  return { success: true }
}

export type ReceiveItemAdjustment = {
  itemId: string
  receivedQuantity: number
  confirmedIdentities?: string[]
}

export type PreviewAndReceivePayload = {
  lotId: string
  notes?: string
  items: ReceiveItemAdjustment[]
}

/**
 * Preview and edit incoming goods before confirming arrival into shop stock.
 * Handles discrepancies (e.g., expected 4, received 2) and updates IMEIs accordingly.
 */
export async function previewAndReceiveIncoming(payload: PreviewAndReceivePayload) {
  const user = await requireUser()
  if (!(await canBookIncoming(user.role))) return { error: "You cannot mark goods as arrived." }

  const lot = await prisma.incomingLot.findUnique({
    where: { id: payload.lotId },
    include: { items: { include: { product: true } }, branch: true },
  })
  if (!lot || lot.status !== "COMING") return { error: "This shipment is not in COMING status." }

  const itemMap = new Map(payload.items.map((it) => [it.itemId, it]))

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of lot.items) {
        const adjustment = itemMap.get(item.id)
        const receivedQty = adjustment ? Math.max(0, adjustment.receivedQuantity) : item.quantity
        const confirmedIds = (adjustment?.confirmedIdentities || []).map((id) => id.trim()).filter(Boolean)

        if (item.identity === "NONE") {
          // Decrement all incoming, increment only actually received quantity
          await tx.inventory.upsert({
            where: { productId_branchId: { productId: item.productId, branchId: lot.branchId } },
            update: {
              incomingQty: { decrement: item.quantity },
              quantity: { increment: receivedQty },
            },
            create: { productId: item.productId, branchId: lot.branchId, quantity: receivedQty, incomingQty: 0 },
          })
          await tx.incomingItem.update({
            where: { id: item.id },
            data: { quantity: receivedQty },
          })
        } else {
          // For IMEI / Serial:
          // Fetch existing incoming IMEIs for this lot item
          const existingImeis = await tx.imeiRecord.findMany({
            where: {
              branchId: lot.branchId,
              productId: item.productId,
              status: "INCOMING",
              notes: { contains: lot.lotNumber },
            },
          })

          const confirmedSet = new Set(confirmedIds.length ? confirmedIds : existingImeis.map((r) => r.imei1))

          // Move confirmed IMEIs to IN_STOCK
          for (const imeiRec of existingImeis) {
            if (confirmedSet.has(imeiRec.imei1) || (imeiRec.serialNumber && confirmedSet.has(imeiRec.serialNumber))) {
              await tx.imeiRecord.update({
                where: { id: imeiRec.id },
                data: {
                  status: "IN_STOCK",
                  notes: `Arrived from ${lot.lotNumber}`,
                  ...(lot.purchaseId ? { purchaseId: lot.purchaseId } : {}),
                },
              })
            } else {
              // Unconfirmed / missing units removed from incoming
              await tx.imeiRecord.delete({
                where: { id: imeiRec.id },
              })
            }
          }

          const actualReceived = confirmedIds.length > 0 ? confirmedIds.length : receivedQty

          await tx.inventory.upsert({
            where: { productId_branchId: { productId: item.productId, branchId: lot.branchId } },
            update: {
              incomingQty: { decrement: item.quantity },
              quantity: { increment: actualReceived },
            },
            create: { productId: item.productId, branchId: lot.branchId, quantity: actualReceived, incomingQty: 0 },
          })

          await tx.incomingItem.update({
            where: { id: item.id },
            data: {
              quantity: actualReceived,
              identifiers: confirmedIds.length ? confirmedIds.join("\n") : item.identifiers,
            },
          })
        }
      }

      await tx.incomingLot.update({
        where: { id: lot.id },
        data: {
          status: IncomingStatus.ARRIVED,
          notes: payload.notes ? `${lot.notes ? `${lot.notes} · ` : ""}${payload.notes}` : lot.notes,
        },
      })

      // Update linked purchase if exists
      if (lot.purchaseId) {
        const purchase = await tx.purchase.findUnique({
          where: { id: lot.purchaseId },
          include: { items: true },
        })
        if (purchase) {
          for (const incoming of lot.items) {
            const adjustment = itemMap.get(incoming.id)
            const actualQty = adjustment ? adjustment.receivedQuantity : incoming.quantity
            const line = purchase.items.find((it) => it.productId === incoming.productId) ?? purchase.items[0]
            if (!line) continue
            const newReceived = Math.min(line.quantity, line.receivedQty + actualQty)
            await tx.purchaseItem.update({ where: { id: line.id }, data: { receivedQty: newReceived } })
            line.receivedQty = newReceived
          }
          const done = purchase.items.every((it) => it.receivedQty >= it.quantity)
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
          newValue: JSON.stringify({ status: "ARRIVED", previewAdjusted: true }),
          branchId: lot.branchId,
        },
      })
    })
  } catch (error) {
    return { error: shopError(error, "Could not confirm arrival of these goods.") }
  }

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
    select: {
      id: true,
      invoiceNumber: true,
      branchId: true,
      supplierId: true,
      originCountry: true,
      originCity: true,
    },
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
