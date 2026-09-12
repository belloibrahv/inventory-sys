"use server"

import { PaymentMethod } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { getSellLock } from "@/app/actions/day-close"
import { prisma } from "@/lib/prisma"
import { viewBranchFilter } from "@/lib/branch-scope"
import { shiftCustomerBalance } from "@/lib/concurrency"
import { can } from "@/lib/permissions"
import { scopedBranchId } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { generateDocNumber, money } from "@/lib/utils"
import { shopError } from "@/lib/shop-speak"
import { getAppSettings } from "@/lib/settings"

function refreshNeighbor() {
  for (const path of ["/neighbor-fills", "/sales", "/customers", "/finance", "/profits", "/imei", "/audit"]) {
    revalidatePath(path)
  }
}

async function canRecordNeighbor(role: Parameters<typeof can>[0]) {
  return (await can(role, "action.neighbor")) || (await can(role, "action.sell"))
}

export async function getNeighborFills() {
  const user = await requireUser()
  const branchId = await viewBranchFilter(user)
  const rows = await prisma.neighborFill.findMany({
    where: branchId ? { branchId } : undefined,
    include: {
      branch: true,
      customer: true,
      product: true,
      sale: { select: { id: true, invoiceNumber: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  })
  return rows.map((row) => ({
    id: row.id,
    fillNumber: row.fillNumber,
    neighborName: row.neighborName,
    neighborPhone: row.neighborPhone,
    shop: row.branch.name,
    shopCode: row.branch.code,
    customerName: row.customer.name,
    customerPhone: row.customer.phone,
    productName: row.product.name,
    imei1: row.imei1,
    neighborCost: money(row.neighborCost),
    sellPrice: money(row.sellPrice),
    profit: money(row.profit),
    moneySentToNeighbor: money(row.moneySentToNeighbor),
    status: row.status,
    saleId: row.saleId,
    invoiceNumber: row.sale?.invoiceNumber ?? null,
    notes: row.notes,
    createdAt: row.createdAt,
  }))
}

export async function getNeighborFillLookups() {
  const user = await requireUser()
  const branchId = await scopedBranchId(user.role, user.branchId)
  const [customers, products, branches, neighbors] = await Promise.all([
    prisma.customer.findMany({
      where: branchId ? { branchId } : undefined,
      select: { id: true, name: true, phone: true, branchId: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        tracking: true,
        sellingPrice: true,
        minimumPrice: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.findMany({
      where: { isActive: true, kind: "NEIGHBOR" },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
  ])
  return {
    customers,
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      tracking: product.tracking,
      sellingPrice: money(product.sellingPrice),
      minimumPrice: money(product.minimumPrice),
    })),
    branches,
    neighbors,
    defaultBranchId: branchId ?? user.branchId ?? branches[0]?.id ?? "",
  }
}

export async function createNeighborFill(formData: FormData) {
  const user = await requireUser()
  if (!(await canRecordNeighbor(user.role))) return { error: "You are not allowed to record a buy from next door. Ask the main admin." }

  const branchId = String(formData.get("branchId") || user.branchId || "")
  const customerId = String(formData.get("customerId") || "")
  const productId = String(formData.get("productId") || "")
  const neighborName = String(formData.get("neighborName") || "").trim()
  const neighborPhone = String(formData.get("neighborPhone") || "").trim()
  const supplierId = String(formData.get("supplierId") || "").trim()
  const imei1 = String(formData.get("imei1") || "").replace(/[\s-]/g, "")
  const neighborCost = Number(formData.get("neighborCost") || 0)
  const sellPrice = Number(formData.get("sellPrice") || 0)
  const notes = String(formData.get("notes") || "").trim()

  if (!branchId || !customerId || !productId || !neighborName) {
    return { error: "Pick our shop, the named customer, the item, and the neighboring shop." }
  }
  if (neighborCost < 0 || sellPrice <= 0) return { error: "Enter what the neighbor is owed and what the customer will pay." }
  if (sellPrice < neighborCost) return { error: "You are selling it for less than what we must pay the neighboring shop. Check the numbers again." }

  const scoped = await scopedBranchId(user.role, user.branchId)
  if (scoped && branchId !== scoped) return { error: "You can only record a fill for your own shop." }

  const [customer, product] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.product.findUnique({ where: { id: productId } }),
  ])
  if (!customer) return { error: "Pick a named customer. Do not invent a buyer." }
  if (!product) return { error: "Pick the item the customer wants." }

  const settings = await getAppSettings()
  const canOverrideFloor = settings.allowBelowMinimum || (await can(user.role, "action.override_floor"))
  if (sellPrice < money(product.minimumPrice) && !canOverrideFloor) {
    return { error: `${product.name} is below the lowest allowed price. Raise it, or ask the main admin.` }
  }

  if (product.tracking !== "NONE" && imei1.length < 14) {
    return { error: "Type the IMEI from the neighboring shop. This item is tracked by number." }
  }
  if (imei1.length >= 14) {
    const exists = await prisma.imeiRecord.findFirst({
      where: { OR: [{ imei1 }, { imei2: imei1 }] },
    })
    if (exists) return { error: `IMEI ${imei1} is already on this system. Do not treat our stock as a neighbor fill.` }
  }

  let houseId: string | null = supplierId || null
  if (houseId) {
    const house = await prisma.supplier.findUnique({ where: { id: houseId } })
    if (!house || house.kind !== "NEIGHBOR") return { error: "The name you picked is a supplier, not a neighboring shop." }
  }

  const fill = await prisma.neighborFill.create({
    data: {
      fillNumber: generateDocNumber("NBF"),
      branchId,
      neighborName,
      neighborPhone: neighborPhone || null,
      supplierId: houseId,
      customerId,
      productId,
      imei1: imei1 || null,
      neighborCost: neighborCost.toFixed(2),
      sellPrice: sellPrice.toFixed(2),
      profit: (sellPrice - neighborCost).toFixed(2),
      notes: notes || null,
      userId: user.id,
    },
  })
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CREATE",
      entityType: "NeighborFill",
      entityId: fill.fillNumber,
      newValue: JSON.stringify({ neighborName, customerId, productId, neighborCost, sellPrice }),
      branchId,
    },
  })
  refreshNeighbor()
  return { success: true }
}

export async function sellNeighborFill(formData: FormData) {
  const user = await requireUser()
  if (!(await canRecordNeighbor(user.role))) return { error: "You are not allowed to sell a buy from next door. Ask the main admin." }
  const id = String(formData.get("id") || "")
  const paidAmount = Number(formData.get("paidAmount") || 0)
  const method = (String(formData.get("method") || "CASH") || "CASH") as PaymentMethod
  const fill = await prisma.neighborFill.findUnique({
    where: { id },
    include: { product: true, customer: true },
  })
  if (!fill) return { error: "We could not find that neighbor fill." }
  if (fill.status !== "OPEN") return { error: "This fill is already sold or settled." }

  const lock = await getSellLock(fill.branchId)
  if (lock.locked) return { error: lock.message }

  const sellPrice = money(fill.sellPrice)
  const paid = Math.min(Math.max(0, paidAmount || sellPrice), sellPrice)
  const due = sellPrice - paid
  if (due > 0 && !fill.customerId) return { error: "A credit sale needs a buyer name." }

  const invoiceNumber = generateDocNumber("INV")

  try {
    await prisma.$transaction(async (tx) => {
      let imeiId: string | null = null
      if (fill.imei1) {
        const imei = await tx.imeiRecord.create({
          data: {
            imei1: fill.imei1,
            productId: fill.productId,
            supplierId: fill.supplierId,
            branchId: fill.branchId,
            customerId: fill.customerId,
            status: "SOLD",
            notes: `Neighbor fill ${fill.fillNumber} from ${fill.neighborName}. Not Abu Twins shelf stock.`,
          },
        })
        imeiId = imei.id
      }

      const sale = await tx.sale.create({
        data: {
          invoiceNumber,
          branchId: fill.branchId,
          userId: user.id,
          customerId: fill.customerId,
          saleType: "NEIGHBOR_FILL",
          status: "COMPLETED",
          subtotal: sellPrice.toFixed(2),
          totalAmount: sellPrice.toFixed(2),
          paidAmount: paid.toFixed(2),
          paymentMethod: due > 0 ? "CREDIT" : method,
          notes: `Neighbor fill ${fill.fillNumber} from ${fill.neighborName}. Profit kept ${money(fill.profit)}.`,
          items: {
            create: {
              productId: fill.productId,
              imeiId,
              quantity: 1,
              unitPrice: sellPrice.toFixed(2),
              totalPrice: sellPrice.toFixed(2),
            },
          },
          payments: paid > 0
            ? {
                create: {
                  amount: paid.toFixed(2),
                  method: due > 0 ? "CREDIT" : method,
                  notes: `Neighbor fill ${fill.fillNumber}`,
                },
              }
            : undefined,
        },
      })

      if (imeiId) {
        await tx.imeiRecord.update({
          where: { id: imeiId },
          data: { saleId: sale.id },
        })
      }

      if (paid > 0) {
        await tx.financeEntry.create({
          data: {
            branchId: fill.branchId,
            account: method === "CASH" ? "CASH" : "BANK",
            type: "INCOME",
            amount: paid.toFixed(2),
            reference: invoiceNumber,
            description: `Neighbor fill sold ${fill.fillNumber} · ${fill.customer.name}`,
          },
        })
      }

      if (due > 0) {
        const after = await shiftCustomerBalance(tx, fill.customerId, due)
        await tx.ledgerEntry.create({
          data: {
            customerId: fill.customerId,
            type: "SALE",
            amount: due.toFixed(2),
            balance: money(after.currentBalance).toFixed(2),
            reference: invoiceNumber,
            description: `We still owe the neighboring shop on fill ${fill.fillNumber}`,
          },
        })
      }

      const owedNeighbor = money(fill.neighborCost) - money(fill.moneySentToNeighbor)
      await tx.neighborFill.update({
        where: { id: fill.id },
        data: {
          status: owedNeighbor <= 0 ? "SETTLED" : "SOLD",
          saleId: sale.id,
          imeiId,
          paymentMethod: due > 0 ? "CREDIT" : method,
          soldAt: new Date(),
          settledAt: owedNeighbor <= 0 ? new Date() : null,
        },
      })

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE",
          entityType: "Sale",
          entityId: invoiceNumber,
          newValue: JSON.stringify({ neighborFill: fill.fillNumber, paid, sellPrice }),
          branchId: fill.branchId,
        },
      })
    })
  } catch (error) {
    return { error: shopError(error, "Could not complete this neighbor fill sale.") }
  }

  refreshNeighbor()
  return { success: true }
}

export async function payNeighborFill(formData: FormData) {
  const user = await requireUser()
  if (!(await can(user.role, "action.neighbor")) && !(await can(user.role, "action.finance"))) {
    return { error: "You are not allowed to pay a neighboring shop here. Ask accounts." }
  }
  const id = String(formData.get("id") || "")
  const amount = Number(formData.get("amount") || 0)
  const method = String(formData.get("method") || "CASH")
  if (!id || amount <= 0) return { error: "Enter what you are sending to the neighboring shop." }

  const fill = await prisma.neighborFill.findUnique({ where: { id }, include: { customer: true } })
  if (!fill) return { error: "We could not find that neighbor fill." }
  const due = money(fill.neighborCost) - money(fill.moneySentToNeighbor)
  if (due <= 0) return { error: "This neighboring shop is already paid." }
  const sent = Math.min(amount, due)
  const nextPaid = money(fill.moneySentToNeighbor) + sent
  const settled = fill.status === "SOLD" && nextPaid >= money(fill.neighborCost)
  const payRef = generateDocNumber("NBPAY")

  await prisma.$transaction(async (tx) => {
    await tx.neighborFill.update({
      where: { id },
      data: {
        moneySentToNeighbor: nextPaid.toFixed(2),
        status: settled ? "SETTLED" : fill.status,
        settledAt: settled ? new Date() : fill.settledAt,
      },
    })
    await tx.financeEntry.create({
      data: {
        branchId: fill.branchId,
        account: method === "CASH" ? "CASH" : "BANK",
        type: "EXPENSE",
        amount: sent.toFixed(2),
        reference: payRef,
        description: `We paid ${fill.neighborName} for fill ${fill.fillNumber}. Abu Twins keeps ${money(fill.profit)} as profit.`,
      },
    })
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entityType: "NeighborFill",
        entityId: fill.fillNumber,
        newValue: JSON.stringify({ payRef, sent, method }),
        branchId: fill.branchId,
      },
    })
  })

  refreshNeighbor()
  return { success: true }
}
