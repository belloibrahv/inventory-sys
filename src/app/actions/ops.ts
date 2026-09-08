"use server"

import { revalidatePath } from "next/cache"
import {
  FaultClass,
  PaymentMethod,
  ProductCondition,
  RepairStatus,
  ReturnOutcome,
  ReturnReason,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { canApprove, canManageFinance, canSeeAllBranches, scopedBranchId } from "@/lib/rbac"
import { can } from "@/lib/permissions"
import { generateDocNumber, money } from "@/lib/utils"
import { shopError } from "@/lib/shop-speak"
import { canReachBranch, viewBranchFilter } from "@/lib/branch-scope"
import { ConflictError, claimImei, claimImeis, drawStock, returnStock, shiftCustomerBalance } from "@/lib/concurrency"
import { warrantyState } from "@/lib/warranty"
import { cell, readTableFile } from "@/lib/table-file"
import { buildBillTrace, type SupplierBillTrace } from "@/lib/supplier-trace"
import { watBounds, watDayKey } from "@/lib/lagos-day"

function parseImeis(raw: string) {
  return [...new Set(raw.split(/[\s,;]+/).map((item) => item.trim()).filter((item) => item.length >= 14))]
}

function parseTransferIds(raw: string) {
  const match = raw.match(/IMEIs:\s*(.+)/i)
  const list = match ? match[1] : raw
  return [...new Set(list.split(/[\s,;]+/).map((item) => item.trim()).filter((item) => item.length >= 4 && !item.includes(":")))]
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
  const branchId = String(formData.get("branchId") || user.branchId || "")
  const productId = String(formData.get("productId"))
  const quantity = Number(formData.get("quantity") || 0)
  const costPrice = Number(formData.get("costPrice") || 0)
  if (!supplierId || !branchId || !productId || quantity < 1) return { error: "Complete the expected-goods form." }

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier) return { error: "Pick a supplier from the list." }
  if (supplier.kind === "NEIGHBOR") {
    return { error: "A neighboring shop is not a supplier carton. Use Neighbor shop fill." }
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
  if (!(await can(user.role, "action.intake"))) return { error: "You cannot receive purchases." }
  const id = String(formData.get("id"))
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { items: { include: { product: true } }, supplier: true },
  })
  if (!purchase) return { error: "Purchase not found." }
  if (purchase.status === "RECEIVED") return { error: "This shipment is already closed." }

  const item = purchase.items[0]
  if (!item) return { error: "Purchase has no lines." }

  const imeis = parseImeis(String(formData.get("imeis") || ""))
  const remaining = item.quantity - item.receivedQty

  if (imeis.length === 0) {
    if (remaining < 1) return { error: "Nothing left to receive." }
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
        newValue: JSON.stringify({ imeis, receivedQty, status: done ? "RECEIVED" : "PARTIAL_RECEIVED" }),
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
  return { success: true }
}

export async function payPurchase(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageFinance(user.role))) return { error: "You cannot pay suppliers." }
  const id = String(formData.get("id") || "")
  const amount = Number(formData.get("amount") || 0)
  const method = String(formData.get("method") || "TRANSFER")
  if (!id || amount <= 0) return { error: "Enter the amount sent to the supplier." }

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { supplier: true },
  })
  if (!purchase) return { error: "Purchase not found." }
  const due = money(purchase.totalAmount) - money(purchase.paidAmount)
  if (due <= 0) return { error: "This supplier invoice is already settled." }
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
      select: { paidAmount: true, totalAmount: true, invoiceNumber: true },
    })
    if (money(paid.paidAmount) > money(paid.totalAmount) + 0.005) {
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
    take: 80,
  })
}

export async function createReturn(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.return"))) return { error: "You cannot log returns." }
  const imei1 = String(formData.get("imei1") ?? "").trim()
  const imei = await prisma.imeiRecord.findUnique({
    where: { imei1 },
    include: { sale: { include: { items: true } }, customer: true, product: true },
  })
  if (!imei || imei.status !== "SOLD") return { error: "That IMEI is not on a completed sale." }
  if (!imei.customerId) return { error: "This sale has no customer name. Add the buyer before returning." }
  const open = await prisma.stockReturn.findFirst({
    where: { imeiId: imei.id, status: { in: ["PENDING", "APPROVED"] } },
  })
  if (open) return { error: `${imei1} already has an open return.` }

  const reason = String(formData.get("reason")) as ReturnReason
  if (reason === "WARRANTY") {
    const cover = warrantyState(imei.sale?.saleDate, imei.product.warrantyDays)
    if (!cover.active) return { error: cover.label + ". Pick another return reason. Do not change the old sale." }
  }

  const line = imei.sale?.items.find((item) => item.imeiId === imei.id)
  const asked = formData.get("refundAmount") ? Number(formData.get("refundAmount")) : 0

  const record = await prisma.stockReturn.create({
    data: {
      returnNumber: generateDocNumber("RTN"),
      customerId: imei.customerId!,
      saleId: imei.saleId,
      imeiId: imei.id,
      branchId: imei.branchId,
      userId: user.id,
      reason,
      outcome: String(formData.get("outcome")) as ReturnOutcome,
      faultClass: String(formData.get("faultClass") || "FAULTY_STOCK") as FaultClass,
      notes: String(formData.get("notes") || "") || null,
      supplierId: imei.supplierId,
      refundAmount: (asked > 0 ? asked : money(line?.totalPrice) || money(imei.product.sellingPrice)).toFixed(2),
    },
  })
  await prisma.imeiRecord.update({ where: { id: imei.id }, data: { status: "RETURNED" } })
  await prisma.approval.create({
    data: {
      type: "RETURN",
      entityId: record.id,
      entityType: "Return",
      requestedBy: user.id,
      reason: `${record.returnNumber}: ${record.reason}`,
    },
  })
  const managers = await prisma.user.findMany({
    where: { role: { in: ["CEO", "BRANCH_MANAGER", "AUDITOR"] }, isActive: true },
  })
  for (const manager of managers) {
    await notify(manager.id, "Return needs approval", `${record.returnNumber} for IMEI ${imei1}`, "/approvals", "APPROVAL_REQUEST")
  }
  refreshOps()
  return { success: true }
}

export async function completeReturn(formData: FormData) {
  const user = await requireUser()
  const id = String(formData.get("id"))
  const record = await prisma.stockReturn.findUnique({
    where: { id },
    include: { customer: true, imei: { include: { product: true } } },
  })
  if (!record) return { error: "Return not found." }
  if (record.status === "COMPLETED") return { error: "Return already closed." }
  if (record.status !== "APPROVED" && !(await canApprove(user.role))) {
    return { error: "This return still needs approval." }
  }
  const sale = record.saleId
    ? await prisma.sale.findUnique({ where: { id: record.saleId } })
    : null

  const replacementImei = String(formData.get("replacementImei") || "").trim()
  if (record.outcome === "REPLACEMENT" && replacementImei.length < 14) {
    return { error: "Enter the replacement IMEI from stock." }
  }

  try {
  await prisma.$transaction(async (tx) => {
    // Close the return before any money or stock moves. Two clicks on Complete
    // used to pay the refund twice and put the phone back on the shelf twice,
    // because both reads saw the return still open.
    const sealed = await tx.stockReturn.updateMany({
      where: { id, status: { not: "COMPLETED" } },
      data: {
        status: "COMPLETED",
        approvedBy: user.id,
        approvedAt: new Date(),
        completedAt: new Date(),
        sentToSupplierAt: record.outcome === "SEND_TO_SUPPLIER" ? new Date() : record.sentToSupplierAt,
        supplierId: record.supplierId || record.imei?.supplierId || null,
      },
    })
    if (sealed.count !== 1) {
      throw new ConflictError(`${record.returnNumber} was already completed by someone else. Refresh to see it.`)
    }

    if (record.outcome === "REFUND" || record.outcome === "CREDIT_NOTE") {
      const asked = money(record.refundAmount) || (record.imei ? money(record.imei.product.sellingPrice) : 0)
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

    if (record.outcome === "SEND_TO_SUPPLIER" && record.imeiId) {
      await tx.imeiRecord.update({
        where: { id: record.imeiId },
        data: {
          status: "RETURNED_TO_SUPPLIER",
          customerId: null,
          notes: [record.imei?.notes, `Sent back to supplier on ${record.returnNumber}`].filter(Boolean).join(" · "),
        },
      })
    }

    if (record.outcome === "REPLACEMENT") {
      const fresh = await tx.imeiRecord.findUnique({ where: { imei1: replacementImei } })
      if (!fresh || fresh.status !== "IN_STOCK") {
        throw new ConflictError("Replacement IMEI must be in stock.")
      }
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
        label: replacementImei,
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
        newValue: JSON.stringify({ outcome: record.outcome, faultClass: record.faultClass }),
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
  if (!(await can(user.role, "action.swap"))) return { error: "You cannot log swaps." }
  const customerId = String(formData.get("customerId"))
  const oldImei1 = String(formData.get("oldImei1") ?? "").trim()
  const newImeiId = String(formData.get("newImeiId"))
  const oldProductId = String(formData.get("oldProductId") || "")
  const tradeValue = Number(formData.get("tradeValue") || 0)
  const condition = String(formData.get("oldDeviceCondition")) as ProductCondition
  const branchId = String(formData.get("branchId") || user.branchId || "")

  if (oldImei1.length < 14) return { error: "Enter the customer device IMEI." }
  const exists = await prisma.imeiRecord.findFirst({ where: { OR: [{ imei1: oldImei1 }, { imei2: oldImei1 }] } })
  if (exists) return { error: "That incoming IMEI is already in the shop." }

  const newImei = await prisma.imeiRecord.findUnique({
    where: { id: newImeiId },
    include: { product: true },
  })
  if (!newImei || newImei.status !== "IN_STOCK") return { error: "That phone is not In shop." }
  if (newImei.branchId !== branchId) return { error: "That IMEI is not in the selected shop." }

  const incoming = await prisma.imeiRecord.create({
    data: {
      imei1: oldImei1,
      productId: oldProductId || newImei.productId,
      branchId,
      customerId,
      status: "RECEIVED",
      notes: `Trade-in pending · ${condition} · value ${tradeValue}`,
    },
  })

  const balance = money(newImei.product.sellingPrice) - tradeValue
  const swap = await prisma.swap.create({
    data: {
      swapNumber: generateDocNumber("SWP"),
      customerId,
      oldImeiId: incoming.id,
      oldDeviceCondition: condition,
      tradeValue: tradeValue.toFixed(2),
      newProductId: newImei.productId,
      newProductPrice: newImei.product.sellingPrice,
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
      reason: `${swap.swapNumber}: trade-in ₦${tradeValue} vs ${newImei.product.name}`,
    },
  })
  const managers = await prisma.user.findMany({
    where: { role: { in: ["CEO", "BRANCH_MANAGER"] }, isActive: true },
  })
  for (const manager of managers) {
    await notify(manager.id, "Swap needs valuation approval", swap.swapNumber, "/approvals", "APPROVAL_REQUEST")
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
    include: { customer: true, newProduct: true, oldImei: true },
  })
  if (!swap || !swap.newImeiId) return { error: "Swap not found." }
  if (swap.status === "COMPLETED") return { error: "Swap already completed." }
  if (swap.status !== "APPROVED" && !(await canApprove(user.role))) {
    return { error: "Wait for trade-in approval before collecting the difference." }
  }

  const invoiceNumber = generateDocNumber("INV")
  const balance = money(swap.balanceAmount)
  const collected = Math.min(paid, Math.max(balance, 0))

  let invoice: { id: string }
  try {
  invoice = await prisma.$transaction(async (tx) => {
    // Seal the swap first. Without this, two clicks on Complete raised two
    // invoices and sold the same replacement phone twice.
    const sealed = await tx.swap.updateMany({
      where: { id, status: { not: "COMPLETED" } },
      data: {
        status: "COMPLETED",
        approvedBy: user.id,
        approvedAt: new Date(),
        completedAt: new Date(),
        notes: [swap.notes, `Invoice ${invoiceNumber}`].filter(Boolean).join(" · "),
      },
    })
    if (sealed.count !== 1) {
      throw new ConflictError(`${swap.swapNumber} was already completed by someone else. Refresh to see it.`)
    }

    const sale = await tx.sale.create({
      data: {
        invoiceNumber,
        branchId: swap.branchId,
        userId: user.id,
        customerId: swap.customerId,
        saleType: "RETAIL",
        status: "COMPLETED",
        subtotal: Math.max(balance, 0).toFixed(2),
        discount: money(swap.tradeValue).toFixed(2),
        totalAmount: Math.max(balance, 0).toFixed(2),
        paidAmount: collected.toFixed(2),
        paymentMethod: collected < balance ? "CREDIT" : method,
        notes: `Swap ${swap.swapNumber}`,
        items: {
          create: {
            productId: swap.newProductId,
            imeiId: swap.newImeiId,
            quantity: 1,
            unitPrice: money(swap.newProductPrice).toFixed(2),
            discount: money(swap.tradeValue).toFixed(2),
            totalPrice: Math.max(balance, 0).toFixed(2),
          },
        },
        payments:
          collected > 0
            ? { create: { amount: collected.toFixed(2), method } }
            : undefined,
      },
    })

    await claimImei(tx, {
      imeiId: swap.newImeiId!,
      branchId: swap.branchId,
      label: "The replacement phone",
      data: { status: "SOLD", customerId: swap.customerId, saleId: sale.id },
    })
    await tx.imeiRecord.update({
      where: { id: swap.oldImeiId },
      data: { status: "IN_STOCK", customerId: null, notes: `Trade-in from ${swap.customer.name}` },
    })
    await drawStock(tx, {
      productId: swap.newProductId,
      branchId: swap.branchId,
      quantity: 1,
      label: swap.newProduct.name,
    })
    await returnStock(tx, { productId: swap.oldImei.productId, branchId: swap.branchId, quantity: 1 })

    const due = Math.max(balance - collected, 0)
    if (due > 0) {
      const after = await shiftCustomerBalance(tx, swap.customerId, due)
      await tx.ledgerEntry.create({
        data: {
          customerId: swap.customerId,
          type: "SALE",
          amount: due.toFixed(2),
          balance: money(after.currentBalance).toFixed(2),
          reference: invoiceNumber,
          description: `Swap difference ${swap.swapNumber}`,
        },
      })
    }
    if (collected > 0) {
      await tx.financeEntry.create({
        data: {
          branchId: swap.branchId,
          account: method === "CASH" ? "CASH" : "BANK",
          type: "INCOME",
          amount: collected.toFixed(2),
          reference: invoiceNumber,
          description: `Swap difference ${swap.swapNumber}`,
        },
      })
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "Swap",
        entityId: swap.swapNumber,
        newValue: JSON.stringify({ invoiceNumber, collected, balance }),
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
  if (!(await can(user.role, "action.repair"))) return { error: "You cannot open repairs." }
  const imei1 = String(formData.get("imei1") ?? "").trim()
  const imei = await prisma.imeiRecord.findUnique({ where: { imei1 } })
  if (!imei) return { error: "IMEI not found." }
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
  if (!repair) return { error: "Repair not found." }

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
  if (!(await can(user.role, "action.transfer"))) return { error: "You cannot send goods between our shops." }
  const fromBranchId = String(formData.get("fromBranchId") || "")
  const toBranchId = String(formData.get("toBranchId") || "")
  if (!fromBranchId || !toBranchId) return { error: "Pick the sending shop and the receiving shop." }
  if (fromBranchId === toBranchId) return { error: "Choose two different Abu Twins shops." }

  const scoped = await scopedBranchId(user.role, user.branchId)
  if (scoped && fromBranchId !== scoped) return { error: "You can only send from your own shop." }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the CSV file of goods leaving this shop." }
  if (file.size > 2_000_000) return { error: "That file is too big. Use a file under 2 MB." }

  let rows: Record<string, string>[]
  try {
    rows = await readTableFile(file)
  } catch {
    return { error: "We could not read that file. Save it as CSV or Excel and try again." }
  }
  if (!rows.length) return { error: "The file has no rows under the header line." }
  if (rows.length > 200) return { error: "Send up to 200 lines at a time." }

  const products = await prisma.product.findMany({ where: { isActive: true } })
  const bySku = new Map(products.map((row) => [row.sku.toLowerCase(), row]))
  const byName = new Map<string, typeof products>()
  for (const product of products) {
    const key = product.name.toLowerCase()
    const list = byName.get(key) ?? []
    list.push(product)
    byName.set(key, list)
  }

  // One read for every code on the sheet. This loop used to fire a query per
  // line, so a 200 line transfer meant 200 round trips before anything moved.
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

  type PhoneLine = { imei1: string; productId: string; color: string; extra: string }
  const phones: PhoneLine[] = []
  const accessoryQty = new Map<string, number>()
  const seen = new Set<string>()
  const errors: string[] = []

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
      (name && (byName.get(name.toLowerCase())?.length === 1) ? byName.get(name.toLowerCase())![0] : undefined)
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

  if (errors.length) return { error: errors[0], errors }
  if (!phones.length && accessoryQty.size === 0) {
    return { error: "The file has no phones or accessories to send." }
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
  const transferNumber = generateDocNumber("TRF")

  // The transfer record used to be written before the stock moved. When the
  // stock write then failed, the shop was left with a transfer showing goods in
  // transit that had never left the shelf. Both now stand or fall together.
  let transfer: { transferNumber: string }
  try {
    transfer = await prisma.$transaction(async (tx) => {
      const created = await tx.stockTransfer.create({
        data: {
          transferNumber,
          fromBranchId,
          toBranchId,
          userId: user.id,
          status: "IN_TRANSIT",
          sentAt: new Date(),
          notes: imeis.length ? `IMEIs: ${imeis.join(",")}` : String(formData.get("notes") || "") || `CSV ${file.name}`,
          items: {
            create: [...qtyByProduct.entries()].map(([productId, quantity]) => ({ productId, quantity })),
          },
        },
      })

      // Every phone on the list must still be In shop here. If one was sold
      // while the sheet was being prepared, the whole send is refused rather
      // than silently shipping a phone the shop no longer holds.
      await claimImeis(tx, { imei1s: imeis, branchId: fromBranchId, data: { status: "TRANSFERRED" } })

      for (const phone of phones) {
        if (!phone.color && !phone.extra) continue
        const current = await tx.imeiRecord.findUnique({
          where: { imei1: phone.imei1 },
          select: { notes: true },
        })
        await tx.imeiRecord.update({
          where: { imei1: phone.imei1 },
          data: {
            notes: [current?.notes, phone.color ? `Color ${phone.color}` : "", phone.extra].filter(Boolean).join(" · "),
          },
        })
      }

      for (const [productId, quantity] of qtyByProduct) {
        await drawStock(tx, {
          productId,
          branchId: fromBranchId,
          quantity,
          label: products.find((row) => row.id === productId)?.name ?? "This item",
        })
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "StockTransfer",
          entityId: created.transferNumber,
          newValue: JSON.stringify({ fromBranchId, toBranchId, file: file.name, imeis, items: [...qtyByProduct.entries()] }),
          branchId: fromBranchId,
        },
      })
      return created
    })
  } catch (error) {
    return { error: shopError(error, "Could not send these goods. Nothing left the shop.") }
  }

  const destStaff = await prisma.user.findMany({
    where: { branchId: toBranchId, isActive: true },
  })
  for (const staff of destStaff) {
    await notify(staff.id, "Shop to shop send", `${transfer.transferNumber} · confirm IMEIs on arrival`, "/transfers", "TRANSFER")
  }
  refreshOps()
  return { success: true }
}

export async function receiveTransfer(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.transfer"))) return { error: "You cannot receive transfers." }
  const id = String(formData.get("id") || "")
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    include: { items: true, toBranch: true },
  })
  if (!transfer) return { error: "Transfer not found." }
  if (transfer.status === "RECEIVED") return { error: "Already received." }
  if (!(await canSeeAllBranches(user.role)) && user.branchId && user.branchId !== transfer.toBranchId) {
    return { error: `Only ${transfer.toBranch.name} (or head office) can receive this.` }
  }

  const expected = parseTransferIds(transfer.notes ?? "")
  const confirmed = parseTransferIds(String(formData.get("imeis") || ""))
  if (expected.length) {
    if (confirmed.length !== expected.length || expected.some((imei) => !confirmed.includes(imei))) {
      return { error: "Scan or paste every IMEI from the list that actually arrived." }
    }
  }

  try {
  await prisma.$transaction(async (tx) => {
    // Mark it received first and only from In transit. Two people confirming
    // the same delivery used to add the goods to the shelf twice.
    const received = await tx.stockTransfer.updateMany({
      where: { id, status: { not: "RECEIVED" } },
      data: { status: "RECEIVED", receivedAt: new Date() },
    })
    if (received.count !== 1) {
      throw new ConflictError(`${transfer.transferNumber} was already received by someone else. Refresh to see it.`)
    }
    if (expected.length) {
      const landed = await tx.imeiRecord.updateMany({
        where: { imei1: { in: expected }, status: "TRANSFERRED" },
        data: { status: "IN_STOCK", branchId: transfer.toBranchId },
      })
      if (landed.count !== expected.length) {
        throw new ConflictError(
          `${expected.length - landed.count} of these phones are not showing as sent. Check the list with the sending shop before receiving.`
        )
      }
      for (const imei1 of expected) {
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "UPDATE",
            entityType: "IMEIRecord",
            entityId: imei1,
            oldValue: "TRANSFERRED",
            newValue: JSON.stringify({ status: "IN_STOCK", branchId: transfer.toBranchId, transfer: transfer.transferNumber }),
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
    return { error: shopError(error, "Could not receive this transfer.") }
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

export async function sendUnitsToSupplier(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.intake")) && !(await can(user.role, "action.return"))) {
    return { error: "You cannot send goods back to a supplier." }
  }
  const supplierId = String(formData.get("supplierId") || "").trim()
  const imeis = parseImeis(String(formData.get("imeis") || ""))
  if (!imeis.length) return { error: "Scan or paste the IMEIs going back to the supplier." }

  const records = await prisma.imeiRecord.findMany({
    where: { imei1: { in: imeis } },
    include: { product: true, supplier: true },
  })
  if (records.length !== imeis.length) return { error: "One or more IMEIs were not found." }
  if (records.some((row) => !["FAULTY", "RETURNED", "IN_STOCK"].includes(row.status))) {
    return { error: "Only in-shop, returned, or faulty units can go back to a supplier." }
  }

  const scoped = await scopedBranchId(user.role, user.branchId)
  if (scoped && records.some((row) => row.branchId !== scoped)) {
    return { error: "You can only send units from your own shop." }
  }

  try {
  await prisma.$transaction(async (tx) => {
    for (const record of records) {
      const houseId = supplierId || record.supplierId
      // Claim from the state this screen was showing. A unit sold between the
      // list loading and Send being pressed is now refused, not shipped away
      // from under the customer who just bought it.
      await claimImei(tx, {
        imeiId: record.id,
        branchId: record.branchId,
        label: record.imei1,
        from: record.status,
        data: {
          status: "RETURNED_TO_SUPPLIER",
          customerId: null,
          supplierId: houseId || record.supplierId,
          notes: [record.notes, "Sent back to supplier"].filter(Boolean).join(" · "),
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
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          entityType: "IMEIRecord",
          entityId: record.imei1,
          oldValue: record.status,
          newValue: JSON.stringify({ status: "RETURNED_TO_SUPPLIER", supplierId: houseId || record.supplierId }),
          branchId: record.branchId,
        },
      })
    }
  })
  } catch (error) {
    return { error: shopError(error, "Could not send these units back. Nothing was moved.") }
  }

  refreshOps()
  return { success: true }
}
