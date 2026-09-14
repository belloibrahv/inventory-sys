"use server"

import { IncomingIdentity, IncomingStatus, type Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { can, isSuperAdmin } from "@/lib/permissions"
import { scopedBranchId } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { generateDocNumber, money } from "@/lib/utils"
import { shopError } from "@/lib/shop-speak"

type Tx = Prisma.TransactionClient

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
      purchase: {
        include: {
          items: { select: { productId: true, costPrice: true, quantity: true } },
        },
      },
      items: { include: { product: { include: { brand: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  })

  // Plain numbers for the receive form: bill cost when linked, else catalogue cost.
  return lots.map((lot) => {
    const billCostByProduct = new Map(
      (lot.purchase?.items ?? []).map((row) => [row.productId, money(row.costPrice)])
    )
    return {
      ...lot,
      purchase: lot.purchase
        ? { id: lot.purchase.id, invoiceNumber: lot.purchase.invoiceNumber }
        : null,
      items: lot.items.map((item) => {
        const catalogCost = money(item.product.costPrice)
        const billCost = billCostByProduct.get(item.productId)
        return {
          ...item,
          product: {
            ...item.product,
            costPrice: catalogCost,
          },
          suggestedCost: billCost != null ? billCost : catalogCost,
          catalogCost,
          billCost: billCost ?? null,
        }
      }),
    }
  })
}

export async function createIncomingLot(formData: FormData) {
  const user = await requireUser()
  if (!(await canBookIncoming(user.role))) return { error: "You are not allowed to book goods that are still on the way. Ask the main admin." }

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
    if (!purchase) return { error: "We could not find that supplier bill." }
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
        if (!productId || quantity < 1) throw new Error("Every line needs an item, and either how many or the list of numbers.")
        if (identity !== "NONE" && ids.length === 0) throw new Error("Scan the IMEI or serial number for items that carry one.")

        await tx.incomingItem.create({
          data: {
            lotId: lot.id,
            productId,
            quantity,
            expectedQuantity: quantity,
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
  /** Unit cost confirmed on the carton / waybill before stock goes sellable. */
  unitCost: number
}

export type PreviewAndReceivePayload = {
  lotId: string
  notes?: string
  items: ReceiveItemAdjustment[]
}

async function applyConfirmedUnitCost(
  tx: Tx,
  input: {
    productId: string
    productName: string
    unitCost: number
    userId: string
    lotNumber: string
    purchaseId: string | null
  }
) {
  const product = await tx.product.findUnique({ where: { id: input.productId } })
  if (!product) throw new Error(`${input.productName} is missing from the price list.`)
  const next = input.unitCost.toFixed(2)
  const previous = money(product.costPrice)
  if (previous !== input.unitCost) {
    await tx.product.update({
      where: { id: input.productId },
      data: { costPrice: next },
    })
    await tx.priceHistory.create({
      data: {
        productId: input.productId,
        oldPrice: previous.toFixed(2),
        newPrice: next,
        priceType: "COST_PRICE",
        reason: `Checked on receive ${input.lotNumber}`,
        changedBy: input.userId,
      },
    })
  }

  if (!input.purchaseId) return
  const line = await tx.purchaseItem.findFirst({
    where: { purchaseId: input.purchaseId, productId: input.productId },
  })
  if (!line) return
  const lineTotal = (input.unitCost * line.quantity).toFixed(2)
  await tx.purchaseItem.update({
    where: { id: line.id },
    data: { costPrice: next, totalAmount: lineTotal },
  })
  const siblings = await tx.purchaseItem.findMany({ where: { purchaseId: input.purchaseId } })
  const billTotal = siblings.reduce((sum, row) => {
    if (row.id === line.id) return sum + input.unitCost * line.quantity
    return sum + money(row.totalAmount)
  }, 0)
  await tx.purchase.update({
    where: { id: input.purchaseId },
    data: { totalAmount: billTotal.toFixed(2) },
  })
}

/**
 * Preview and edit incoming goods before confirming arrival into shop stock.
 * Handles discrepancies (e.g., expected 50, received 48): records the variance
 * on each line, keeps the original expected count, and alerts the records
 * checker / books desk.
 */
export async function previewAndReceiveIncoming(payload: PreviewAndReceivePayload) {
  const user = await requireUser()
  if (!(await canBookIncoming(user.role))) return { error: "You are not allowed to mark goods as arrived. Ask the main admin." }

  const lot = await prisma.incomingLot.findUnique({
    where: { id: payload.lotId },
    include: { items: { include: { product: true } }, branch: true, supplier: true, purchase: true },
  })
  if (!lot || lot.status !== "COMING") return { error: "These goods are not marked as on the way, so you cannot receive them." }

  const itemMap = new Map(payload.items.map((it) => [it.itemId, it]))

  type LineVariance = {
    productName: string
    expected: number
    received: number
    short: number
  }
  const variances: LineVariance[] = []
  const costChanges: Array<{ productName: string; from: number; to: number }> = []

  for (const item of lot.items) {
    const adjustment = itemMap.get(item.id)
    if (!adjustment) return { error: `Confirm the cost and count for ${item.product.name}.` }
    const unitCost = Number(adjustment.unitCost)
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      return { error: `Enter a valid unit cost for ${item.product.name}.` }
    }

    const expected = item.expectedQuantity > 0 ? item.expectedQuantity : item.quantity
    let received = Math.max(0, adjustment.receivedQuantity)
    if (item.identity !== "NONE") {
      const confirmed = (adjustment.confirmedIdentities || []).map((id) => id.trim()).filter(Boolean)
      if (confirmed.length > 0) received = confirmed.length
    }
    if (received !== expected) {
      variances.push({
        productName: item.product.name,
        expected,
        received,
        short: expected - received,
      })
    }
    const catalogCost = money(item.product.costPrice)
    if (catalogCost !== unitCost) {
      costChanges.push({ productName: item.product.name, from: catalogCost, to: unitCost })
    }
  }

  const note = (payload.notes || "").trim()
  if (variances.length > 0 && !note) {
    return {
      error:
        "The count does not match what was expected. Write a short note (for example: two units short in the carton) before you confirm.",
    }
  }
  if (costChanges.length > 0 && !note) {
    return {
      error:
        "The unit cost differs from the price list. Write a short note (for example: supplier invoice showed a new cost) before you confirm.",
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of lot.items) {
        const adjustment = itemMap.get(item.id)!
        const expected = item.expectedQuantity > 0 ? item.expectedQuantity : item.quantity
        const confirmedIds = (adjustment.confirmedIdentities || []).map((id) => id.trim()).filter(Boolean)
        let receivedQty = Math.max(0, adjustment.receivedQuantity)
        const unitCost = Number(adjustment.unitCost)

        if (item.identity === "NONE") {
          // Decrement all incoming, increment only actually received quantity
          await tx.inventory.upsert({
            where: { productId_branchId: { productId: item.productId, branchId: lot.branchId } },
            update: {
              incomingQty: { decrement: expected },
              quantity: { increment: receivedQty },
            },
            create: { productId: item.productId, branchId: lot.branchId, quantity: receivedQty, incomingQty: 0 },
          })
          await tx.incomingItem.update({
            where: { id: item.id },
            data: {
              expectedQuantity: expected,
              receivedQuantity: receivedQty,
              quantity: receivedQty,
            },
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
          receivedQty = actualReceived

          await tx.inventory.upsert({
            where: { productId_branchId: { productId: item.productId, branchId: lot.branchId } },
            update: {
              incomingQty: { decrement: expected },
              quantity: { increment: actualReceived },
            },
            create: { productId: item.productId, branchId: lot.branchId, quantity: actualReceived, incomingQty: 0 },
          })

          await tx.incomingItem.update({
            where: { id: item.id },
            data: {
              expectedQuantity: expected,
              receivedQuantity: actualReceived,
              quantity: actualReceived,
              identifiers: confirmedIds.length ? confirmedIds.join("\n") : item.identifiers,
            },
          })
        }

        await applyConfirmedUnitCost(tx, {
          productId: item.productId,
          productName: item.product.name,
          unitCost,
          userId: user.id,
          lotNumber: lot.lotNumber,
          purchaseId: lot.purchaseId,
        })

        // Keep purchase receivedQty in sync with what really entered the shop.
        if (lot.purchaseId) {
          const purchase = await tx.purchase.findUnique({
            where: { id: lot.purchaseId },
            include: { items: true },
          })
          if (purchase) {
            const line = purchase.items.find((it) => it.productId === item.productId) ?? purchase.items[0]
            if (line) {
              const newReceived = Math.min(line.quantity, line.receivedQty + receivedQty)
              await tx.purchaseItem.update({ where: { id: line.id }, data: { receivedQty: newReceived } })
            }
          }
        }
      }

      const varianceSummary =
        variances.length === 0
          ? null
          : variances
              .map((row) =>
                row.short > 0
                  ? `${row.productName}: expected ${row.expected}, got ${row.received} (short ${row.short})`
                  : `${row.productName}: expected ${row.expected}, got ${row.received} (extra ${-row.short})`
              )
              .join(" · ")

      const nextNotes = [
        lot.notes,
        note || null,
        varianceSummary ? `Variance: ${varianceSummary}` : null,
      ]
        .filter(Boolean)
        .join(" · ")

      await tx.incomingLot.update({
        where: { id: lot.id },
        data: {
          status: IncomingStatus.ARRIVED,
          notes: nextNotes || null,
        },
      })

      if (lot.purchaseId) {
        const purchase = await tx.purchase.findUnique({
          where: { id: lot.purchaseId },
          include: { items: true },
        })
        if (purchase) {
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
          newValue: JSON.stringify({
            status: "ARRIVED",
            variance: variances,
            costChanges,
            note: note || null,
          }),
          branchId: lot.branchId,
        },
      })
    })
  } catch (error) {
    return { error: shopError(error, "Could not confirm arrival of these goods.") }
  }

  if (variances.length > 0) {
    await alertReceiveShortage({
      lotNumber: lot.lotNumber,
      branchId: lot.branchId,
      branchName: lot.branch.name,
      supplierName: lot.supplier?.name ?? null,
      purchaseInvoice: lot.purchase?.invoiceNumber ?? null,
      variances,
      note,
    })
  }

  revalidatePath("/incoming")
  revalidatePath("/inventory")
  revalidatePath("/imei")
  revalidatePath("/pos")
  revalidatePath("/purchases")
  revalidatePath("/products")
  revalidatePath("/dashboard")
  revalidatePath("/notifications")
  return {
    success: true,
    variance: variances.length > 0,
    costChanged: costChanges.length > 0,
    shortUnits: variances.reduce((sum, row) => sum + Math.max(0, row.short), 0),
  }
}

async function alertReceiveShortage(input: {
  lotNumber: string
  branchId: string
  branchName: string
  supplierName: string | null
  purchaseInvoice: string | null
  variances: Array<{ productName: string; expected: number; received: number; short: number }>
  note: string
}) {
  const shortTotal = input.variances.reduce((sum, row) => sum + Math.max(0, row.short), 0)
  const extraTotal = input.variances.reduce((sum, row) => sum + Math.max(0, -row.short), 0)
  const headline =
    shortTotal > 0
      ? `Shortage on ${input.lotNumber}: ${shortTotal} unit${shortTotal === 1 ? "" : "s"} short`
      : `Extra units on ${input.lotNumber}: ${extraTotal} more than expected`
  const lines = input.variances
    .map((row) =>
      row.short > 0
        ? `${row.productName} — expected ${row.expected}, got ${row.received} (short ${row.short})`
        : `${row.productName} — expected ${row.expected}, got ${row.received} (extra ${-row.short})`
    )
    .join("; ")
  const where = [
    input.branchName,
    input.supplierName,
    input.purchaseInvoice ? `bill ${input.purchaseInvoice}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const message = `${where}. ${lines}. Note: ${input.note}`

  const watchers = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: { in: ["SUPER_ADMIN", "CEO", "AUDITOR", "ACCOUNTANT", "VAULT_MANAGER"] } },
        { role: "BRANCH_MANAGER", branchId: input.branchId },
      ],
    },
    select: { id: true },
  })
  if (!watchers.length) return
  await prisma.notification.createMany({
    data: watchers.map((watcher) => ({
      userId: watcher.id,
      type: "SYSTEM" as const,
      title: headline,
      message,
      actionUrl: "/incoming",
    })),
  })
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
  if (!(await canBookIncoming(user.role))) return { error: "You are not allowed to book goods that are still on the way. Ask the main admin." }
  const purchaseId = String(formData.get("id") || "")
  const identifiers = parseIds(String(formData.get("imeis") || ""))
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: { include: { product: true } } },
  })
  if (!purchase) return { error: "We could not find that supplier bill." }
  const item = purchase.items[0]
  if (!item) return { error: "That supplier bill has no items on it." }

  const alreadyComing = await prisma.incomingItem.aggregate({
    where: { lot: { purchaseId, status: "COMING" }, productId: item.productId },
    _sum: { quantity: true },
  })
  const remaining = item.quantity - item.receivedQty - (alreadyComing._sum.quantity ?? 0)
  if (remaining < 1) return { error: "Every item on this bill is already booked as on the way." }

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
  if (!isSuperAdmin(user.role)) return { error: "Only the main admin can show or hide goods on the way." }
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
