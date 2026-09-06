"use server"

import { revalidatePath } from "next/cache"
import { ProductCondition, ProductTracking } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { canManageCatalog } from "@/lib/rbac"
import { can } from "@/lib/permissions"

export async function getProductLookups() {
  await requireUser()
  const [brands, categories, branches] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ])
  return { brands, categories, branches }
}

export async function getProducts(search?: string) {
  await requireUser()
  return prisma.product.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search } },
            { sku: { contains: search } },
          ],
        }
      : undefined,
    include: {
      brand: true,
      category: true,
      inventory: { include: { branch: true } },
      _count: { select: { imeiRecords: true } },
    },
    orderBy: { updatedAt: "desc" },
  })
}

export async function createProduct(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) return { error: "You cannot add or change phones and items." }

  const sku = String(formData.get("sku") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  if (!sku || !name) return { error: "Item code and name are required." }

  const existing = await prisma.product.findUnique({ where: { sku } })
  if (existing) return { error: "That item code already exists." }

  const costPrice = Number(formData.get("costPrice") || 0)
  const sellingPrice = Number(formData.get("sellingPrice") || 0)
  const minimumPrice = Number(formData.get("minimumPrice") || sellingPrice)

  const product = await prisma.product.create({
    data: {
      sku,
      name,
      description: String(formData.get("description") || "") || null,
      brandId: String(formData.get("brandId")),
      categoryId: String(formData.get("categoryId")),
      condition: String(formData.get("condition")) as ProductCondition,
      color: String(formData.get("color") || "") || null,
      storage: String(formData.get("storage") || "") || null,
      ram: String(formData.get("ram") || "") || null,
      costPrice: costPrice.toFixed(2),
      minimumPrice: minimumPrice.toFixed(2),
      sellingPrice: sellingPrice.toFixed(2),
      marketPrice: formData.get("marketPrice") ? Number(formData.get("marketPrice")).toFixed(2) : null,
      warrantyDays: Number(formData.get("warrantyDays") || 365) || 365,
      tracking: (String(formData.get("tracking") || "IMEI") as ProductTracking),
    },
  })

  const branches = await prisma.branch.findMany({ where: { isActive: true } })
  await prisma.inventory.createMany({
    data: branches.map((branch) => ({
      productId: product.id,
      branchId: branch.id,
      quantity: 0,
    })),
  })

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CREATE",
      entityType: "Product",
      entityId: product.id,
      newValue: JSON.stringify({ sku, sellingPrice }),
      branchId: user.branchId,
    },
  })

  revalidatePath("/products")
  return { success: true }
}

export async function updateProductPrice(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) return { error: "You cannot change prices." }

  const id = String(formData.get("id"))
  const sellingPrice = Number(formData.get("sellingPrice"))
  const reason = String(formData.get("reason") || "Manual update")
  const product = await prisma.product.findUnique({ where: { id } })
  if (!product) return { error: "Product not found." }
  if (sellingPrice < Number(product.minimumPrice) && !(await can(user.role, "action.override_floor"))) {
    return { error: "Selling price is below the lowest allowed. Ask Super Admin." }
  }

  await prisma.product.update({
    where: { id },
    data: { sellingPrice: sellingPrice.toFixed(2) },
  })
  await prisma.priceHistory.create({
    data: {
      productId: id,
      oldPrice: product.sellingPrice,
      newPrice: sellingPrice.toFixed(2),
      priceType: "SELLING_PRICE",
      reason,
      changedBy: user.id,
    },
  })
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      entityType: "Product",
      entityId: id,
      oldValue: String(product.sellingPrice),
      newValue: String(sellingPrice),
      branchId: user.branchId,
    },
  })
  revalidatePath("/products")
  return { success: true }
}

export async function updateProductWarranty(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) return { error: "You cannot add or change phones and items." }
  const id = String(formData.get("id") || "")
  const warrantyDays = Number(formData.get("warrantyDays") || 0)
  if (!id || warrantyDays <= 0) return { error: "Enter warranty days for a product." }
  const product = await prisma.product.findUnique({ where: { id } })
  if (!product) return { error: "Product not found." }
  await prisma.product.update({ where: { id }, data: { warrantyDays } })
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      entityType: "Product",
      entityId: id,
      oldValue: String(product.warrantyDays),
      newValue: String(warrantyDays),
      branchId: user.branchId,
    },
  })
  revalidatePath("/products")
  revalidatePath("/imei")
  revalidatePath("/sales")
  return { success: true }
}

export async function bulkAdjustPrices(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) {
    return { error: "Insufficient permissions." }
  }

  const mode = String(formData.get("mode"))
  const amount = Number(formData.get("amount") || 0)
  const brandId = String(formData.get("brandId") || "")
  const condition = String(formData.get("condition") || "")

  const products = await prisma.product.findMany({
    where: {
      ...(brandId ? { brandId } : {}),
      ...(condition ? { condition: condition as ProductCondition } : {}),
    },
  })

  for (const product of products) {
    const current = Number(product.sellingPrice)
    const next = mode === "percent" ? current * (1 + amount / 100) : current + amount
    await prisma.product.update({
      where: { id: product.id },
      data: { sellingPrice: Math.max(next, Number(product.minimumPrice)).toFixed(2) },
    })
    await prisma.priceHistory.create({
      data: {
        productId: product.id,
        oldPrice: product.sellingPrice,
        newPrice: Math.max(next, Number(product.minimumPrice)).toFixed(2),
        priceType: "SELLING_PRICE",
        reason: `Bulk ${mode} ${amount}`,
        changedBy: user.id,
      },
    })
  }

  revalidatePath("/products")
  return { success: true, updated: products.length }
}
