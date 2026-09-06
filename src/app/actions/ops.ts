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
import { warrantyState } from "@/lib/warranty"

function parseImeis(raw: string) {
  return [...new Set(raw.split(/[\s,;]+/).map((item) => item.trim()).filter((item) => item.length >= 14))]
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

export async function getPurchases() {
  const user = await requireUser()
  const branchId = await scopedBranchId(user.role, user.branchId)
  return prisma.purchase.findMany({
    where: branchId ? { branchId } : undefined,
    include: { supplier: true, branch: true, user: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  })
}

export async function getPurchase(id: string) {
  await requireUser()
  return prisma.purchase.findUnique({
    where: { id },
    include: { supplier: true, branch: true, user: true, items: { include: { product: true } } },
  })
}

export async function createPurchase(formData: FormData) {
  const user = await requireUser()
  const supplierId = String(formData.get("supplierId"))
  const branchId = String(formData.get("branchId") || user.branchId || "")
  const productId = String(formData.get("productId"))
  const quantity = Number(formData.get("quantity") || 0)
  const costPrice = Number(formData.get("costPrice") || 0)
  if (!supplierId || !branchId || !productId || quantity < 1) return { error: "Complete the purchase form." }

  const purchase = await prisma.purchase.create({
    data: {
      invoiceNumber: generateDocNumber("PO"),
      supplierId,
      branchId,
      userId: user.id,
      status: "ORDERED",
      totalAmount: (quantity * costPrice).toFixed(2),
      notes: String(formData.get("notes") || "") || null,
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
    await prisma.$transaction(async (tx) => {
      await tx.purchaseItem.update({
        where: { id: item.id },
        data: { receivedQty: item.quantity },
      })
      await tx.purchase.update({
        where: { id },
        data: { status: "RECEIVED", receivedDate: new Date() },
      })
      await tx.inventory.upsert({
        where: { productId_branchId: { productId: item.productId, branchId: purchase.branchId } },
        update: { quantity: { increment: remaining } },
        create: { productId: item.productId, branchId: purchase.branchId, quantity: remaining },
      })
    })
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

  await prisma.$transaction(async (tx) => {
    for (const imei1 of imeis) {
      await tx.imeiRecord.create({
        data: {
          imei1,
          productId: item.productId,
          supplierId: purchase.supplierId,
          branchId: purchase.branchId,
          status: "IN_STOCK",
          notes: `Received on ${purchase.invoiceNumber}`,
        },
      })
    }
    await tx.purchaseItem.update({
      where: { id: item.id },
      data: { receivedQty },
    })
    await tx.purchase.update({
      where: { id },
      data: {
        status: done ? "RECEIVED" : "PARTIAL_RECEIVED",
        receivedDate: done ? new Date() : purchase.receivedDate,
      },
    })
    await tx.inventory.upsert({
      where: { productId_branchId: { productId: item.productId, branchId: purchase.branchId } },
      update: { quantity: { increment: imeis.length } },
      create: { productId: item.productId, branchId: purchase.branchId, quantity: imeis.length },
    })
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

  await prisma.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id },
      data: {
        paidAmount: (money(purchase.paidAmount) + sent).toFixed(2),
        paymentMethod: method,
      },
    })
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

  refreshOps()
  revalidatePath(`/purchases/${id}`)
  return { success: true }
}

export async function getReturns() {
  const user = await requireUser()
  const branchId = await scopedBranchId(user.role, user.branchId)
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
    if (!cover.active) return { error: cover.label + ". Pick another return reason — do not change the old sale." }
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
    if (record.outcome === "REFUND" || record.outcome === "CREDIT_NOTE") {
      const asked = money(record.refundAmount) || (record.imei ? money(record.imei.product.sellingPrice) : 0)
      const salePaid = sale ? money(sale.paidAmount) : asked
      const saleDue = sale ? Math.max(0, money(sale.totalAmount) - salePaid) : 0
      const cashOut = record.outcome === "REFUND" ? Math.min(asked, salePaid || asked) : 0
      const debtRelief = Math.min(saleDue, asked)
      const next = Math.max(0, money(record.customer.currentBalance) - debtRelief)
      await tx.customer.update({
        where: { id: record.customerId },
        data: { currentBalance: next.toFixed(2) },
      })
      await tx.ledgerEntry.create({
        data: {
          customerId: record.customerId,
          type: record.outcome === "REFUND" ? "REFUND" : "CREDIT_NOTE",
          amount: (-(cashOut || debtRelief || asked)).toFixed(2),
          balance: next.toFixed(2),
          reference: record.returnNumber,
          description: `${record.outcome} — original sale ${sale?.invoiceNumber ?? ""} was not edited`,
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

    if (record.outcome === "REPLACEMENT") {
      const fresh = await tx.imeiRecord.findUnique({ where: { imei1: replacementImei } })
      if (!fresh || fresh.status !== "IN_STOCK") {
        throw new Error("Replacement IMEI must be in stock.")
      }
      await tx.imeiRecord.update({
        where: { id: fresh.id },
        data: { status: "SOLD", customerId: record.customerId, saleId: record.saleId },
      })
      await tx.inventory.update({
        where: { productId_branchId: { productId: fresh.productId, branchId: fresh.branchId } },
        data: { quantity: { decrement: 1 } },
      })
      if (record.imeiId) {
        await tx.imeiRecord.update({
          where: { id: record.imeiId },
          data: { status: record.faultClass === "GOOD_STOCK" ? "IN_STOCK" : "FAULTY", customerId: null, saleId: null },
        })
        if (record.faultClass === "GOOD_STOCK") {
          await tx.inventory.upsert({
            where: { productId_branchId: { productId: record.imei!.productId, branchId: record.branchId } },
            update: { quantity: { increment: 1 } },
            create: { productId: record.imei!.productId, branchId: record.branchId, quantity: 1 },
          })
        }
      }
    }

    if (record.outcome !== "REPLACEMENT" && record.outcome !== "REPAIR" && record.imeiId) {
      await tx.imeiRecord.update({
        where: { id: record.imeiId },
        data: {
          status: record.faultClass === "GOOD_STOCK" ? "IN_STOCK" : record.faultClass === "SCRAP_STOCK" ? "DISPOSED" : "FAULTY",
          customerId: null,
        },
      })
      if (record.faultClass === "GOOD_STOCK") {
        await tx.inventory.upsert({
          where: { productId_branchId: { productId: record.imei!.productId, branchId: record.branchId } },
          update: { quantity: { increment: 1 } },
          create: { productId: record.imei!.productId, branchId: record.branchId, quantity: 1 },
        })
      }
    }

    await tx.stockReturn.update({
      where: { id },
      data: {
        status: "COMPLETED",
        approvedBy: user.id,
        approvedAt: new Date(),
        completedAt: new Date(),
      },
    })
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
    return { error: error instanceof Error ? error.message : "Could not complete return." }
  }

  refreshOps()
  return { success: true }
}

export async function getSwaps() {
  const user = await requireUser()
  const branchId = await scopedBranchId(user.role, user.branchId)
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
  if (!newImei || newImei.status !== "IN_STOCK") return { error: "Selected store device is not available." }
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

  const invoice = await prisma.$transaction(async (tx) => {
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

    await tx.imeiRecord.update({
      where: { id: swap.newImeiId! },
      data: { status: "SOLD", customerId: swap.customerId, saleId: sale.id },
    })
    await tx.imeiRecord.update({
      where: { id: swap.oldImeiId },
      data: { status: "IN_STOCK", customerId: null, notes: `Trade-in from ${swap.customer.name}` },
    })
    await tx.inventory.update({
      where: { productId_branchId: { productId: swap.newProductId, branchId: swap.branchId } },
      data: { quantity: { decrement: 1 } },
    })
    await tx.inventory.upsert({
      where: { productId_branchId: { productId: swap.oldImei.productId, branchId: swap.branchId } },
      update: { quantity: { increment: 1 } },
      create: { productId: swap.oldImei.productId, branchId: swap.branchId, quantity: 1 },
    })

    const due = Math.max(balance - collected, 0)
    if (due > 0) {
      const next = money(swap.customer.currentBalance) + due
      await tx.customer.update({
        where: { id: swap.customerId },
        data: { currentBalance: next.toFixed(2) },
      })
      await tx.ledgerEntry.create({
        data: {
          customerId: swap.customerId,
          type: "SALE",
          amount: due.toFixed(2),
          balance: next.toFixed(2),
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

    await tx.swap.update({
      where: { id },
      data: {
        status: "COMPLETED",
        approvedBy: user.id,
        approvedAt: new Date(),
        completedAt: new Date(),
        notes: [swap.notes, `Invoice ${invoiceNumber}`].filter(Boolean).join(" · "),
      },
    })
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

  refreshOps()
  return { success: true, redirectTo: `/sales/${invoice.id}` }
}

export async function getRepairs() {
  const user = await requireUser()
  const branchId = await scopedBranchId(user.role, user.branchId)
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

  await prisma.$transaction(async (tx) => {
    await tx.repair.update({
      where: { id },
      data: {
        status,
        diagnosis: String(formData.get("diagnosis") || repair.diagnosis || "") || null,
        repairCost: nextCost ? nextCost.toFixed(2) : repair.repairCost,
        completedAt: closing ? new Date() : repair.completedAt,
      },
    })

    if (closing) {
      const shopUnit = !repair.customerId
      await tx.imeiRecord.update({
        where: { id: repair.imeiId },
        data: {
          status: shopUnit && status === "DELIVERED" ? "IN_STOCK" : "REPAIRED",
        },
      })
      if (shopUnit && status === "DELIVERED") {
        await tx.inventory.upsert({
          where: { productId_branchId: { productId: repair.imei.productId, branchId: repair.branchId } },
          update: { quantity: { increment: 1 } },
          create: { productId: repair.imei.productId, branchId: repair.branchId, quantity: 1 },
        })
      }
      if (status === "DELIVERED" && repair.customerId && nextCost > 0 && repair.status !== "DELIVERED") {
        const customer = await tx.customer.findUnique({ where: { id: repair.customerId } })
        const next = money(customer?.currentBalance) + nextCost
        await tx.customer.update({
          where: { id: repair.customerId },
          data: { currentBalance: next.toFixed(2) },
        })
        await tx.ledgerEntry.create({
          data: {
            customerId: repair.customerId,
            type: "SALE",
            amount: nextCost.toFixed(2),
            balance: next.toFixed(2),
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
  refreshOps()
  if (repair.customerId) revalidatePath(`/customers/${repair.customerId}`)
  return { success: true }
}

export async function getTransfers() {
  const user = await requireUser()
  const branchId = await scopedBranchId(user.role, user.branchId)
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
  const serials = rows.flatMap((row) => parseImeis(row.notes ?? ""))
  const records = serials.length
    ? await prisma.imeiRecord.findMany({
        where: { imei1: { in: serials } },
        include: { product: true },
      })
    : []
  return rows.map((row) => ({
    ...row,
    imeis: parseImeis(row.notes ?? "")
      .map((imei1) => records.find((item) => item.imei1 === imei1))
      .filter((item): item is (typeof records)[number] => Boolean(item)),
  }))
}

export async function createTransfer(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.transfer"))) return { error: "You cannot dispatch transfers." }
  const fromBranchId = String(formData.get("fromBranchId"))
  const toBranchId = String(formData.get("toBranchId"))
  const picked = formData.getAll("imei").map(String).filter((item) => item.length >= 14)
  const imeis = [...new Set([...parseImeis(String(formData.get("imeis") || "")), ...picked])]
  let productId = String(formData.get("productId") || "")
  const quantity = imeis.length || Number(formData.get("quantity") || 0)
  if (fromBranchId === toBranchId) return { error: "Choose two different branches." }
  if (quantity < 1) return { error: "Tick IMEIs to move, or enter an accessory quantity." }

  const scoped = await scopedBranchId(user.role, user.branchId)
  if (scoped && fromBranchId !== scoped) return { error: "You can only dispatch from your own branch." }

  let records: Array<{ imei1: string; productId: string; status: string; branchId: string }> = []
  if (imeis.length) {
    records = await prisma.imeiRecord.findMany({ where: { imei1: { in: imeis } } })
    if (records.length !== imeis.length) return { error: "One or more IMEIs were not found." }
    if (records.some((row) => row.status !== "IN_STOCK" || row.branchId !== fromBranchId)) {
      return { error: "Every IMEI must be in stock at the sending branch." }
    }
    const products = new Set(records.map((row) => row.productId))
    if (products.size !== 1) return { error: "Send one phone model at a time. Split mixed phones into two sends." }
    productId = records[0].productId
  }
  if (!productId) return { error: "Choose the product for this transfer." }

  const transfer = await prisma.stockTransfer.create({
    data: {
      transferNumber: generateDocNumber("TRF"),
      fromBranchId,
      toBranchId,
      userId: user.id,
      status: "IN_TRANSIT",
      sentAt: new Date(),
      notes: imeis.length ? `IMEIs: ${imeis.join(",")}` : String(formData.get("notes") || "") || null,
      items: { create: { productId, quantity } },
    },
  })

  await prisma.$transaction(async (tx) => {
    if (imeis.length) {
      await tx.imeiRecord.updateMany({
        where: { imei1: { in: imeis } },
        data: { status: "TRANSFERRED" },
      })
    }
    await tx.inventory.upsert({
      where: { productId_branchId: { productId, branchId: fromBranchId } },
      update: { quantity: { decrement: quantity } },
      create: { productId, branchId: fromBranchId, quantity: 0 },
    })
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entityType: "StockTransfer",
        entityId: transfer.transferNumber,
        newValue: JSON.stringify({ fromBranchId, toBranchId, quantity, imeis }),
        branchId: fromBranchId,
      },
    })
  })

  const destStaff = await prisma.user.findMany({
    where: { branchId: toBranchId, isActive: true },
  })
  for (const staff of destStaff) {
    await notify(staff.id, "Incoming transfer", `${transfer.transferNumber} · confirm IMEIs on arrival`, "/transfers", "TRANSFER")
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

  const expected = parseImeis(transfer.notes ?? "")
  const confirmed = parseImeis(String(formData.get("imeis") || ""))
  if (expected.length) {
    if (confirmed.length !== expected.length || expected.some((imei) => !confirmed.includes(imei))) {
      return { error: "Paste every dispatched IMEI. Destination must confirm the serials that arrived." }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.stockTransfer.update({
      where: { id },
      data: { status: "RECEIVED", receivedAt: new Date() },
    })
    if (expected.length) {
      await tx.imeiRecord.updateMany({
        where: { imei1: { in: expected } },
        data: { status: "IN_STOCK", branchId: transfer.toBranchId },
      })
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
      await tx.inventory.upsert({
        where: { productId_branchId: { productId: item.productId, branchId: transfer.toBranchId } },
        update: { quantity: { increment: item.quantity } },
        create: { productId: item.productId, branchId: transfer.toBranchId, quantity: item.quantity },
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
  refreshOps()
  return { success: true }
}
