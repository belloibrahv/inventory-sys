"use server"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { can } from "@/lib/permissions"
import { canSeeCost } from "@/lib/rbac"
import { viewBranchFilter } from "@/lib/branch-scope"
import { productSpecLine } from "@/lib/product-specs"
import { isOpeningStockPurchase } from "@/lib/purchase-money"
import { money } from "@/lib/utils"

/** Price list or Shop stock: either door opens an item's history. */
async function mayViewItems(role: Awaited<ReturnType<typeof requireUser>>["role"]) {
  return (await can(role, "view.products")) || (await can(role, "view.inventory"))
}

/**
 * Items to open the history of: by name, item code, storage or colour, or by
 * any phone's IMEI or serial, which finds the item that phone belongs to.
 */
export async function searchItemsForActivity(query: string) {
  const user = await requireUser()
  if (!(await mayViewItems(user.role))) return []
  const q = query.trim()
  if (q.length < 2) return []
  const byUnit = await prisma.imeiRecord.findMany({
    where: { OR: [{ imei1: { contains: q } }, { imei2: { contains: q } }, { serialNumber: { contains: q, mode: "insensitive" } }] },
    select: { productId: true },
    take: 20,
  })
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { storage: { contains: q, mode: "insensitive" } },
        { color: { contains: q, mode: "insensitive" } },
        { id: { in: byUnit.map((row) => row.productId) } },
      ],
    },
    select: {
      id: true,
      name: true,
      sku: true,
      storage: true,
      ram: true,
      color: true,
      condition: true,
      isActive: true,
      brand: { select: { name: true } },
      inventory: { select: { quantity: true } },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: 60,
  })
  return products.map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    specs: productSpecLine(row),
    brand: row.brand.name,
    isActive: row.isActive,
    inStock: row.inventory.reduce((sum, inv) => sum + inv.quantity, 0),
  }))
}

/**
 * One item's whole life, for an audit: when it was created, every piece booked
 * in, sold, moved between shops, returned or corrected, the price changes, and
 * where every phone under it is now. Staff tied to one shop see that shop.
 */
export async function getItemActivity(productId: string) {
  const user = await requireUser()
  if (!(await mayViewItems(user.role))) return null
  const branchId = await viewBranchFilter(user)
  const showCost = canSeeCost(user.role)
  const shop = branchId ? { branchId } : {}

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { brand: { select: { name: true } }, category: { select: { name: true } } },
  })
  if (!product) return null

  const [stock, moves, bills, sold, prices, units] = await Promise.all([
    prisma.inventory.findMany({
      where: { productId, ...shop },
      select: { quantity: true, branch: { select: { name: true, code: true } } },
      orderBy: { quantity: "desc" },
    }),
    prisma.stockMovement.findMany({
      where: { productId, ...shop },
      select: {
        id: true,
        kind: true,
        quantity: true,
        reference: true,
        createdAt: true,
        branch: { select: { name: true, code: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 600,
    }),
    prisma.purchaseItem.findMany({
      where: { productId, purchase: { status: { not: "CANCELLED" }, ...(branchId ? { branchId } : {}) } },
      select: {
        id: true,
        quantity: true,
        receivedQty: true,
        costPrice: true,
        createdAt: true,
        purchase: {
          select: {
            id: true,
            invoiceNumber: true,
            notes: true,
            createdAt: true,
            receivedDate: true,
            openingStock: { select: { id: true } },
            supplier: { select: { name: true } },
            branch: { select: { name: true, code: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.saleItem.findMany({
      where: { productId, sale: { status: "COMPLETED", ...(branchId ? { branchId } : {}) } },
      select: {
        id: true,
        quantity: true,
        unitPrice: true,
        totalPrice: true,
        imei: { select: { id: true, imei1: true } },
        sale: {
          select: {
            id: true,
            invoiceNumber: true,
            saleDate: true,
            branch: { select: { name: true, code: true } },
            customer: { select: { name: true } },
            user: { select: { name: true } },
          },
        },
      },
      orderBy: { sale: { saleDate: "desc" } },
      take: 600,
    }),
    prisma.priceHistory.findMany({
      where: { productId, ...(showCost ? {} : { priceType: { not: "COST_PRICE" } }) },
      orderBy: { changedAt: "desc" },
      take: 60,
    }),
    prisma.imeiRecord.findMany({
      where: { productId, ...shop },
      select: {
        id: true,
        imei1: true,
        serialNumber: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        branch: { select: { code: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 600,
    }),
  ])

  const changers = await prisma.user.findMany({
    where: { id: { in: [...new Set(prices.map((row) => row.changedBy))] } },
    select: { id: true, name: true },
  })
  const changerName = new Map(changers.map((row) => [row.id, row.name]))

  const bookedIn = bills.reduce((sum, row) => sum + (row.receivedQty || row.quantity), 0)
  const soldQty = sold.reduce((sum, row) => sum + row.quantity, 0)
  const returnedIn = moves.filter((row) => row.kind === "RETURN_IN").reduce((sum, row) => sum + row.quantity, 0)
  const inStock = stock.reduce((sum, row) => sum + row.quantity, 0)
  const unitsByStatus = units.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1
    return acc
  }, {})

  return {
    scope: branchId ? stock[0]?.branch.name ?? "this shop" : "every shop",
    showCost,
    product: {
      id: product.id,
      name: product.name,
      sku: product.sku,
      specs: productSpecLine(product),
      brand: product.brand.name,
      category: product.category.name,
      tracking: product.tracking,
      isActive: product.isActive,
      createdAt: product.createdAt,
      sellingPrice: money(product.sellingPrice),
      minimumPrice: money(product.minimumPrice),
      costPrice: showCost ? money(product.costPrice) : null,
    },
    summary: {
      bookedIn,
      sold: soldQty,
      returnedIn,
      inStock,
      lastSold: sold[0]?.sale.saleDate ?? null,
      lastBookedIn: bills[0] ? bills[0].purchase.receivedDate ?? bills[0].purchase.createdAt : null,
      unitsByStatus,
    },
    stock: stock.map((row) => ({ shop: row.branch.name, code: row.branch.code, quantity: row.quantity })),
    moves: moves.map((row) => ({
      id: row.id,
      kind: row.kind,
      quantity: row.quantity,
      reference: row.reference,
      when: row.createdAt,
      shop: row.branch.code,
      by: row.user?.name ?? "System",
    })),
    bills: bills.map((row) => ({
      id: row.id,
      purchaseId: row.purchase.id,
      invoice: row.purchase.invoiceNumber,
      opening: isOpeningStockPurchase(row.purchase),
      supplier: row.purchase.supplier?.name ?? "-",
      shop: row.purchase.branch.code,
      quantity: row.receivedQty || row.quantity,
      cost: showCost ? money(row.costPrice) : null,
      when: row.purchase.receivedDate ?? row.purchase.createdAt,
    })),
    sales: sold.map((row) => ({
      id: row.id,
      saleId: row.sale.id,
      invoice: row.sale.invoiceNumber,
      when: row.sale.saleDate,
      shop: row.sale.branch.code,
      customer: row.sale.customer?.name ?? "Walk-in",
      seller: row.sale.user?.name ?? "",
      quantity: row.quantity,
      unitPrice: money(row.unitPrice),
      total: money(row.totalPrice),
      imei: row.imei ? { id: row.imei.id, imei1: row.imei.imei1 } : null,
    })),
    prices: prices.map((row) => ({
      id: row.id,
      type: row.priceType,
      from: money(row.oldPrice),
      to: money(row.newPrice),
      reason: row.reason,
      by: changerName.get(row.changedBy) ?? "",
      when: row.changedAt,
    })),
    units: units.map((row) => ({
      id: row.id,
      imei1: row.imei1,
      serial: row.serialNumber,
      status: row.status,
      shop: row.branch.code,
      booked: row.createdAt,
      changed: row.updatedAt,
    })),
  }
}
