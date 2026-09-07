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
  if (!product) return { error: "That item was not found." }
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
  if (!product) return { error: "That item was not found." }
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
    return { error: "You cannot change prices for every item at once." }
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

const CONDITIONS: Record<string, ProductCondition> = {
  brand_new: "BRAND_NEW",
  brandnew: "BRAND_NEW",
  new: "BRAND_NEW",
  open_box: "OPEN_BOX",
  openbox: "OPEN_BOX",
  uk_used: "UK_USED",
  ukused: "UK_USED",
  refurbished: "REFURBISHED",
  swap_device: "SWAP_DEVICE",
  swap: "SWAP_DEVICE",
  faulty: "FAULTY",
  repair_device: "REPAIR_DEVICE",
  repair: "REPAIR_DEVICE",
}

const TRACKING: Record<string, ProductTracking> = {
  imei: "IMEI",
  phone: "IMEI",
  serial: "SERIAL",
  none: "NONE",
  no_number: "NONE",
  nonumber: "NONE",
}

function keyName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

function cell(row: Record<string, string>, ...names: string[]) {
  const wanted = new Set(names.map(keyName))
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(keyName(key)) && value.trim()) return value.trim()
  }
  return ""
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cellValue = ""
  let quoted = false
  const input = text.replace(/^\uFEFF/, "")
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cellValue += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cellValue += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === "," || char === "\t") {
      row.push(cellValue)
      cellValue = ""
      continue
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1
      row.push(cellValue)
      if (row.some((item) => item.trim())) rows.push(row)
      row = []
      cellValue = ""
      continue
    }
    cellValue += char
  }
  row.push(cellValue)
  if (row.some((item) => item.trim())) rows.push(row)
  return rows
}

function rowsFromSheet(text: string) {
  const table = parseCsv(text)
  if (table.length < 2) return []
  const headers = table[0].map((item) => item.trim())
  return table.slice(1).map((line) => {
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = line[index] ?? ""
    })
    return row
  })
}

async function readUpload(file: File) {
  const name = file.name.toLowerCase()
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx")
    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!sheet) return []
    return XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: "" }).map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key), String(value ?? "").trim()]))
    )
  }
  return rowsFromSheet(await file.text())
}

export async function importProducts(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) return { error: "You cannot add or change phones and items." }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an Excel or CSV file first." }
  if (file.size > 2_000_000) return { error: "That file is too big. Use a file under 2 MB." }

  let rows: Record<string, string>[]
  try {
    rows = await readUpload(file)
  } catch {
    return { error: "We could not read that file. Save it as Excel or CSV and try again." }
  }
  if (rows.length === 0) return { error: "The file has no product rows under the header line." }
  if (rows.length > 400) return { error: "Upload up to 400 products at a time." }

  const [brands, categories, shops] = await Promise.all([
    prisma.brand.findMany(),
    prisma.category.findMany(),
    prisma.branch.findMany({ where: { isActive: true }, select: { id: true } }),
  ])
  const brandIds = new Map(brands.map((row) => [row.name.toLowerCase(), row.id]))
  const categoryIds = new Map(categories.map((row) => [row.name.toLowerCase(), row.id]))

  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const line = index + 2
    const sku = cell(row, "item_code", "sku", "code")
    const name = cell(row, "name", "product", "item")
    const brandName = cell(row, "brand")
    const categoryName = cell(row, "category")
    if (!sku || !name || !brandName || !categoryName) {
      errors.push(`Line ${line}: item code, name, brand, and category are required.`)
      continue
    }

    const existing = await prisma.product.findUnique({ where: { sku } })
    if (existing) {
      skipped += 1
      continue
    }

    const trackingKey = keyName(cell(row, "tracking") || "IMEI")
    const tracking = TRACKING[trackingKey]
    if (!tracking) {
      errors.push(`Line ${line}: say phone IMEI, serial, or no number.`)
      continue
    }
    const conditionKey = keyName(cell(row, "condition") || "BRAND_NEW")
    const condition = CONDITIONS[conditionKey]
    if (!condition) {
      errors.push(`Line ${line}: condition is not one we know. Use Brand New, UK Used, Open Box, or similar.`)
      continue
    }

    const costPrice = Number(cell(row, "cost", "cost_price") || 0)
    const sellingPrice = Number(cell(row, "selling", "selling_price") || 0)
    const minimumPrice = Number(cell(row, "minimum", "minimum_price", "min") || sellingPrice)
    if (!Number.isFinite(costPrice) || !Number.isFinite(sellingPrice) || sellingPrice <= 0) {
      errors.push(`Line ${line}: selling price must be a number above 0.`)
      continue
    }

    let brandId = brandIds.get(brandName.toLowerCase())
    if (!brandId) {
      const brand = await prisma.brand.create({ data: { name: brandName } })
      brandId = brand.id
      brandIds.set(brandName.toLowerCase(), brandId)
    }
    let categoryId = categoryIds.get(categoryName.toLowerCase())
    if (!categoryId) {
      const category = await prisma.category.create({ data: { name: categoryName } })
      categoryId = category.id
      categoryIds.set(categoryName.toLowerCase(), categoryId)
    }

    const product = await prisma.product.create({
      data: {
        sku,
        name,
        brandId,
        categoryId,
        tracking,
        condition,
        color: cell(row, "color") || null,
        storage: cell(row, "storage") || null,
        ram: cell(row, "ram") || null,
        costPrice: costPrice.toFixed(2),
        minimumPrice: Math.max(0, minimumPrice).toFixed(2),
        sellingPrice: sellingPrice.toFixed(2),
        warrantyDays: Number(cell(row, "warranty_days", "warranty") || 365) || 365,
        description: cell(row, "description") || null,
      },
    })
    if (shops.length) {
      await prisma.inventory.createMany({
        data: shops.map((shop) => ({ productId: product.id, branchId: shop.id, quantity: 0 })),
      })
    }
    created += 1
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CREATE",
      entityType: "Product",
      entityId: "bulk-upload",
      newValue: JSON.stringify({ created, skipped, errors: errors.length, file: file.name }),
      branchId: user.branchId,
    },
  })

  revalidatePath("/products")
  revalidatePath("/inventory")
  revalidatePath("/incoming")
  return { success: true, created, skipped, errors }
}
