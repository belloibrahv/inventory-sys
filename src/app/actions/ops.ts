"use server"

import { revalidatePath } from "next/cache"
import {
  FaultClass,
  PaymentMethod,
  ProductCondition,
  RepairStatus,
  ReturnOutcome,
  ReturnReason,
  type Prisma,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { canApprove, canManageFinance, canSeeAllBranches, scopedBranchId } from "@/lib/rbac"
import { can } from "@/lib/permissions"
import { generateDocNumber, money } from "@/lib/utils"
import { shopError } from "@/lib/shop-speak"
import { canReachBranch, resolveWritableShopId, viewBranchFilter } from "@/lib/branch-scope"
import { ConflictError, claimImei, claimImeis, drawStock, returnStock, shiftCustomerBalance } from "@/lib/concurrency"
import { warrantyState } from "@/lib/warranty"
import { cell, readTableFile } from "@/lib/table-file"
import { buildBillTrace, type SupplierBillTrace } from "@/lib/supplier-trace"
import { watBounds, watDayKey } from "@/lib/lagos-day"
import { getAppSettings } from "@/lib/settings"
import { healOpeningStockBills } from "@/lib/opening-stock-money"
import { isOpeningStockPurchase, purchaseBalance } from "@/lib/purchase-money"
import { isSupplierReturnableStatus, supplierReturnMoneyPlan } from "@/lib/vendor-return"

function parseImeis(raw: string) {
  return [...new Set(raw.split(/[\s,;]+/).map((item) => item.trim()).filter((item) => item.length >= 14))]
}

function parseTransferIds(raw: string) {
  const match = raw.match(/IMEIs:\s*(.+)/i)
  const list = match ? match[1] : raw
  return [...new Set(list.split(/[\s,;]+/).map((item) => item.trim()).filter((item) => item.length >= 4 && !item.includes(":")))]
}

/** IMEIs on transfers still waiting for the other shop to accept or reject. */
export async function reservedTransferImeiSet(branchId?: string) {
  const rows = await prisma.stockTransfer.findMany({
    where: {
      status: "PENDING",
      ...(branchId ? { fromBranchId: branchId } : {}),
    },
    select: { notes: true },
  })
  return new Set(rows.flatMap((row) => parseTransferIds(row.notes ?? "")))
}

/** Shop devices on a Swap Deal still waiting for approval. Stock has not left yet. */
export async function reservedSwapImeiSet(branchId?: string) {
  const rows = await prisma.swap.findMany({
    where: {
      status: "PENDING",
      ...(branchId ? { branchId } : {}),
      newImeiId: { not: null },
    },
    select: { newImei: { select: { imei1: true, serialNumber: true } } },
  })
  const ids = new Set<string>()
  for (const row of rows) {
    if (row.newImei?.imei1) ids.add(row.newImei.imei1)
    if (row.newImei?.serialNumber) ids.add(row.newImei.serialNumber)
  }
  return ids
}

function cleanDeviceId(raw: string) {
  return String(raw || "").replace(/[\s-]/g, "").trim()
}

function looksLikeImei(value: string) {
  return /^\d{14,17}$/.test(value)
}

function refreshOps() {
  for (const path of [
    "/purchases",
    "/swaps",
    "/returns",
    "/transfers",
    "/repairs",
    "/imei",
    "/inventory",
    "/approvals",
    "/sales",
    "/customers",
    "/finance",
    "/reconciliation",
    "/audit",
    "/staff",
    "/suppliers",
    "/neighbor-fills",
    "/profits",
    "/reports",
    "/dashboard",
    "/audit/books",
  ]) {
    revalidatePath(path)
  }
  revalidatePath("/purchases", "layout")
  revalidatePath("/imei", "layout")
}

async function notify(userId: string, title: string, message: string, actionUrl: string, type: "APPROVAL_REQUEST" | "TRANSFER" | "RETURN" | "SYSTEM" = "SYSTEM") {
  await prisma.notification.create({
    data: { userId, type, title, message, actionUrl },
  })
}

async function attachImeisToPurchases() {
  const orphanCount = await prisma.imeiRecord.count({
    where: { purchaseId: null, notes: { not: null } },
  })
  if (orphanCount === 0) return
  const bills = await prisma.purchase.findMany({
    select: {
      id: true,
      invoiceNumber: true,
      incomingLots: { select: { lotNumber: true } },
    },
  })
  for (const bill of bills) {
    const needles = [bill.invoiceNumber, ...bill.incomingLots.map((lot) => lot.lotNumber)].filter(Boolean)
    if (!needles.length) continue
    await prisma.imeiRecord.updateMany({
      where: {
        purchaseId: null,
        OR: needles.map((needle) => ({ notes: { contains: needle } })),
      },
      data: { purchaseId: bill.id },
    })
  }
}

function trackingOf(value: string | undefined): "IMEI" | "SERIAL" | "NONE" {
  if (value === "SERIAL") return "SERIAL"
  if (value === "NONE") return "NONE"
  return "IMEI"
}

async function accessorySoldSince(productId: string, branchId: string, since: Date) {
  const today = watBounds(watDayKey())
  const [all, todayRows] = await Promise.all([
    prisma.saleItem.aggregate({
      where: {
        productId,
        imeiId: null,
        sale: {
          branchId,
          status: "COMPLETED",
          saleType: { not: "NEIGHBOR_FILL" },
          saleDate: { gte: since },
        },
      },
      _sum: { quantity: true },
    }),
    prisma.saleItem.aggregate({
      where: {
        productId,
        imeiId: null,
        sale: {
          branchId,
          status: "COMPLETED",
          saleType: { not: "NEIGHBOR_FILL" },
          saleDate: { gte: today.start, lt: today.end },
        },
      },
      _sum: { quantity: true },
    }),
  ])
  return {
    soldQty: all._sum.quantity ?? 0,
    soldToday: todayRows._sum.quantity ?? 0,
  }
}

const purchaseInclude = {
  supplier: true,
  branch: true,
  user: true,
  items: { include: { product: true } },
  incomingLots: { select: { id: true, lotNumber: true, status: true, createdAt: true } },
  openingStock: { select: { id: true } },
  imeiRecords: {
    include: {
      branch: true,
      customer: true,
      sale: { select: { id: true, invoiceNumber: true, saleDate: true, status: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
}

function purchaseSearchWhere(q: string) {
  return {
    OR: [
      { invoiceNumber: { contains: q } },
      { originCity: { contains: q } },
      { originCountry: { contains: q } },
      { notes: { contains: q } },
      { supplier: { name: { contains: q } } },
      { items: { some: { product: { OR: [{ name: { contains: q } }, { sku: { contains: q } }] } } } },
      {
        imeiRecords: {
          some: {
            OR: [
              { imei1: { contains: q } },
              { imei2: { contains: q } },
              { serialNumber: { contains: q } },
            ],
          },
        },
      },
    ],
  }
}

export async function getPurchases(search?: string) {
  const user = await requireUser()
  const branchId = await viewBranchFilter(user)
  await healOpeningStockBills()
  await attachImeisToPurchases()
  const q = search?.trim() ?? ""
  const purchases = await prisma.purchase.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      ...(q.length >= 2 ? purchaseSearchWhere(q) : {}),
    },
    include: purchaseInclude,
    orderBy: { createdAt: "desc" },
  })

  const traces = await Promise.all(
    purchases.map(async (purchase) => {
      const item = purchase.items[0]
      const tracking = trackingOf(item?.product.tracking)
      const accessory =
        tracking === "NONE" && item
          ? {
              receivedQty: item.receivedQty,
              ...(await accessorySoldSince(item.productId, purchase.branchId, purchase.createdAt)),
            }
          : undefined
      const trace = buildBillTrace(
        item?.quantity ?? 0,
        tracking,
        purchase.imeiRecords.map((row) => ({ status: row.status, saleDate: row.sale?.saleDate ?? null })),
        accessory
      )
      return { ...purchase, trace }
    })
  )
  return traces
}

export async function getPurchase(id: string) {
  const user = await requireUser()
  await healOpeningStockBills()
  await attachImeisToPurchases()
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { ...purchaseInclude, incomingLots: true },
  })
  if (!purchase) return null
  // A supplier bill carries cost prices and the IMEIs it landed. It stays with
  // the shop that ordered it.
  if (!(await canReachBranch(user, purchase.branchId))) return null
  const item = purchase.items[0]
  const tracking = trackingOf(item?.product.tracking)
  const accessory =
    tracking === "NONE" && item
      ? {
          receivedQty: item.receivedQty,
          ...(await accessorySoldSince(item.productId, purchase.branchId, purchase.createdAt)),
        }
      : undefined
  const trace: SupplierBillTrace = buildBillTrace(
    item?.quantity ?? 0,
    tracking,
    purchase.imeiRecords.map((row) => ({ status: row.status, saleDate: row.sale?.saleDate ?? null })),
    accessory
  )
  return { ...purchase, trace }
}

export async function createPurchase(formData: FormData) {
  const user = await requireUser()
  const supplierId = String(formData.get("supplierId"))
  const shopGate = await resolveWritableShopId(user, String(formData.get("branchId") || user.branchId || ""))
  if ("error" in shopGate) return { error: shopGate.error }
  const branchId = shopGate.shopId
  const productId = String(formData.get("productId"))
  const quantity = Number(formData.get("quantity") || 0)
  const costPrice = Number(formData.get("costPrice") || 0)
  if (!supplierId || !productId || quantity < 1) return { error: "Fill the form for the goods you are expecting." }

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier) return { error: "Pick a supplier from the list." }
  if (supplier.kind === "NEIGHBOR") {
    return { error: "A neighboring shop is not a supplier carton. Use Buy from next door." }
  }

  const originCountry = String(formData.get("originCountry") || "").trim() || supplier.country
  const originCity = String(formData.get("originCity") || "").trim() || supplier.city
  const expectedRaw = String(formData.get("expectedDate") || "").trim()
  const expectedDate = expectedRaw ? new Date(`${expectedRaw}T12:00:00`) : null

  const purchase = await prisma.purchase.create({
    data: {
      invoiceNumber: generateDocNumber("PO"),
      supplierId,
      branchId,
      userId: user.id,
      status: "ORDERED",
      totalAmount: (quantity * costPrice).toFixed(2),
      notes: String(formData.get("notes") || "") || null,
      originCountry,
      originCity,
      expectedDate,
      items: {
        create: {
          productId,
          quantity,
          costPrice: costPrice.toFixed(2),
          totalAmount: (quantity * costPrice).toFixed(2),
        },
      },
    },
  })
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CREATE",
      entityType: "Purchase",
      entityId: purchase.invoiceNumber,
      newValue: JSON.stringify({ quantity, costPrice }),
      branchId,
    },
  })
  refreshOps()
  return { success: true, id: purchase.id, redirectTo: `/purchases/${purchase.id}` }
}

export async function receivePurchaseImeis(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.intake"))) return { error: "You are not allowed to receive supplier goods. Ask the main admin." }
  const id = String(formData.get("id"))
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { items: { include: { product: true } }, supplier: true },
  })
  if (!purchase) return { error: "We could not find that supplier bill." }
  if (purchase.status === "RECEIVED") return { error: "These goods have already been received and the bill is closed." }

  const item = purchase.items[0]
  if (!item) return { error: "That supplier bill has no items on it." }

  const costRaw = String(formData.get("costPrice") ?? "").trim()
  const unitCost = costRaw === "" ? money(item.costPrice) : Number(costRaw)
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    return { error: "Enter a valid unit cost from the supplier paper before you receive." }
  }
  const costNote = String(formData.get("costNote") || "").trim()
  if (unitCost !== money(item.product.costPrice) && !costNote) {
    return { error: "The unit cost differs from the price list. Write a short note before you receive." }
  }

  async function applyCost(tx: Prisma.TransactionClient) {
    const next = unitCost.toFixed(2)
    const previous = money(item!.product.costPrice)
    if (previous !== unitCost) {
      await tx.product.update({ where: { id: item!.productId }, data: { costPrice: next } })
      await tx.priceHistory.create({
        data: {
          productId: item!.productId,
          oldPrice: previous.toFixed(2),
          newPrice: next,
          priceType: "COST_PRICE",
          reason: costNote || `Checked on receive ${purchase!.invoiceNumber}`,
          changedBy: user.id,
        },
      })
    }
    const lineTotal = (unitCost * item!.quantity).toFixed(2)
    await tx.purchaseItem.update({
      where: { id: item!.id },
      data: { costPrice: next, totalAmount: lineTotal },
    })
    await tx.purchase.update({
      where: { id: purchase!.id },
      data: { totalAmount: lineTotal },
    })
  }

  const settings = await getAppSettings()
  if (settings.dualControlIncoming) {
    return {
      error:
        "A second person must say yes before goods enter the shop. Book this bill as Coming, then use Preview and receive on Goods on the way.",
    }
  }

  const imeis = parseImeis(String(formData.get("imeis") || ""))
  const remaining = item.quantity - item.receivedQty

  if (imeis.length === 0) {
    if (remaining < 1) return { error: "There is nothing left to receive on this bill." }
    try {
      await prisma.$transaction(async (tx) => {
        // Only book in against the count this screen was showing. Two people
        // receiving the same shipment used to add the goods to stock twice.
        const booked = await tx.purchaseItem.updateMany({
          where: { id: item.id, receivedQty: item.receivedQty },
          data: { receivedQty: item.quantity },
        })
        if (booked.count !== 1) {
          throw new ConflictError(`${purchase.invoiceNumber} was already received by someone else. Refresh to see it.`)
        }
        await applyCost(tx)
        await tx.purchase.update({
          where: { id },
          data: { status: "RECEIVED", receivedDate: new Date() },
        })
        await returnStock(tx, { productId: item.productId, branchId: purchase.branchId, quantity: remaining })
      })
    } catch (error) {
      return { error: shopError(error, "Could not receive this shipment.") }
    }
    refreshOps()
    revalidatePath("/products")
    return { success: true }
  }

  if (imeis.length > remaining) {
    return { error: `Only ${remaining} units are still expected. You pasted ${imeis.length} IMEIs.` }
  }

  const duplicates = await prisma.imeiRecord.findMany({
    where: { OR: [{ imei1: { in: imeis } }, { imei2: { in: imeis } }] },
    select: { imei1: true },
  })
  if (duplicates.length) {
    return { error: `This IMEI is already in the shop: ${duplicates.map((row) => row.imei1).join(", ")}` }
  }

  const receivedQty = item.receivedQty + imeis.length
  const done = receivedQty >= item.quantity

  try {
  await prisma.$transaction(async (tx) => {
    // Claim the line against the count this screen was showing, before creating
    // anything. A second receive on the same shipment now stops here instead of
    // booking the same phones in twice.
    const booked = await tx.purchaseItem.updateMany({
      where: { id: item.id, receivedQty: item.receivedQty },
      data: { receivedQty },
    })
    if (booked.count !== 1) {
      throw new ConflictError(`${purchase.invoiceNumber} was received by someone else while you were scanning. Refresh and scan what is left.`)
    }
    for (const imei1 of imeis) {
      await tx.imeiRecord.create({
        data: {
          imei1,
          productId: item.productId,
          supplierId: purchase.supplierId,
          branchId: purchase.branchId,
          purchaseId: purchase.id,
          status: "IN_STOCK",
          notes: `Received on ${purchase.invoiceNumber}`,
        },
      })
    }
    await applyCost(tx)
    await tx.purchase.update({
      where: { id },
      data: {
        status: done ? "RECEIVED" : "PARTIAL_RECEIVED",
        receivedDate: done ? new Date() : purchase.receivedDate,
      },
    })
    await returnStock(tx, { productId: item.productId, branchId: purchase.branchId, quantity: imeis.length })
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "IMPORT",
        entityType: "Purchase",
        entityId: purchase.invoiceNumber,
        newValue: JSON.stringify({
          imeis,
          receivedQty,
          unitCost,
          status: done ? "RECEIVED" : "PARTIAL_RECEIVED",
        }),
        branchId: purchase.branchId,
      },
    })
    for (const imei1 of imeis) {
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "IMEIRecord",
          entityId: imei1,
          newValue: JSON.stringify({ status: "IN_STOCK", purchase: purchase.invoiceNumber }),
          branchId: purchase.branchId,
        },
      })
    }
  })
  } catch (error) {
    return { error: shopError(error, "Could not receive these phones. Check that no IMEI is already on the system.") }
  }

  refreshOps()
  revalidatePath("/products")
  return { success: true }
}

export async function payPurchase(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageFinance(user.role))) return { error: "You are not allowed to pay suppliers. Ask accounts." }
  const id = String(formData.get("id") || "")
  const amount = Number(formData.get("amount") || 0)
  const method = String(formData.get("method") || "TRANSFER")
  if (!id || amount <= 0) return { error: "Enter the amount sent to the supplier." }

  await healOpeningStockBills()
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { supplier: true, openingStock: true },
  })
  if (!purchase) return { error: "We could not find that supplier bill." }
  if (isOpeningStockPurchase(purchase)) {
    return { error: "Opening stock is the value the shop started with. It is not a bill to pay." }
  }
  const due = purchaseBalance(purchase.totalAmount, purchase.paidAmount, purchase.returnedAmount).owed
  if (due <= 0) {
    const surplus = purchaseBalance(purchase.totalAmount, purchase.paidAmount, purchase.returnedAmount).surplus
    if (surplus > 0) {
      return { error: "This house already owes us after phones were sent back. Do not pay more on this bill." }
    }
    return { error: "This supplier bill is already fully paid." }
  }
  const sent = Math.min(amount, due)
  const payRef = generateDocNumber("SPAY")

  try {
  await prisma.$transaction(async (tx) => {
    // The database adds the payment on, so two clerks paying the same supplier
    // invoice at once cannot overwrite each other and lose one of the payments.
    const paid = await tx.purchase.update({
      where: { id },
      data: {
        paidAmount: { increment: sent },
        paymentMethod: method,
      },
      select: { paidAmount: true, totalAmount: true, returnedAmount: true, invoiceNumber: true },
    })
    const remaining = Math.max(0, money(paid.totalAmount) - money(paid.returnedAmount))
    if (money(paid.paidAmount) > remaining + 0.005) {
      throw new ConflictError(`${paid.invoiceNumber} was already paid while you were typing. Open it again to see what is still owed.`)
    }
    await tx.financeEntry.create({
      data: {
        branchId: purchase.branchId,
        account: method === "CASH" ? "CASH" : "BANK",
        type: "EXPENSE",
        amount: sent.toFixed(2),
        reference: payRef,
        description: `Supplier payment ${purchase.invoiceNumber} · ${purchase.supplier.name}`,
      },
    })
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entityType: "Purchase",
        entityId: purchase.invoiceNumber,
        newValue: JSON.stringify({ payRef, sent, method, goodsUnchanged: true }),
        branchId: purchase.branchId,
      },
    })
  })
  } catch (error) {
    return { error: shopError(error, "Could not record this supplier payment.") }
  }

  refreshOps()
  revalidatePath(`/purchases/${id}`)
  return { success: true }
}

export async function getReturns() {
  const user = await requireUser()
  const branchId = await viewBranchFilter(user)
  const rows = await prisma.stockReturn.findMany({
    where: branchId ? { branchId } : undefined,
    include: {
      customer: true,
      imei: { include: { product: true } },
      replacementImei: { include: { product: true } },
      branch: true,
      user: true,
    },
    orderBy: { createdAt: "desc" },
  })
  const invoices = await prisma.sale.findMany({
    where: { id: { in: rows.map((row) => row.saleId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, invoiceNumber: true },
  })
  return rows.map((row) => ({
    ...row,
    invoice: invoices.find((sale) => sale.id === row.saleId) ?? null,
  }))
}

export async function getSoldImeis() {
  const user = await requireUser()
  const branchId = await scopedBranchId(user.role, user.branchId)
  return prisma.imeiRecord.findMany({
    where: { status: "SOLD", customerId: { not: null }, ...(branchId ? { branchId } : {}) },
    include: {
      product: true,
      customer: true,
      sale: { include: { items: true } },
      branch: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
  })
}

/** Find one sold phone by IMEI or serial when it is not in the recent list. */
export async function findSoldImei(code: string) {
  const user = await requireUser()
  if (!(await can(user.role, "action.return"))) {
    return { error: "You are not allowed to record a return. Ask the main admin." }
  }
  const cleaned = code.replace(/[\s-]/g, "").trim()
  if (!cleaned) return { error: "Scan or type the sold IMEI first." }
  const branchId = await scopedBranchId(user.role, user.branchId)
  const row = await prisma.imeiRecord.findFirst({
    where: {
      status: "SOLD",
      customerId: { not: null },
      ...(branchId ? { branchId } : {}),
      OR: [{ imei1: cleaned }, { serialNumber: cleaned }, { imei1: { endsWith: cleaned } }],
    },
    include: {
      product: true,
      customer: true,
      sale: { include: { items: true } },
      branch: true,
    },
  })
  if (!row) {
    return {
      error:
        "That IMEI is not a sold phone with a buyer name in this shop. Attach the buyer on the invoice first, or check the shop.",
    }
  }
  return { sold: row }
}

/** In shop units staff may give out on a Replace return. */
export async function getInStockForReplace() {
  const user = await requireUser()
  const branchId = await scopedBranchId(user.role, user.branchId)
  return prisma.imeiRecord.findMany({
    where: {
      status: "IN_STOCK",
      NOT: { cosmeticGrade: "FAULTY" },
      product: { condition: { not: "FAULTY" } },
      ...(branchId ? { branchId } : {}),
    },
    include: { product: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  })
}

export async function createReturn(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.return"))) return { error: "You are not allowed to record a return. Ask the main admin." }
  const imei1 = String(formData.get("imei1") ?? "").trim()
  const imei = await prisma.imeiRecord.findUnique({
    where: { imei1 },
    include: { sale: { include: { items: true } }, customer: true, product: true },
  })
  if (!imei || imei.status !== "SOLD") return { error: "That IMEI was never sold, so it cannot be returned." }
  if (!imei.customerId) return { error: "This sale has no buyer name. Add the buyer before you start the return." }
  const open = await prisma.stockReturn.findFirst({
    where: { imeiId: imei.id, status: { in: ["PENDING", "APPROVED"] } },
  })
  if (open) return { error: `${imei1} already has an open return.` }

  const reason = String(formData.get("reason")) as ReturnReason
  if (reason === "WARRANTY") {
    const cover = warrantyState(imei.sale?.saleDate, imei.product.warrantyDays)
    if (!cover.active) return { error: cover.label + ". Pick another return reason. Do not change the old sale." }
  }

  const outcome = String(formData.get("outcome")) as ReturnOutcome
  const line = imei.sale?.items.find((item) => item.imeiId === imei.id)
  const suggested = money(line?.totalPrice) || money(imei.product.sellingPrice)
  const returnRaw = formData.get("returnValue") ?? formData.get("refundAmount")
  const returnValue = returnRaw !== null && String(returnRaw).trim() !== "" ? Number(returnRaw) : suggested
  if (!Number.isFinite(returnValue) || returnValue < 0) {
    return { error: "Enter the return item value." }
  }

  let replacementImeiId: string | null = null
  let replacementValue: number | null = null
  let balanceAmount: number | null = null

  if (outcome === "REPLACEMENT") {
    replacementImeiId = String(formData.get("replacementImeiId") || "").trim() || null
    const replacementValueRaw = formData.get("replacementValue")
    if (!replacementImeiId) return { error: "Pick the shop item to give out as the replacement." }
    const fresh = await prisma.imeiRecord.findUnique({
      where: { id: replacementImeiId },
      include: { product: true },
    })
    if (!fresh || fresh.status !== "IN_STOCK") return { error: "That replacement is not In shop." }
    if (fresh.branchId !== imei.branchId) return { error: "The replacement must be in the same shop as the return." }
    replacementValue =
      replacementValueRaw !== null && String(replacementValueRaw).trim() !== ""
        ? Number(replacementValueRaw)
        : money(fresh.product.sellingPrice)
    if (!Number.isFinite(replacementValue) || replacementValue! < 0) {
      return { error: "Enter the value of the replacement given out." }
    }
    balanceAmount = replacementValue! - returnValue
  }

  const record = await prisma.stockReturn.create({
    data: {
      returnNumber: generateDocNumber("RTN"),
      customerId: imei.customerId!,
      saleId: imei.saleId,
      imeiId: imei.id,
      branchId: imei.branchId,
      userId: user.id,
      reason,
      outcome,
      faultClass: String(formData.get("faultClass") || "FAULTY_STOCK") as FaultClass,
      notes: String(formData.get("notes") || "") || null,
      supplierId: imei.supplierId,
      returnValue: returnValue.toFixed(2),
      refundAmount: returnValue.toFixed(2),
      replacementImeiId,
      replacementValue: replacementValue != null ? replacementValue.toFixed(2) : null,
      balanceAmount: balanceAmount != null ? balanceAmount.toFixed(2) : null,
    },
  })
  await prisma.imeiRecord.update({ where: { id: imei.id }, data: { status: "RETURNED" } })
  await prisma.approval.create({
    data: {
      type: "RETURN",
      entityId: record.id,
      entityType: "Return",
      requestedBy: user.id,
      reason:
        outcome === "REPLACEMENT" && balanceAmount != null
          ? `${record.returnNumber}: replace · return ₦${returnValue} · given ₦${replacementValue} · ${
              balanceAmount > 0 ? `Receivable ₦${balanceAmount}` : balanceAmount < 0 ? `Payable ₦${Math.abs(balanceAmount)}` : "Even"
            }`
          : `${record.returnNumber}: ${record.reason} · return value ₦${returnValue}`,
    },
  })
  const managers = await prisma.user.findMany({
    where: { role: { in: ["CEO", "BRANCH_MANAGER", "AUDITOR", "ACCOUNTANT", "SUPER_ADMIN"] }, isActive: true },
  })
  for (const manager of managers) {
    await notify(manager.id, "A return is waiting for you to say yes", `${record.returnNumber} for IMEI ${imei1}`, "/approvals", "APPROVAL_REQUEST")
  }
  refreshOps()
  return { success: true }
}

export async function completeReturn(formData: FormData) {
  const user = await requireUser()
  const id = String(formData.get("id"))
  const record = await prisma.stockReturn.findUnique({
    where: { id },
    include: {
      customer: true,
      imei: {
        include: {
          product: true,
          supplier: true,
          branch: true,
          purchase: { include: { items: true, openingStock: true } },
        },
      },
      replacementImei: { include: { product: true } },
    },
  })
  if (!record) return { error: "We could not find that return." }
  if (record.status === "COMPLETED") return { error: "That return is already finished." }
  if (record.status !== "APPROVED" && !(await canApprove(user.role))) {
    return { error: "Management has not approved this return yet." }
  }
  const sale = record.saleId
    ? await prisma.sale.findUnique({ where: { id: record.saleId } })
    : null

  const method = String(formData.get("method") || "CASH") as PaymentMethod
  const paidAmount = Number(formData.get("paidAmount") || 0)
  let replacementImeiId = record.replacementImeiId || String(formData.get("replacementImeiId") || "").trim() || null
  const typedImei = String(formData.get("replacementImei") || "").replace(/[\s-]/g, "").trim()

  if (record.outcome === "REPLACEMENT") {
    if (!replacementImeiId && typedImei) {
      const byCode = await prisma.imeiRecord.findFirst({
        where: {
          status: "IN_STOCK",
          branchId: record.branchId,
          OR: [{ imei1: typedImei }, { serialNumber: typedImei }],
        },
      })
      replacementImeiId = byCode?.id ?? null
    }
    if (!replacementImeiId) return { error: "Pick or enter the replacement from In shop stock." }
  }

  try {
  await prisma.$transaction(async (tx) => {
    const sealed = await tx.stockReturn.updateMany({
      where: { id, status: { not: "COMPLETED" } },
      data: {
        status: "COMPLETED",
        approvedBy: user.id,
        approvedAt: new Date(),
        completedAt: new Date(),
        sentToSupplierAt: record.outcome === "SEND_TO_SUPPLIER" ? new Date() : record.sentToSupplierAt,
        supplierId: record.supplierId || record.imei?.supplierId || null,
        replacementImeiId: replacementImeiId || record.replacementImeiId,
      },
    })
    if (sealed.count !== 1) {
      throw new ConflictError(`${record.returnNumber} was already completed by someone else. Refresh to see it.`)
    }

    if (record.outcome === "REFUND" || record.outcome === "CREDIT_NOTE") {
      const asked = money(record.returnValue) || money(record.refundAmount) || (record.imei ? money(record.imei.product.sellingPrice) : 0)
      const salePaid = sale ? money(sale.paidAmount) : asked
      const saleDue = sale ? Math.max(0, money(sale.totalAmount) - salePaid) : 0
      const cashOut = record.outcome === "REFUND" ? Math.min(asked, salePaid || asked) : 0
      const debtRelief = Math.min(saleDue, asked)
      const after = await shiftCustomerBalance(tx, record.customerId, -debtRelief)
      const next = Math.max(0, money(after.currentBalance))
      await tx.ledgerEntry.create({
        data: {
          customerId: record.customerId,
          type: record.outcome === "REFUND" ? "REFUND" : "CREDIT_NOTE",
          amount: (-(cashOut || debtRelief || asked)).toFixed(2),
          balance: next.toFixed(2),
          reference: record.returnNumber,
          description: `${record.outcome}. Original sale ${sale?.invoiceNumber ?? ""} was not edited`,
        },
      })
      if (cashOut > 0) {
        await tx.financeEntry.create({
          data: {
            branchId: record.branchId,
            account: "CASH",
            type: "EXPENSE",
            amount: cashOut.toFixed(2),
            reference: record.returnNumber,
            description: `Refund to ${record.customer.name}`,
          },
        })
      }
    }

    if (record.outcome === "REPAIR" && record.imeiId) {
      await tx.repair.create({
        data: {
          repairNumber: generateDocNumber("RPR"),
          imeiId: record.imeiId,
          customerId: record.customerId,
          branchId: record.branchId,
          userId: user.id,
          issue: record.notes || record.reason,
          status: "PENDING",
        },
      })
      await tx.imeiRecord.update({ where: { id: record.imeiId }, data: { status: "FAULTY" } })
    }

    if (record.outcome === "SEND_TO_SUPPLIER" && record.imeiId && record.imei) {
      await tx.imeiRecord.update({
        where: { id: record.imeiId },
        data: {
          status: "RETURNED_TO_SUPPLIER",
          customerId: null,
          notes: [record.imei.notes, `Sent back to supplier on ${record.returnNumber}`].filter(Boolean).join(" · "),
        },
      })
      await applySupplierReturnMoney(tx, record.imei)
    }

    if (record.outcome === "REPLACEMENT") {
      const fresh = await tx.imeiRecord.findUnique({
        where: { id: replacementImeiId! },
        include: { product: true },
      })
      if (!fresh || fresh.status !== "IN_STOCK") {
        throw new ConflictError("Replacement must be In shop.")
      }
      if (fresh.branchId !== record.branchId) {
        throw new ConflictError("Replacement must be in the same shop.")
      }

      const returnValue = money(record.returnValue) || money(record.refundAmount) || (record.imei ? money(record.imei.product.sellingPrice) : 0)
      const replacementValue =
        record.replacementValue != null ? money(record.replacementValue) : money(fresh.product.sellingPrice)
      const balance = record.balanceAmount != null ? money(record.balanceAmount) : replacementValue - returnValue
      const receivable = Math.max(balance, 0)
      const payable = Math.max(-balance, 0)
      const collected = Math.min(Math.max(0, paidAmount), receivable || payable)

      await tx.stockReturn.update({
        where: { id: record.id },
        data: {
          replacementImeiId: fresh.id,
          replacementValue: replacementValue.toFixed(2),
          balanceAmount: balance.toFixed(2),
          returnValue: returnValue.toFixed(2),
          refundAmount: returnValue.toFixed(2),
        },
      })

      await claimImei(tx, {
        imeiId: fresh.id,
        branchId: fresh.branchId,
        label: fresh.imei1,
        data: { status: "SOLD", customerId: record.customerId, saleId: record.saleId },
      })
      await drawStock(tx, {
        productId: fresh.productId,
        branchId: fresh.branchId,
        quantity: 1,
        label: fresh.product.name,
      })
      if (record.imeiId) {
        await tx.imeiRecord.update({
          where: { id: record.imeiId },
          data: { status: record.faultClass === "GOOD_STOCK" ? "IN_STOCK" : "FAULTY", customerId: null, saleId: null },
        })
        if (record.faultClass === "GOOD_STOCK") {
          await returnStock(tx, { productId: record.imei!.productId, branchId: record.branchId, quantity: 1 })
        }
      }

      if (receivable > 0 && collected > 0) {
        await tx.financeEntry.create({
          data: {
            branchId: record.branchId,
            account: method === "CASH" ? "CASH" : "BANK",
            type: "INCOME",
            amount: collected.toFixed(2),
            reference: record.returnNumber,
            description: `Return receivable · ${record.customer.name} · ${record.returnNumber}`,
          },
        })
      }
      const due = Math.max(receivable - collected, 0)
      if (due > 0) {
        const after = await shiftCustomerBalance(tx, record.customerId, due)
        await tx.ledgerEntry.create({
          data: {
            customerId: record.customerId,
            type: "SALE",
            amount: due.toFixed(2),
            balance: money(after.currentBalance).toFixed(2),
            reference: record.returnNumber,
            description: `Return receivable still owed · ${record.returnNumber}`,
          },
        })
      }
      if (payable > 0) {
        const payOut = collected > 0 ? Math.min(collected, payable) : payable
        await tx.financeEntry.create({
          data: {
            branchId: record.branchId,
            account: method === "CASH" ? "CASH" : "BANK",
            type: "EXPENSE",
            amount: payOut.toFixed(2),
            reference: record.returnNumber,
            description: `Return payable to ${record.customer.name} · ${record.returnNumber}`,
          },
        })
      }
    }

    if (record.outcome !== "REPLACEMENT" && record.outcome !== "REPAIR" && record.outcome !== "SEND_TO_SUPPLIER" && record.imeiId) {
      await tx.imeiRecord.update({
        where: { id: record.imeiId },
        data: {
          status: record.faultClass === "GOOD_STOCK" ? "IN_STOCK" : record.faultClass === "SCRAP_STOCK" ? "DISPOSED" : "FAULTY",
          customerId: null,
        },
      })
      if (record.faultClass === "GOOD_STOCK") {
        await returnStock(tx, { productId: record.imei!.productId, branchId: record.branchId, quantity: 1 })
      }
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "Return",
        entityId: record.returnNumber,
        newValue: JSON.stringify({
          outcome: record.outcome,
          faultClass: record.faultClass,
          returnValue: record.returnValue,
          replacementValue: record.replacementValue,
          balanceAmount: record.balanceAmount,
        }),
        branchId: record.branchId,
      },
    })
  })
  } catch (error) {
    return { error: shopError(error, "Could not complete return.") }
  }

  refreshOps()
  return { success: true }
}

export async function getSwaps() {
  const user = await requireUser()
  const branchId = await viewBranchFilter(user)
  const rows = await prisma.swap.findMany({
    where: branchId ? { branchId } : undefined,
    include: {
      customer: true,
      oldImei: { include: { product: true } },
      newImei: { include: { product: true } },
      newProduct: true,
      branch: true,
    },
    orderBy: { createdAt: "desc" },
  })
  const invoices = await prisma.sale.findMany({
    where: { notes: { contains: "Swap " } },
    select: { id: true, invoiceNumber: true, notes: true },
  })
  return rows.map((row) => ({
    ...row,
    invoice: invoices.find((sale) => sale.notes?.includes(row.swapNumber)) ?? null,
  }))
}

export async function createSwap(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.swap"))) return { error: "You are not allowed to record a swap. Ask the main admin." }

  const branchId = String(formData.get("branchId") || user.branchId || "")
  const existingCustomerId = String(formData.get("customerId") || "").trim()
  const customerName = String(formData.get("customerName") || "").trim()
  const customerPhone = String(formData.get("customerPhone") || "").trim()
  const oldDeviceId = cleanDeviceId(String(formData.get("oldDeviceId") || formData.get("oldImei1") || ""))
  const newDeviceId = cleanDeviceId(String(formData.get("newDeviceId") || formData.get("newImei1") || ""))
  const newImeiId = String(formData.get("newImeiId") || "")
  const oldProductId = String(formData.get("oldProductId") || "")
  const tradeValue = Number(formData.get("tradeValue") || 0)
  const givenRaw = formData.get("givenValue")
  const condition = String(formData.get("oldDeviceCondition")) as ProductCondition

  if (!branchId) return { error: "Pick the shop for this Swap Deal." }
  if (!existingCustomerId && (!customerName || !customerPhone)) {
    return { error: "Pick a customer on the list, or type the customer name and phone." }
  }
  if (oldDeviceId.length < 5) return { error: "Enter the customer device IMEI or serial number." }
  if (!newImeiId && newDeviceId.length < 5) return { error: "Scan or type the shop device IMEI or serial number going out." }
  if (!oldProductId) return { error: "Pick what the customer is bringing in." }
  if (tradeValue < 0) return { error: "Enter the value of the swap-in item." }

  const scoped = await scopedBranchId(user.role, user.branchId)
  if (scoped && branchId !== scoped) return { error: "You can only record a swap for your own shop." }

  let customer = existingCustomerId
    ? await prisma.customer.findUnique({ where: { id: existingCustomerId } })
    : customerPhone
      ? await prisma.customer.findUnique({ where: { phone: customerPhone } })
      : null

  if (!customer) {
    if (!customerName || !customerPhone) {
      return { error: "Pick a customer on the list, or type the customer name and phone." }
    }
    customer = await prisma.customer.create({
      data: { name: customerName, phone: customerPhone, branchId },
    })
  } else if (!existingCustomerId && customerName && customer.name !== customerName) {
    return { error: `Phone ${customerPhone} already belongs to ${customer.name}. Pick them from the list.` }
  }
  if (scoped && customer.branchId !== scoped && customer.branchId !== branchId) {
    return { error: "That customer belongs to another shop." }
  }

  const exists = await prisma.imeiRecord.findFirst({
    where: {
      OR: [{ imei1: oldDeviceId }, { imei2: oldDeviceId }, { serialNumber: oldDeviceId }],
    },
  })
  if (exists) return { error: "That IMEI or serial number is already on this system." }

  const newImei = newImeiId
    ? await prisma.imeiRecord.findUnique({
        where: { id: newImeiId },
        include: { product: true },
      })
    : await prisma.imeiRecord.findFirst({
        where: {
          status: "IN_STOCK",
          branchId,
          OR: [{ imei1: newDeviceId }, { serialNumber: newDeviceId }],
        },
        include: { product: true },
      })
  if (!newImei || newImei.status !== "IN_STOCK") return { error: "That shop device is not In shop." }
  if (newImei.branchId !== branchId) return { error: "That device is not in the selected shop." }

  const reservedTransfer = await reservedTransferImeiSet(branchId)
  const reservedSwap = await reservedSwapImeiSet(branchId)
  if (
    reservedTransfer.has(newImei.imei1) ||
    (newImei.serialNumber && reservedTransfer.has(newImei.serialNumber))
  ) {
    return { error: "That shop device is on a shop-to-shop transfer waiting for accept or reject." }
  }
  if (
    reservedSwap.has(newImei.imei1) ||
    (newImei.serialNumber && reservedSwap.has(newImei.serialNumber))
  ) {
    return { error: "That shop device is already on another Swap Deal waiting for approval." }
  }

  const givenValue =
    givenRaw !== null && String(givenRaw).trim() !== ""
      ? Number(givenRaw)
      : money(newImei.product.sellingPrice)
  if (!Number.isFinite(givenValue) || givenValue < 0) {
    return { error: "Enter the value of the shop item given out." }
  }
  const balance = givenValue - tradeValue

  // Hold only: swap-in stays off the shelf, shop device stays In shop until approval.
  const incoming = await prisma.imeiRecord.create({
    data: {
      imei1: oldDeviceId,
      serialNumber: looksLikeImei(oldDeviceId) ? null : oldDeviceId,
      productId: oldProductId,
      branchId,
      customerId: customer.id,
      status: "RECEIVED",
      notes: `Swap Deal waiting for approval · ${condition} · swap value ${tradeValue}`,
    },
  })

  const swap = await prisma.swap.create({
    data: {
      swapNumber: generateDocNumber("SWP"),
      customerId: customer.id,
      oldImeiId: incoming.id,
      oldDeviceCondition: condition,
      tradeValue: tradeValue.toFixed(2),
      newProductId: newImei.productId,
      newProductPrice: givenValue.toFixed(2),
      newImeiId: newImei.id,
      balanceAmount: balance.toFixed(2),
      branchId,
      userId: user.id,
      status: "PENDING",
      notes: String(formData.get("notes") || "") || null,
    },
  })
  await prisma.approval.create({
    data: {
      type: "SWAP",
      entityId: swap.id,
      entityType: "Swap",
      requestedBy: user.id,
      reason: `${swap.swapNumber}: swap-in ₦${tradeValue} · given ₦${givenValue} · ${
        balance > 0 ? `Receivable ₦${balance}` : balance < 0 ? `Payable ₦${Math.abs(balance)}` : "Even"
      } · ${newImei.product.name}`,
    },
  })
  const managers = await prisma.user.findMany({
    where: { role: { in: ["CEO", "BRANCH_MANAGER", "SUPER_ADMIN"] }, isActive: true },
  })
  for (const manager of managers) {
    await notify(manager.id, "A Swap Deal is waiting for approval", swap.swapNumber, "/approvals", "APPROVAL_REQUEST")
  }
  refreshOps()
  return { success: true }
}

/**
 * After Needs approval says yes: swap-in hits In shop, shop device leaves.
 * After no: cancel the hold and remove the pending swap-in record.
 */
export async function applySwapApprovalDecision(
  swapId: string,
  status: "APPROVED" | "REJECTED",
  userId: string
) {
  const swap = await prisma.swap.findUnique({
    where: { id: swapId },
    include: { customer: true, newProduct: true, oldImei: true, newImei: true },
  })
  if (!swap) return { error: "We could not find that Swap Deal." }
  if (swap.status !== "PENDING") return { error: "Somebody has already decided on this Swap Deal." }

  try {
    await prisma.$transaction(async (tx) => {
      if (status === "REJECTED") {
        await tx.swap.update({
          where: { id: swap.id },
          data: { status: "REJECTED", approvedBy: userId, approvedAt: new Date() },
        })
        await tx.imeiRecord.update({
          where: { id: swap.oldImeiId },
          data: {
            status: "DISPOSED",
            customerId: null,
            notes: `Swap Deal rejected · ${swap.swapNumber}`,
          },
        })
        await tx.auditLog.create({
          data: {
            userId,
            action: "REJECT",
            entityType: "Swap",
            entityId: swap.swapNumber,
            newValue: JSON.stringify({ status: "REJECTED" }),
            branchId: swap.branchId,
          },
        })
        return
      }

      if (!swap.newImeiId) throw new ConflictError("This Swap Deal has no shop device going out.")

      await claimImei(tx, {
        imeiId: swap.newImeiId,
        branchId: swap.branchId,
        label: "The shop device on this Swap Deal",
        data: {
          status: "SWAPPED",
          customerId: swap.customerId,
          notes: `Left on Swap Deal ${swap.swapNumber}`,
        },
      })
      await drawStock(tx, {
        productId: swap.newProductId,
        branchId: swap.branchId,
        quantity: 1,
        label: swap.newProduct.name,
      })
      await tx.imeiRecord.update({
        where: { id: swap.oldImeiId },
        data: {
          status: "IN_STOCK",
          customerId: null,
          notes: `Swap Deal from ${swap.customer.name} · ${swap.swapNumber}`,
        },
      })
      await returnStock(tx, { productId: swap.oldImei.productId, branchId: swap.branchId, quantity: 1 })

      await tx.swap.update({
        where: { id: swap.id },
        data: { status: "APPROVED", approvedBy: userId, approvedAt: new Date() },
      })
      await tx.auditLog.create({
        data: {
          userId,
          action: "APPROVE",
          entityType: "Swap",
          entityId: swap.swapNumber,
          newValue: JSON.stringify({
            status: "APPROVED",
            stockIn: swap.oldImei.imei1,
            stockOut: swap.newImei?.imei1 ?? null,
          }),
          branchId: swap.branchId,
        },
      })
    })
  } catch (error) {
    return { error: shopError(error, "Could not apply this Swap Deal decision.") }
  }

  refreshOps()
  return { success: true }
}

export async function completeSwap(formData: FormData) {
  const user = await requireUser()
  const id = String(formData.get("id"))
  const paid = Number(formData.get("paidAmount") || 0)
  const method = String(formData.get("method") || "TRANSFER") as PaymentMethod
  const swap = await prisma.swap.findUnique({
    where: { id },
    include: { customer: true, newProduct: true, oldImei: true, newImei: true },
  })
  if (!swap || !swap.newImeiId) return { error: "We could not find that swap." }
  if (swap.status === "COMPLETED") return { error: "That swap is already finished." }
  if (swap.status !== "APPROVED") {
    return { error: "Wait for approval on Needs approval before settling the money." }
  }
  const opening = await prisma.openingStock.findUnique({ where: { branchId: swap.branchId }, select: { status: true } })
  if (opening?.status === "OPEN") {
    return { error: "This shop's opening stock is still being counted. Finish the swap once it is closed." }
  }

  const invoiceNumber = generateDocNumber("INV")
  const balance = money(swap.balanceAmount)
  const receivable = Math.max(balance, 0)
  const payable = Math.max(-balance, 0)
  const collected = Math.min(Math.max(0, paid), receivable || payable)

  let invoice: { id: string }
  try {
  invoice = await prisma.$transaction(async (tx) => {
    const sealed = await tx.swap.updateMany({
      where: { id, status: "APPROVED" },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        notes: [swap.notes, `Invoice ${invoiceNumber}`].filter(Boolean).join(" · "),
      },
    })
    if (sealed.count !== 1) {
      throw new ConflictError(`${swap.swapNumber} was already completed by someone else. Refresh to see it.`)
    }

    // Legacy path: older swaps may still have stock waiting if approval only flipped status.
    if (swap.oldImei.status === "RECEIVED") {
      await tx.imeiRecord.update({
        where: { id: swap.oldImeiId },
        data: {
          status: "IN_STOCK",
          customerId: null,
          notes: `Swap Deal from ${swap.customer.name} · ${swap.swapNumber}`,
        },
      })
      await returnStock(tx, { productId: swap.oldImei.productId, branchId: swap.branchId, quantity: 1 })
    }
    if (swap.newImei?.status === "IN_STOCK") {
      await claimImei(tx, {
        imeiId: swap.newImeiId!,
        branchId: swap.branchId,
        label: "The shop device on this Swap Deal",
        data: { status: "SOLD", customerId: swap.customerId },
      })
      await drawStock(tx, {
        productId: swap.newProductId,
        branchId: swap.branchId,
        quantity: 1,
        label: swap.newProduct.name,
      })
    } else {
      await tx.imeiRecord.update({
        where: { id: swap.newImeiId! },
        data: { status: "SOLD", customerId: swap.customerId },
      })
    }

    const sale = await tx.sale.create({
      data: {
        invoiceNumber,
        branchId: swap.branchId,
        userId: user.id,
        customerId: swap.customerId,
        saleType: "RETAIL",
        status: "COMPLETED",
        subtotal: receivable.toFixed(2),
        discount: money(swap.tradeValue).toFixed(2),
        totalAmount: receivable.toFixed(2),
        paidAmount: receivable > 0 ? collected.toFixed(2) : "0.00",
        paymentMethod: receivable > 0 && collected < receivable ? "CREDIT" : method,
        notes: `Swap ${swap.swapNumber}`,
        items: {
          create: {
            productId: swap.newProductId,
            imeiId: swap.newImeiId,
            quantity: 1,
            unitPrice: money(swap.newProductPrice).toFixed(2),
            discount: money(swap.tradeValue).toFixed(2),
            totalPrice: receivable.toFixed(2),
          },
        },
        payments:
          receivable > 0 && collected > 0
            ? { create: { amount: collected.toFixed(2), method } }
            : undefined,
      },
    })

    await tx.imeiRecord.update({
      where: { id: swap.newImeiId! },
      data: { saleId: sale.id },
    })

    const due = Math.max(receivable - collected, 0)
    if (due > 0) {
      const after = await shiftCustomerBalance(tx, swap.customerId, due)
      await tx.ledgerEntry.create({
        data: {
          customerId: swap.customerId,
          type: "SALE",
          amount: due.toFixed(2),
          balance: money(after.currentBalance).toFixed(2),
          reference: invoiceNumber,
          description: `Swap receivable ${swap.swapNumber}`,
        },
      })
    }
    if (receivable > 0 && collected > 0) {
      await tx.financeEntry.create({
        data: {
          branchId: swap.branchId,
          account: method === "CASH" ? "CASH" : "BANK",
          type: "INCOME",
          amount: collected.toFixed(2),
          reference: invoiceNumber,
          description: `Swap receivable ${swap.swapNumber}`,
        },
      })
    }
    if (payable > 0) {
      const payOut = collected > 0 ? Math.min(collected, payable) : payable
      await tx.financeEntry.create({
        data: {
          branchId: swap.branchId,
          account: method === "CASH" ? "CASH" : "BANK",
          type: "EXPENSE",
          amount: payOut.toFixed(2),
          reference: invoiceNumber,
          description: `Swap payable to ${swap.customer.name} · ${swap.swapNumber}`,
        },
      })
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "Swap",
        entityId: swap.swapNumber,
        newValue: JSON.stringify({ invoiceNumber, collected, receivable, payable }),
        branchId: swap.branchId,
      },
    })
    return sale
  })
  } catch (error) {
    return { error: shopError(error, "Could not complete this swap.") }
  }

  refreshOps()
  return { success: true, redirectTo: `/sales/${invoice.id}` }
}

export async function getRepairs() {
  const user = await requireUser()
  const branchId = await viewBranchFilter(user)
  return prisma.repair.findMany({
    where: branchId ? { branchId } : undefined,
    include: { imei: { include: { product: true } }, customer: true, branch: true, user: true },
    orderBy: { createdAt: "desc" },
  })
}

export async function createRepair(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.repair"))) return { error: "You are not allowed to open a repair. Ask the main admin." }
  const imei1 = String(formData.get("imei1") ?? "").trim()
  const imei = await prisma.imeiRecord.findUnique({ where: { imei1 } })
  if (!imei) return { error: "We could not find that IMEI." }
  if (["SOLD", "IN_STOCK", "RETURNED", "REPAIRED"].includes(imei.status) === false) {
    return { error: `${imei1} cannot go on the bench from ${imei.status}.` }
  }

  await prisma.$transaction(async (tx) => {
    await tx.repair.create({
      data: {
        repairNumber: generateDocNumber("RPR"),
        imeiId: imei.id,
        customerId: imei.customerId,
        branchId: imei.branchId,
        userId: user.id,
        issue: String(formData.get("issue") || "Diagnosis required"),
        notes: String(formData.get("notes") || "") || null,
      },
    })
    await tx.imeiRecord.update({ where: { id: imei.id }, data: { status: "FAULTY" } })
    if (imei.status === "IN_STOCK") {
      await tx.inventory.update({
        where: { productId_branchId: { productId: imei.productId, branchId: imei.branchId } },
        data: { quantity: { decrement: 1 } },
      })
    }
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entityType: "Repair",
        entityId: imei1,
        oldValue: imei.status,
        newValue: "FAULTY",
        branchId: imei.branchId,
      },
    })
  })
  refreshOps()
  return { success: true }
}

export async function advanceRepair(formData: FormData) {
  const user = await requireUser()
  const id = String(formData.get("id"))
  const status = String(formData.get("status")) as RepairStatus
  const repair = await prisma.repair.findUnique({
    where: { id },
    include: { customer: true, imei: { include: { product: true } } },
  })
  if (!repair) return { error: "We could not find that repair." }

  const nextCost = formData.get("repairCost") ? Number(formData.get("repairCost")) : money(repair.repairCost)
  const closing = status === "COMPLETED" || status === "DELIVERED"

  try {
  await prisma.$transaction(async (tx) => {
    // Only move the job on from the state this screen was showing. A second
    // click on Delivered used to charge the customer again and put the phone
    // back on the shelf a second time.
    const advanced = await tx.repair.updateMany({
      where: { id, status: repair.status },
      data: {
        status,
        diagnosis: String(formData.get("diagnosis") || repair.diagnosis || "") || null,
        repairCost: nextCost ? nextCost.toFixed(2) : repair.repairCost,
        completedAt: closing ? new Date() : repair.completedAt,
      },
    })
    if (advanced.count !== 1) {
      throw new ConflictError(`${repair.repairNumber} was already moved on by someone else. Refresh to see where it is now.`)
    }

    if (closing) {
      const shopUnit = !repair.customerId
      await tx.imeiRecord.update({
        where: { id: repair.imeiId },
        data: {
          status: shopUnit && status === "DELIVERED" ? "IN_STOCK" : "REPAIRED",
        },
      })
      if (shopUnit && status === "DELIVERED") {
        await returnStock(tx, { productId: repair.imei.productId, branchId: repair.branchId, quantity: 1 })
      }
      if (status === "DELIVERED" && repair.customerId && nextCost > 0 && repair.status !== "DELIVERED") {
        const after = await shiftCustomerBalance(tx, repair.customerId, nextCost)
        await tx.ledgerEntry.create({
          data: {
            customerId: repair.customerId,
            type: "SALE",
            amount: nextCost.toFixed(2),
            balance: money(after.currentBalance).toFixed(2),
            reference: repair.repairNumber,
            description: `Repair ${repair.repairNumber} · ${repair.imei.product.name}`,
          },
        })
        await tx.financeEntry.create({
          data: {
            branchId: repair.branchId,
            account: "CASH",
            type: "INCOME",
            amount: nextCost.toFixed(2),
            reference: repair.repairNumber,
            description: `Repair charge ${repair.repairNumber}`,
          },
        })
      }
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "Repair",
        entityId: repair.repairNumber,
        oldValue: repair.status,
        newValue: JSON.stringify({ status, cost: nextCost }),
        branchId: repair.branchId,
      },
    })
  })
  } catch (error) {
    return { error: shopError(error, "Could not move this repair on.") }
  }
  refreshOps()
  if (repair.customerId) revalidatePath(`/customers/${repair.customerId}`)
  return { success: true }
}

export async function getTransfers() {
  const user = await requireUser()
  const branchId = await viewBranchFilter(user)
  const rows = await prisma.stockTransfer.findMany({
    where: branchId
      ? { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] }
      : undefined,
    include: {
      fromBranch: true,
      toBranch: true,
      user: true,
      items: { include: { product: true } },
    },
    orderBy: { createdAt: "desc" },
  })
  const serials = rows.flatMap((row) => parseTransferIds(row.notes ?? ""))
  const records = serials.length
    ? await prisma.imeiRecord.findMany({
        where: { OR: [{ imei1: { in: serials } }, { serialNumber: { in: serials } }] },
        include: { product: true },
      })
    : []
  return rows.map((row) => ({
    ...row,
    imeis: parseTransferIds(row.notes ?? "")
      .map((code) => records.find((item) => item.imei1 === code || item.serialNumber === code))
      .filter((item): item is (typeof records)[number] => Boolean(item)),
  }))
}

export async function createTransfer(formData: FormData): Promise<{
  error?: string
  errors?: string[]
  success?: boolean
}> {
  const user = await requireUser()
  if (!(await can(user.role, "action.transfer"))) return { error: "You are not allowed to send goods to another shop. Ask the main admin." }
  const fromBranchId = String(formData.get("fromBranchId") || "")
  const toBranchId = String(formData.get("toBranchId") || "")
  if (!fromBranchId || !toBranchId) return { error: "Pick the sending shop and the receiving shop." }
  if (fromBranchId === toBranchId) return { error: "Choose two different Abu Twins shops." }

  const scoped = await scopedBranchId(user.role, user.branchId)
  if (scoped && fromBranchId !== scoped) return { error: "You can only send from your own shop." }

  const selectedImeis = [
    ...new Set(
      String(formData.get("selectedImeis") || "")
        .split(/[\s,;]+/)
        .map((row) => row.trim())
        .filter(Boolean)
    ),
  ]
  let accessoryPicks: Array<{ productId: string; quantity: number }> = []
  try {
    const raw = String(formData.get("accessoryLines") || "").trim()
    if (raw) {
      const parsed = JSON.parse(raw) as Array<{ productId?: string; quantity?: number }>
      accessoryPicks = parsed
        .map((row) => ({
          productId: String(row.productId || ""),
          quantity: Math.floor(Number(row.quantity) || 0),
        }))
        .filter((row) => row.productId && row.quantity > 0)
    }
  } catch {
    return { error: "The selected accessory lines could not be read. Try again." }
  }

  const file = formData.get("file")
  const hasFile = file instanceof File && file.size > 0
  if (!selectedImeis.length && !accessoryPicks.length && !hasFile) {
    return { error: "Select the items to send, or upload a CSV list." }
  }

  const products = await prisma.product.findMany({ where: { isActive: true } })
  const bySku = new Map(products.map((row) => [row.sku.toLowerCase(), row]))
  const byName = new Map<string, typeof products>()
  for (const product of products) {
    const key = product.name.toLowerCase()
    const list = byName.get(key) ?? []
    list.push(product)
    byName.set(key, list)
  }

  type PhoneLine = { imei1: string; productId: string; color: string; extra: string }
  const phones: PhoneLine[] = []
  const accessoryQty = new Map<string, number>()
  const seen = new Set<string>()
  const errors: string[] = []

  if (selectedImeis.length || accessoryPicks.length) {
    if (selectedImeis.length) {
      const records = await prisma.imeiRecord.findMany({
        where: {
          OR: [{ imei1: { in: selectedImeis } }, { serialNumber: { in: selectedImeis } }],
        },
        include: { product: true },
      })
      const byCode = new Map<string, (typeof records)[number]>()
      for (const record of records) {
        for (const key of [record.imei1, record.serialNumber]) {
          if (key && !byCode.has(key)) byCode.set(key, record)
        }
      }
      for (const code of selectedImeis) {
        if (seen.has(code)) {
          errors.push(`${code} is listed twice.`)
          continue
        }
        seen.add(code)
        const record = byCode.get(code)
        if (!record) {
          errors.push(`${code} is not on this system.`)
          continue
        }
        if (record.status !== "IN_STOCK" || record.branchId !== fromBranchId) {
          errors.push(`${record.imei1} is not In shop at the sending shop.`)
          continue
        }
        phones.push({ imei1: record.imei1, productId: record.productId, color: "", extra: "" })
      }
    }
    for (const pick of accessoryPicks) {
      const product = products.find((row) => row.id === pick.productId)
      if (!product) {
        errors.push("One selected accessory is not on the active list.")
        continue
      }
      if (product.tracking !== "NONE") {
        errors.push(`${product.name} needs an IMEI. Select the phone number instead.`)
        continue
      }
      accessoryQty.set(product.id, (accessoryQty.get(product.id) ?? 0) + pick.quantity)
    }
  } else if (hasFile && file instanceof File) {
    if (file.size > 2_000_000) return { error: "That file is too big. Use a file under 2 MB." }
    let rows: Record<string, string>[]
    try {
      rows = await readTableFile(file)
    } catch {
      return { error: "We could not read that file. Save it as CSV or Excel and try again." }
    }
    if (!rows.length) return { error: "There is nothing under the header line in that file." }
    if (rows.length > 200) return { error: "Send up to 200 lines at a time." }

    const codes = rows
      .map((row) => cell(row, "imei", "imei1", "phone") || cell(row, "serial", "serial_number", "sn"))
      .filter(Boolean)
    const codeRecords = codes.length
      ? await prisma.imeiRecord.findMany({
          where: {
            OR: [{ imei1: { in: codes } }, { imei2: { in: codes } }, { serialNumber: { in: codes } }],
          },
          include: { product: true },
        })
      : []
    const byCode = new Map<string, (typeof codeRecords)[number]>()
    for (const record of codeRecords) {
      for (const key of [record.imei1, record.imei2, record.serialNumber]) {
        if (key && !byCode.has(key)) byCode.set(key, record)
      }
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      const line = index + 2
      const imei = cell(row, "imei", "imei1", "phone")
      const serial = cell(row, "serial", "serial_number", "sn")
      const sku = cell(row, "item_code", "sku", "code")
      const name = cell(row, "name", "product", "item")
      const color = cell(row, "color")
      const extra = cell(row, "notes", "note", "remark")
      const qtyRaw = cell(row, "quantity", "qty", "pieces")
      const code = imei || serial

      if (!code && !sku && !name) continue

      if (code) {
        if (seen.has(code)) {
          errors.push(`Line ${line}: ${code} is listed twice.`)
          continue
        }
        seen.add(code)
        const record = byCode.get(code)
        if (!record) {
          errors.push(`Line ${line}: ${code} is not on this system.`)
          continue
        }
        if (record.status !== "IN_STOCK" || record.branchId !== fromBranchId) {
          errors.push(`Line ${line}: ${record.imei1} is not In shop at the sending shop.`)
          continue
        }
        if (sku && record.product.sku.toLowerCase() !== sku.toLowerCase()) {
          errors.push(`Line ${line}: ${record.imei1} belongs to ${record.product.sku}, not ${sku}.`)
          continue
        }
        phones.push({ imei1: record.imei1, productId: record.productId, color, extra })
        continue
      }

      const product =
        (sku ? bySku.get(sku.toLowerCase()) : undefined) ??
        (name && byName.get(name.toLowerCase())?.length === 1 ? byName.get(name.toLowerCase())![0] : undefined)
      if (!product) {
        errors.push(`Line ${line}: pick a known item code for this accessory, or put an IMEI on a phone line.`)
        continue
      }
      if (product.tracking !== "NONE") {
        errors.push(`Line ${line}: ${product.name} needs an IMEI or serial. Put the number in the IMEI or serial column.`)
        continue
      }
      const quantity = Number(qtyRaw || 0)
      if (!Number.isFinite(quantity) || quantity < 1) {
        errors.push(`Line ${line}: type how many ${product.name} pieces are leaving.`)
        continue
      }
      accessoryQty.set(product.id, (accessoryQty.get(product.id) ?? 0) + quantity)
    }
  }

  if (errors.length) return { error: errors[0], errors }
  if (!phones.length && accessoryQty.size === 0) {
    return { error: "Select at least one phone or accessory to transfer." }
  }

  if (phones.length + [...accessoryQty.values()].reduce((sum, n) => sum + n, 0) > 200) {
    return { error: "Send up to 200 units at a time." }
  }

  const qtyByProduct = new Map<string, number>()
  for (const phone of phones) {
    qtyByProduct.set(phone.productId, (qtyByProduct.get(phone.productId) ?? 0) + 1)
  }
  for (const [productId, quantity] of accessoryQty) {
    qtyByProduct.set(productId, (qtyByProduct.get(productId) ?? 0) + quantity)
  }

  const sendingStock = await prisma.inventory.findMany({
    where: { branchId: fromBranchId, productId: { in: [...qtyByProduct.keys()] } },
    select: { productId: true, quantity: true },
  })
  const heldByProduct = new Map(sendingStock.map((row) => [row.productId, row.quantity]))
  for (const [productId, quantity] of qtyByProduct) {
    if ((heldByProduct.get(productId) ?? 0) < quantity) {
      const product = products.find((row) => row.id === productId)
      return { error: `${product?.name ?? "This item"} does not have ${quantity} In shop at the sending shop.` }
    }
  }

  const imeis = phones.map((row) => row.imei1)
  const reserved = await reservedTransferImeiSet(fromBranchId)
  for (const imei1 of imeis) {
    if (reserved.has(imei1)) {
      return { error: `${imei1} is already on a shop-to-shop transfer waiting for the other shop to accept or reject.` }
    }
  }

  const transferNumber = generateDocNumber("TRF")

  // Stock stays In shop at the sending shop until the receiving shop accepts.
  // Reject cancels with no shelf move. Accept is when the stock leaves.
  let transfer: { transferNumber: string }
  try {
    transfer = await prisma.$transaction(async (tx) => {
      const created = await tx.stockTransfer.create({
        data: {
          transferNumber,
          fromBranchId,
          toBranchId,
          userId: user.id,
          status: "PENDING",
          sentAt: null,
          notes: imeis.length
            ? `IMEIs: ${imeis.join(",")}`
            : String(formData.get("notes") || "") || "Shop to shop transfer",
          items: {
            create: [...qtyByProduct.entries()].map(([productId, quantity]) => ({ productId, quantity })),
          },
        },
      })

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "StockTransfer",
          entityId: created.transferNumber,
          newValue: JSON.stringify({
            fromBranchId,
            toBranchId,
            status: "PENDING",
            imeis,
            items: [...qtyByProduct.entries()],
            note: "Submitted. Stock stays In shop at the sending shop until accept or reject.",
          }),
          branchId: fromBranchId,
        },
      })
      return created
    })
  } catch (error) {
    return { error: shopError(error, "Could not submit this transfer. Nothing left the shop.") }
  }

  const destStaff = await prisma.user.findMany({
    where: { branchId: toBranchId, isActive: true },
  })
  for (const staff of destStaff) {
    await notify(
      staff.id,
      "Shop to shop transfer waiting",
      `${transfer.transferNumber} · accept or reject. Stock is still In shop at the sending shop.`,
      "/transfers",
      "TRANSFER"
    )
  }
  refreshOps()
  return { success: true }
}

export async function receiveTransfer(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.transfer"))) return { error: "You are not allowed to receive goods from another shop. Ask the main admin." }
  const id = String(formData.get("id") || "")
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    include: { items: { include: { product: true } }, toBranch: true, fromBranch: true },
  })
  if (!transfer) return { error: "We could not find that send." }
  if (transfer.status === "RECEIVED") return { error: "This transfer has already been accepted." }
  if (transfer.status === "CANCELLED") return { error: "This transfer was rejected. Nothing to accept." }
  if (!(await canSeeAllBranches(user.role)) && user.branchId && user.branchId !== transfer.toBranchId) {
    return { error: `Only ${transfer.toBranch.name} (or head office) can accept this.` }
  }

  const expected = parseTransferIds(transfer.notes ?? "")
  const confirmed = parseTransferIds(String(formData.get("imeis") || ""))
  if (expected.length) {
    if (confirmed.length !== expected.length || expected.some((imei) => !confirmed.includes(imei))) {
      return { error: "Scan or paste every IMEI on this transfer that actually arrived." }
    }
  }

  const pendingStyle = transfer.status === "PENDING"

  try {
    await prisma.$transaction(async (tx) => {
      const accepted = await tx.stockTransfer.updateMany({
        where: { id, status: { in: ["PENDING", "IN_TRANSIT"] } },
        data: { status: "RECEIVED", receivedAt: new Date(), sentAt: transfer.sentAt ?? new Date() },
      })
      if (accepted.count !== 1) {
        throw new ConflictError(`${transfer.transferNumber} was already closed by someone else. Refresh to see it.`)
      }

      if (expected.length) {
        if (pendingStyle) {
          await claimImeis(tx, {
            imei1s: expected,
            branchId: transfer.fromBranchId,
            from: "IN_STOCK",
            data: { status: "IN_STOCK", branchId: transfer.toBranchId },
          })
        } else {
          const landed = await tx.imeiRecord.updateMany({
            where: { imei1: { in: expected }, status: "TRANSFERRED" },
            data: { status: "IN_STOCK", branchId: transfer.toBranchId },
          })
          if (landed.count !== expected.length) {
            throw new ConflictError(
              `${expected.length - landed.count} of these phones are not showing as sent. Check the list with the sending shop before accepting.`
            )
          }
        }
        for (const imei1 of expected) {
          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: "UPDATE",
              entityType: "IMEIRecord",
              entityId: imei1,
              oldValue: pendingStyle ? "IN_STOCK" : "TRANSFERRED",
              newValue: JSON.stringify({
                status: "IN_STOCK",
                branchId: transfer.toBranchId,
                transfer: transfer.transferNumber,
              }),
              branchId: transfer.toBranchId,
            },
          })
        }
      }

      for (const item of transfer.items) {
        await tx.transferItem.update({
          where: { id: item.id },
          data: { receivedQty: item.quantity },
        })
        if (pendingStyle) {
          await drawStock(tx, {
            productId: item.productId,
            branchId: transfer.fromBranchId,
            quantity: item.quantity,
            label: item.product.name,
          })
        }
        await returnStock(tx, {
          productId: item.productId,
          branchId: transfer.toBranchId,
          quantity: item.quantity,
        })
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          entityType: "StockTransfer",
          entityId: transfer.transferNumber,
          newValue: JSON.stringify({ status: "RECEIVED", imeis: expected }),
          branchId: transfer.toBranchId,
        },
      })
    })
  } catch (error) {
    return { error: shopError(error, "Could not accept this transfer.") }
  }
  refreshOps()
  return { success: true }
}

export async function rejectTransfer(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.transfer"))) {
    return { error: "You are not allowed to reject a shop-to-shop transfer. Ask the main admin." }
  }
  const id = String(formData.get("id") || "")
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    include: { items: { include: { product: true } }, toBranch: true, fromBranch: true },
  })
  if (!transfer) return { error: "We could not find that transfer." }
  if (transfer.status === "RECEIVED") return { error: "This transfer was already accepted." }
  if (transfer.status === "CANCELLED") return { error: "This transfer was already rejected." }
  if (
    !(await canSeeAllBranches(user.role)) &&
    user.branchId &&
    user.branchId !== transfer.toBranchId &&
    user.branchId !== transfer.fromBranchId
  ) {
    return { error: "Only the sending shop, the receiving shop, or head office can reject this." }
  }

  const expected = parseTransferIds(transfer.notes ?? "")
  const wasInTransit = transfer.status === "IN_TRANSIT"

  try {
    await prisma.$transaction(async (tx) => {
      const closed = await tx.stockTransfer.updateMany({
        where: { id, status: { in: ["PENDING", "IN_TRANSIT"] } },
        data: { status: "CANCELLED" },
      })
      if (closed.count !== 1) {
        throw new ConflictError(`${transfer.transferNumber} was already closed. Refresh to see it.`)
      }

      // Legacy in-transit sends had already left the shelf. Put them back.
      if (wasInTransit) {
        if (expected.length) {
          await claimImeis(tx, {
            imei1s: expected,
            branchId: transfer.fromBranchId,
            from: "TRANSFERRED",
            data: { status: "IN_STOCK", branchId: transfer.fromBranchId },
          })
        }
        for (const item of transfer.items) {
          await returnStock(tx, {
            productId: item.productId,
            branchId: transfer.fromBranchId,
            quantity: item.quantity,
          })
        }
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          entityType: "StockTransfer",
          entityId: transfer.transferNumber,
          newValue: JSON.stringify({
            status: "CANCELLED",
            note: wasInTransit
              ? "Rejected. Stock returned to the sending shop."
              : "Rejected. Stock never left the sending shop In shop record.",
          }),
          branchId: user.branchId ?? transfer.toBranchId,
        },
      })
    })
  } catch (error) {
    return { error: shopError(error, "Could not reject this transfer.") }
  }
  refreshOps()
  return { success: true }
}

export async function getSupplierReturnCandidates() {
  const user = await requireUser()
  const branchId = await viewBranchFilter(user)
  const rows = await prisma.imeiRecord.findMany({
    where: {
      status: { in: ["FAULTY", "RETURNED"] },
      ...(branchId ? { branchId } : {}),
    },
    include: { product: true, supplier: true, branch: true },
    orderBy: { updatedAt: "desc" },
    take: 80,
  })
  return rows.map((row) => ({
    id: row.id,
    imei1: row.imei1,
    productName: row.product.name,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? "",
    shop: row.branch.name,
    status: row.status,
  }))
}

const supplierReturnImeiInclude = {
  product: { select: { id: true, name: true, costPrice: true } },
  supplier: { select: { id: true, name: true } },
  branch: { select: { name: true } },
  purchase: {
    include: {
      items: { select: { productId: true, costPrice: true } },
      openingStock: { select: { id: true } },
    },
  },
} as const

type SupplierReturnImei = {
  id: string
  imei1: string
  productId: string
  supplierId: string | null
  branchId: string
  status: string
  notes: string | null
  product: { id: string; name: string; costPrice: unknown }
  supplier: { id: string; name: string } | null
  branch: { name: string }
  purchase: {
    id: string
    invoiceNumber: string
    notes: string | null
    items: Array<{ productId: string; costPrice: unknown }>
    openingStock: { id: string } | null
  } | null
}

async function applySupplierReturnMoney(
  tx: Prisma.TransactionClient,
  record: SupplierReturnImei,
) {
  const plan = supplierReturnMoneyPlan({
    supplierId: record.supplierId,
    productId: record.productId,
    productCost: record.product.costPrice,
    purchase: record.purchase,
  })
  if (!plan.moneyMoves || !record.supplierId) return plan

  if (plan.reason === "bill" && record.purchase) {
    await tx.purchase.update({
      where: { id: record.purchase.id },
      data: { returnedAmount: { increment: plan.cost.toFixed(2) } },
    })
  } else if (plan.reason === "house-credit") {
    await tx.supplier.update({
      where: { id: record.supplierId },
      data: { creditBalance: { increment: plan.cost.toFixed(2) } },
    })
  }
  return plan
}

function toReturnLookup(row: SupplierReturnImei) {
  const plan = supplierReturnMoneyPlan({
    supplierId: row.supplierId,
    productId: row.productId,
    productCost: row.product.costPrice,
    purchase: row.purchase,
  })
  return {
    imei: row.imei1,
    productName: row.product.name,
    supplierId: row.supplierId || "",
    supplierName: row.supplier?.name || "",
    cost: plan.cost,
    invoice: row.purchase?.invoiceNumber || "",
    shop: row.branch.name,
    status: row.status,
    moneyMoves: plan.moneyMoves,
    moneyNote:
      plan.reason === "opening-stock"
        ? "Opening stock. Sending it back does not change what we owe."
        : plan.reason === "no-supplier"
          ? "This phone has no supplier on the record."
          : plan.reason === "no-cost"
            ? "No purchase cost is saved on this phone."
            : "",
  }
}

export async function lookupSupplierReturnImei(imei: string) {
  const user = await requireUser()
  const code = imei.replace(/[\s-]/g, "").trim()
  if (code.length < 14) return { error: "That IMEI is too short. Scan the box again, or type every digit." }

  const row = await prisma.imeiRecord.findUnique({
    where: { imei1: code },
    include: supplierReturnImeiInclude,
  })
  if (!row) return { error: "We could not find that IMEI on the system." }

  const scoped = await scopedBranchId(user.role, user.branchId)
  if (scoped && row.branchId !== scoped) {
    return { error: "You can only send back a phone from your own shop." }
  }
  if (row.status === "RETURNED_TO_SUPPLIER") {
    return { error: `${code} was already sent back to the supplier.` }
  }
  if (!isSupplierReturnableStatus(row.status)) {
    return { error: "You can only send back a phone that is in the shop, returned, or faulty." }
  }
  if (!row.supplierId) {
    return { error: "This IMEI has no supplier on the record. Ask records to attach the house before sending it back." }
  }
  return toReturnLookup(row as SupplierReturnImei)
}

export async function sendUnitsToSupplier(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.intake")) && !(await can(user.role, "action.return"))) {
    return { error: "You are not allowed to send goods back to a supplier. Ask the main admin." }
  }
  const imeis = parseImeis(String(formData.get("imeis") || ""))
  if (!imeis.length) return { error: "Scan the IMEIs going back to the supplier." }

  const records = await prisma.imeiRecord.findMany({
    where: { imei1: { in: imeis } },
    include: supplierReturnImeiInclude,
  })
  if (records.length !== imeis.length) return { error: "We could not find one or more of those IMEIs." }
  if (records.some((row) => !isSupplierReturnableStatus(row.status))) {
    return { error: "You can only send back a phone that is in the shop, returned, or faulty." }
  }
  if (records.some((row) => !row.supplierId)) {
    return { error: "One of these phones has no supplier on the record. The IMEI must already name the house." }
  }
  const houseIds = [...new Set(records.map((row) => row.supplierId).filter(Boolean))]
  if (houseIds.length > 1) {
    return { error: "Scan phones from one supplier only. These IMEIs belong to more than one house." }
  }

  const scoped = await scopedBranchId(user.role, user.branchId)
  if (scoped && records.some((row) => row.branchId !== scoped)) {
    return { error: "You can only send units from your own shop." }
  }

  const rtv = generateDocNumber("RTV")
  const houseName = records[0]?.supplier?.name || "supplier"

  try {
  await prisma.$transaction(async (tx) => {
    for (const record of records) {
      await claimImei(tx, {
        imeiId: record.id,
        branchId: record.branchId,
        label: record.imei1,
        from: record.status,
        data: {
          status: "RETURNED_TO_SUPPLIER",
          customerId: null,
          supplierId: record.supplierId,
          notes: [record.notes, `Sent back to ${houseName} on ${rtv}`].filter(Boolean).join(" · "),
        },
      })
      if (record.status === "IN_STOCK") {
        await drawStock(tx, {
          productId: record.productId,
          branchId: record.branchId,
          quantity: 1,
          label: record.imei1,
        })
      }
      const moneyMove = await applySupplierReturnMoney(tx, record as SupplierReturnImei)
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          entityType: "IMEIRecord",
          entityId: record.imei1,
          oldValue: record.status,
          newValue: JSON.stringify({
            status: "RETURNED_TO_SUPPLIER",
            supplierId: record.supplierId,
            rtv,
            cost: moneyMove.cost,
            moneyMoves: moneyMove.moneyMoves,
            reason: moneyMove.reason,
          }),
          branchId: record.branchId,
        },
      })
    }
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entityType: "VendorReturn",
        entityId: rtv,
        newValue: JSON.stringify({
          supplierId: houseIds[0],
          supplierName: houseName,
          imeis,
          count: imeis.length,
        }),
        branchId: records[0]?.branchId,
      },
    })
  })
  } catch (error) {
    return { error: shopError(error, "Could not send these units back. Nothing was moved.") }
  }

  refreshOps()
  return { success: true }
}
