"use server"

import { revalidatePath } from "next/cache"
import { ProductCondition, ProductTracking } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { watDayKey } from "@/lib/lagos-day"
import { setStock } from "@/lib/concurrency"
import { requireUser } from "@/lib/session"
import { canHardDelete, canManageCatalog } from "@/lib/rbac"
import { can } from "@/lib/permissions"
import { shopError } from "@/lib/shop-speak"
import { UNSAFE_KEYS } from "@/lib/table-file"
import { parseShopCondition } from "@/lib/conditions"
import { makeOpeningSku } from "@/lib/opening-stock"

async function findOrCreateBrand(name: string) {
  const wanted = name.trim()
  if (!wanted) return null
  const brands = await prisma.brand.findMany({ select: { id: true, name: true } })
  const hit = brands.find((row) => row.name.toLowerCase() === wanted.toLowerCase())
  if (hit) return hit.id
  const created = await prisma.brand.create({ data: { name: wanted } })
  return created.id
}

async function findOrCreateCategory(name: string) {
  const wanted = name.trim() || "Phones"
  const categories = await prisma.category.findMany({ select: { id: true, name: true } })
  const hit = categories.find((row) => row.name.toLowerCase() === wanted.toLowerCase())
  if (hit) return hit.id
  const created = await prisma.category.create({ data: { name: wanted } })
  return created.id
}

async function uniqueSku(base: string) {
  const cleaned = (base || "ITEM").slice(0, 60)
  let sku = cleaned
  let n = 2
  while (await prisma.product.findUnique({ where: { sku } })) {
    sku = `${cleaned.slice(0, 56)}-${n}`
    n += 1
    if (n > 99) return `${cleaned.slice(0, 50)}-${Date.now().toString(36).slice(-6)}`
  }
  return sku
}

async function shopsForScope(formData: FormData) {
  const scope = String(formData.get("shopScope") || "all")
  if (scope === "one") {
    const branchId = String(formData.get("branchId") || "")
    if (!branchId) return { error: "Pick the shop this name should show on, or choose All shops." }
    const shop = await prisma.branch.findFirst({ where: { id: branchId, isActive: true } })
    if (!shop) return { error: "That shop is not open." }
    return { shops: [shop] }
  }
  const shops = await prisma.branch.findMany({ where: { isActive: true } })
  if (shops.length === 0) return { error: "There is no open shop to put this name on." }
  return { shops }
}

async function putNameOnShops(productId: string, shopIds: string[]) {
  for (const branchId of shopIds) {
    await prisma.inventory.upsert({
      where: { productId_branchId: { productId, branchId } },
      create: { productId, branchId, quantity: 0 },
      update: {},
    })
  }
}

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
    where: {
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { sku: { contains: search } },
            ],
          }
        : {}),
    },
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
  if (!(await canManageCatalog(user.role))) return { error: "You are not allowed to add or change items. Ask the main admin." }

  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { error: "Type the product name." }

  const brandName = String(formData.get("brandName") || "").trim()
  const brandIdField = String(formData.get("brandId") || "").trim()
  let brandId = brandIdField
  if (brandName) {
    brandId = (await findOrCreateBrand(brandName)) || ""
  }
  if (!brandId) return { error: "Type or pick a brand name." }

  const categoryName = String(formData.get("categoryName") || "").trim()
  const categoryIdField = String(formData.get("categoryId") || "").trim()
  if (!categoryName && !categoryIdField) {
    return { error: "Type the category, for example Phones, Laptops, Accessories, or Screen." }
  }
  const categoryId = categoryName
    ? await findOrCreateCategory(categoryName)
    : categoryIdField

  const condition = parseShopCondition(String(formData.get("condition") || "BRAND_NEW"))
  if (!condition) {
    return { error: "Pick How the phone looks: Brand New, Brand New (Locked), Brand New (N/A), UK, UK (Locked), Open Box, or Standard." }
  }

  const storage = String(formData.get("storage") || "").trim()
  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  let sku = String(formData.get("sku") ?? "").trim()
  if (sku) {
    const existing = await prisma.product.findUnique({ where: { sku } })
    if (existing) return { error: "That item code is already being used." }
  } else {
    sku = await uniqueSku(
      makeOpeningSku({
        brand: brand?.name || "ITEM",
        name,
        storage,
        condition,
      })
    )
  }

  const costPrice = Number(formData.get("costPrice") || 0)
  const sellingPrice = Number(formData.get("sellingPrice") || 0)
  const minimumPrice = Number(formData.get("minimumPrice") || sellingPrice || 0)
  if (!Number.isFinite(costPrice) || !Number.isFinite(sellingPrice) || sellingPrice < 0 || costPrice < 0) {
    return { error: "Cost and sell price must be numbers. Use 0 if you will set prices later." }
  }

  const shops = await shopsForScope(formData)
  if ("error" in shops) return { error: shops.error }

  const product = await prisma.product.create({
    data: {
      sku,
      name,
      description: String(formData.get("description") || "") || null,
      brandId,
      categoryId,
      condition,
      color: String(formData.get("color") || "") || null,
      storage: storage || null,
      ram: String(formData.get("ram") || "") || null,
      costPrice: costPrice.toFixed(2),
      minimumPrice: Math.max(0, minimumPrice).toFixed(2),
      sellingPrice: sellingPrice.toFixed(2),
      marketPrice: formData.get("marketPrice") ? Number(formData.get("marketPrice")).toFixed(2) : null,
      warrantyDays: Math.max(0, Number(formData.get("warrantyDays") || 0)),
      tracking: (String(formData.get("tracking") || "IMEI") as ProductTracking),
    },
  })

  await putNameOnShops(
    product.id,
    shops.shops.map((shop) => shop.id)
  )

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CREATE",
      entityType: "Product",
      entityId: product.id,
      newValue: JSON.stringify({ sku, name, shops: shops.shops.map((shop) => shop.code) }),
      branchId: user.branchId,
    },
  })

  revalidatePath("/products")
  revalidatePath("/products/new")
  revalidatePath("/inventory")
  revalidatePath("/pos")
  return { success: true }
}

export async function updateSelectedPrices(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) return { error: "You are not allowed to change prices. Ask the main admin." }

  const reason = String(formData.get("reason") || "Several prices updated together").trim() || "Several prices updated together"
  let parsed: unknown
  try {
    parsed = JSON.parse(String(formData.get("changes") || "[]"))
  } catch {
    return { error: "Tick the items and type each new selling price." }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: "Tick the items whose prices you want to change." }
  }
  if (parsed.length > 200) return { error: "Update up to 200 items at a time." }

  const changes: Array<{ id: string; sellingPrice: number }> = []
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue
    const id = String((row as { id?: unknown }).id || "")
    const sellingPrice = Number((row as { sellingPrice?: unknown }).sellingPrice)
    if (!id) continue
    changes.push({ id, sellingPrice })
  }
  if (changes.length === 0) return { error: "Tick the items whose prices you want to change." }

  const canFloor = await can(user.role, "action.override_floor")
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(changes.map((row) => row.id))] } },
  })
  const byId = new Map(products.map((product) => [product.id, product]))
  const problems: string[] = []
  const work: Array<{ id: string; name: string; oldPrice: string; next: number }> = []

  for (const change of changes) {
    const product = byId.get(change.id)
    if (!product) {
      problems.push("One ticked item was not found. Refresh the page and try again.")
      continue
    }
    if (!Number.isFinite(change.sellingPrice) || change.sellingPrice <= 0) {
      problems.push(`${product.name}: selling price must be a number above 0.`)
      continue
    }
    if (change.sellingPrice < Number(product.minimumPrice) && !canFloor) {
      problems.push(`${product.name} is below the lowest allowed price. Raise it, or ask the main admin.`)
      continue
    }
    if (Number(product.sellingPrice) === change.sellingPrice) continue
    work.push({
      id: product.id,
      name: product.name,
      oldPrice: String(product.sellingPrice),
      next: change.sellingPrice,
    })
  }

  if (problems.length) return { error: problems.slice(0, 4).join(" ") }
  if (work.length === 0) return { error: "Those selling prices are already what you typed." }

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of work) {
        const newPrice = row.next.toFixed(2)
        await tx.product.update({
          where: { id: row.id },
          data: { sellingPrice: newPrice },
        })
        await tx.priceHistory.create({
          data: {
            productId: row.id,
            oldPrice: row.oldPrice,
            newPrice,
            priceType: "SELLING_PRICE",
            reason,
            changedBy: user.id,
          },
        })
      }
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          entityType: "Product",
          entityId: work[0].id,
          oldValue: JSON.stringify(work.map((row) => ({ name: row.name, sellingPrice: Number(row.oldPrice) }))),
          newValue: JSON.stringify({
            updated: work.length,
            names: work.map((row) => row.name),
            reason,
          }),
          branchId: user.branchId,
        },
      })
    })
  } catch (error) {
    return { error: shopError(error, "We could not save those selling prices. Try again.") }
  }

  revalidatePath("/products")
  revalidatePath("/pos")
  revalidatePath("/inventory")
  return { success: true, updated: work.length }
}

export async function updateProductWarranty(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) return { error: "You are not allowed to add or change items. Ask the main admin." }
  const id = String(formData.get("id") || "")
  const warrantyDays = Number(formData.get("warrantyDays") || 0)
  if (!id || warrantyDays < 0) return { error: "Enter valid warranty days (0 for no warranty)." }
  const product = await prisma.product.findUnique({ where: { id } })
  if (!product) return { error: "We could not find that item." }
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
      if (UNSAFE_KEYS.has(header)) return
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
      Object.fromEntries(
        Object.entries(row)
          .filter(([key]) => !UNSAFE_KEYS.has(key))
          .map(([key, value]) => [String(key), String(value ?? "").trim()])
      )
    )
  }
  return rowsFromSheet(await file.text())
}

export async function importProducts(formData: FormData) {
  const user = await requireUser()
  // The item list is loaded centrally. If three shops could each add items,
  // one phone would end up on the system under three different names.
  if (!(await can(user.role, "action.upload"))) {
    return { error: "Only the main admin and the person who loads stock can load the item list from a sheet." }
  }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an Excel or CSV file first." }
  if (file.size > 2_000_000) return { error: "That file is too big. Use a file under 2 MB." }

  let rows: Record<string, string>[]
  try {
    rows = await readUpload(file)
  } catch {
    return { error: "We could not read that file. Save it as Excel or CSV and try again." }
  }
  if (rows.length === 0) return { error: "There is no item under the header line in that file." }
  if (rows.length > 400) return { error: "Upload up to 400 products at a time." }

  const shopsPicked = await shopsForScope(formData)
  if ("error" in shopsPicked) return { error: shopsPicked.error }

  const [brands, categories] = await Promise.all([
    prisma.brand.findMany(),
    prisma.category.findMany(),
  ])
  const brandIds = new Map(brands.map((row) => [row.name.toLowerCase(), row.id]))
  const categoryIds = new Map(categories.map((row) => [row.name.toLowerCase(), row.id]))

  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const line = index + 2
    // Sample rows on the handed-out sheet are never loaded.
    if (cell(row, "row_type", "type", "row").toUpperCase() === "SAMPLE") continue
    const skuCell = cell(row, "item_code", "sku", "code")
    const name = cell(row, "name", "product", "item", "product_name")
    const brandName = cell(row, "brand")
    const categoryName = cell(row, "category")
    if (!name || !brandName) {
      errors.push(`Line ${line}: product name and brand are required. Use the real name, for example iPhone 13 or MacBook Pro M3.`)
      continue
    }
    if (!categoryName) {
      errors.push(`Line ${line}: type the category, for example Phones, Laptops, Accessories, or Screen.`)
      continue
    }

    const trackingKey = keyName(cell(row, "tracking") || "IMEI")
    const tracking = TRACKING[trackingKey] || "IMEI"
    const condition = parseShopCondition(cell(row, "condition") || "BRAND_NEW")
    if (!condition) {
      errors.push(`Line ${line}: How the phone looks is not one we know. Use Brand New, Brand New (Locked), Brand New (N/A), UK, UK (Locked), Open Box, or Standard.`)
      continue
    }

    const costPrice = Number(cell(row, "cost", "cost_price") || 0)
    const sellingPrice = Number(cell(row, "selling", "selling_price") || 0)
    const minimumPrice = Number(cell(row, "minimum", "minimum_price", "min", "lowest_price", "lowest") || sellingPrice)
    if (!Number.isFinite(costPrice) || !Number.isFinite(sellingPrice) || sellingPrice < 0 || costPrice < 0) {
      errors.push(`Line ${line}: cost and sell price must be numbers. Leave them empty to register the name only.`)
      continue
    }

    let sku = skuCell
    if (sku) {
      const existing = await prisma.product.findUnique({ where: { sku } })
      if (existing) {
        skipped += 1
        continue
      }
    } else {
      sku = await uniqueSku(
        makeOpeningSku({
          brand: brandName,
          name,
          storage: cell(row, "storage"),
          condition,
        })
      )
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
        warrantyDays: Number(cell(row, "warranty_days", "warranty") || 0) || 0,
        description: cell(row, "description") || null,
      },
    })
    await putNameOnShops(
      product.id,
      shopsPicked.shops.map((shop) => shop.id)
    )
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

function cleanLabel(raw: FormDataEntryValue | null, label: string) {
  const name = String(raw ?? "").trim()
  if (!name) throw new Error(`Type the ${label}.`)
  return name
}

/**
 * Reseller markup for a category, as a percentage over cost. Left blank means
 * "no reseller quote for this category", which the till reads as 0 and falls
 * back to the standard price.
 */
function readMarkup(raw: FormDataEntryValue | null) {
  const text = String(raw ?? "").trim()
  if (!text) return { value: 0 }
  const parsed = Number(text)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { error: "Reseller markup must be a number from 0 up, like 12 for cost plus 12%." }
  }
  if (parsed > 500) return { error: "Reseller markup above 500% looks like a typing mistake." }
  return { value: Math.round(parsed * 100) / 100 }
}

export async function getCatalogTaxonomy() {
  await requireUser()
  const [brands, categories] = await Promise.all([
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    }),
  ])
  return { brands, categories }
}

export async function createBrand(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) return { error: "You are not allowed to add brands. Ask the main admin." }
  try {
    const name = cleanLabel(formData.get("name"), "brand name")
    const exists = await prisma.brand.findUnique({ where: { name } })
    if (exists) return { error: `${name} is already on the brand list.` }
    await prisma.brand.create({ data: { name } })
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entityType: "Brand",
        entityId: name,
        newValue: JSON.stringify({ name }),
        branchId: user.branchId,
      },
    })
  } catch (error) {
    return { error: shopError(error, "Could not add that brand.") }
  }
  revalidatePath("/products")
  revalidatePath("/products/brands")
  revalidatePath("/products/new")
  return { success: true }
}

export async function updateBrand(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) return { error: "You are not allowed to rename brands. Ask the main admin." }
  const id = String(formData.get("id") || "")
  try {
    const name = cleanLabel(formData.get("name"), "brand name")
    const existing = await prisma.brand.findUnique({ where: { id } })
    if (!existing) return { error: "We could not find that brand." }
    if (name !== existing.name) {
      const taken = await prisma.brand.findUnique({ where: { name } })
      if (taken) return { error: `${name} is already on the brand list.` }
    }
    await prisma.brand.update({ where: { id }, data: { name } })
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "Brand",
        entityId: name,
        oldValue: existing.name,
        newValue: name,
        branchId: user.branchId,
      },
    })
  } catch (error) {
    return { error: shopError(error, "Could not rename that brand.") }
  }
  revalidatePath("/products")
  revalidatePath("/products/brands")
  revalidatePath("/products/new")
  return { success: true }
}

export async function deleteBrand(formData: FormData) {
  const user = await requireUser()
  if (!canHardDelete(user.role)) {
    return { error: "Only the Managing Director can permanently remove a brand. Ask the CEO." }
  }
  if (!(await canManageCatalog(user.role))) return { error: "You are not allowed to remove brands. Ask the main admin." }
  const id = String(formData.get("id") || "")
  const brand = await prisma.brand.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  })
  if (!brand) return { error: "We could not find that brand." }
  if (brand._count.products > 0) {
    return {
      error: `${brand.name} still has ${brand._count.products} item${brand._count.products === 1 ? "" : "s"} on the price list. Move those items first.`,
    }
  }
  await prisma.brand.delete({ where: { id } })
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "DELETE",
      entityType: "Brand",
      entityId: brand.name,
      oldValue: brand.name,
      branchId: user.branchId,
    },
  })
  revalidatePath("/products")
  revalidatePath("/products/brands")
  revalidatePath("/products/new")
  return { success: true }
}

export async function createCategory(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) return { error: "You are not allowed to add categories. Ask the main admin." }
  try {
    const name = cleanLabel(formData.get("name"), "category name")
    const description = String(formData.get("description") || "").trim() || null
    const markup = readMarkup(formData.get("resellerMarkup"))
    if ("error" in markup) return { error: markup.error }
    const exists = await prisma.category.findUnique({ where: { name } })
    if (exists) return { error: `${name} is already on the category list.` }
    await prisma.category.create({
      data: { name, description, resellerMarkup: markup.value.toFixed(2) },
    })
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATE",
        entityType: "Category",
        entityId: name,
        newValue: JSON.stringify({ name, description, resellerMarkup: markup.value }),
        branchId: user.branchId,
      },
    })
  } catch (error) {
    return { error: shopError(error, "Could not add that category.") }
  }
  revalidatePath("/products")
  revalidatePath("/products/brands")
  revalidatePath("/products/new")
  revalidatePath("/pos")
  return { success: true }
}

export async function updateCategory(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) return { error: "You are not allowed to edit categories. Ask the main admin." }
  const id = String(formData.get("id") || "")
  try {
    const name = cleanLabel(formData.get("name"), "category name")
    const description = String(formData.get("description") || "").trim() || null
    const markup = readMarkup(formData.get("resellerMarkup"))
    if ("error" in markup) return { error: markup.error }
    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) return { error: "We could not find that category." }
    if (name !== existing.name) {
      const taken = await prisma.category.findUnique({ where: { name } })
      if (taken) return { error: `${name} is already on the category list.` }
    }
    await prisma.category.update({
      where: { id },
      data: { name, description, resellerMarkup: markup.value.toFixed(2) },
    })
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "Category",
        entityId: name,
        oldValue: JSON.stringify({
          name: existing.name,
          description: existing.description,
          resellerMarkup: Number(existing.resellerMarkup),
        }),
        newValue: JSON.stringify({ name, description, resellerMarkup: markup.value }),
        branchId: user.branchId,
      },
    })
  } catch (error) {
    return { error: shopError(error, "Could not edit that category.") }
  }
  revalidatePath("/products")
  revalidatePath("/products/brands")
  revalidatePath("/products/new")
  revalidatePath("/pos")
  return { success: true }
}

export async function deleteCategory(formData: FormData) {
  const user = await requireUser()
  if (!canHardDelete(user.role)) {
    return { error: "Only the Managing Director can permanently remove a category. Ask the CEO." }
  }
  if (!(await canManageCatalog(user.role))) return { error: "You are not allowed to remove categories. Ask the main admin." }
  const id = String(formData.get("id") || "")
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  })
  if (!category) return { error: "We could not find that category." }
  if (category._count.products > 0) {
    return {
      error: `${category.name} still has ${category._count.products} item${category._count.products === 1 ? "" : "s"} on the price list. Move those items first.`,
    }
  }
  await prisma.category.delete({ where: { id } })
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "DELETE",
      entityType: "Category",
      entityId: category.name,
      oldValue: category.name,
      branchId: user.branchId,
    },
  })
  revalidatePath("/products")
  revalidatePath("/products/brands")
  revalidatePath("/products/new")
  return { success: true }
}

export async function updateProduct(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) return { error: "You are not allowed to edit items. Ask the main admin." }
  const id = String(formData.get("id") || "")
  if (!id) return { error: "Item ID missing." }

  const name = String(formData.get("name") || "").trim()
  const sku = String(formData.get("sku") || "").trim()
  const storage = String(formData.get("storage") || "").trim() || null
  const color = String(formData.get("color") || "").trim() || null
  if (!name || !sku) return { error: "Name and Item Code (SKU) are required." }

  const existing = await prisma.product.findUnique({ where: { id } })
  if (!existing) return { error: "Item not found." }

  const condition = parseShopCondition(String(formData.get("condition") || existing.condition))
  if (!condition) return { error: "Pick How the phone looks from the list." }

  const costPrice = Number(formData.get("costPrice") || 0)
  const sellingPrice = Number(formData.get("sellingPrice") || 0)
  const minimumPrice = Number(formData.get("minimumPrice") || sellingPrice)

  if (sku !== existing.sku) {
    const clash = await prisma.product.findUnique({ where: { sku } })
    if (clash) return { error: "That item code is already used by another item." }
  }

  await prisma.product.update({
    where: { id },
    data: {
      name,
      sku,
      storage,
      color,
      condition,
      costPrice: costPrice.toFixed(2),
      minimumPrice: minimumPrice.toFixed(2),
      sellingPrice: sellingPrice.toFixed(2),
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      entityType: "Product",
      entityId: id,
      oldValue: JSON.stringify({ name: existing.name, costPrice: existing.costPrice, sellingPrice: existing.sellingPrice }),
      newValue: JSON.stringify({ name, costPrice, sellingPrice, storage, color, condition, note: `Product details modified: ${name} (${sku})` }),
      branchId: user.branchId,
    },
  })

  revalidatePath("/products")
  revalidatePath("/inventory")
  revalidatePath("/pos")
  return { success: true }
}

export async function reduceInventoryStock(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) return { error: "You are not allowed to adjust stock. Ask the main admin." }
  const productId = String(formData.get("productId") || "")
  const branchId = String(formData.get("branchId") || "")
  const reason = String(formData.get("reason") || "").trim()
  const imeiBlob = String(formData.get("imeis") || "").trim()

  if (!productId || !branchId) return { error: "Pick the item and the shop." }
  if (!reason) return { error: "Write why you are reducing stock, for example damaged, lost, or count correction." }

  const [inv, product] = await Promise.all([
    prisma.inventory.findUnique({
      where: { productId_branchId: { productId, branchId } },
      include: { branch: true },
    }),
    prisma.product.findUnique({ where: { id: productId } }),
  ])

  if (!inv || !product) return { error: "That item is not on the shelf list for this shop." }

  const tracked = product.tracking === "IMEI" || product.tracking === "SERIAL"

  if (tracked) {
    const codes = imeiBlob
      .split(/[\n,;]+/)
      .map((row) => row.replace(/[\s-]/g, "").trim())
      .filter(Boolean)
    if (!codes.length) {
      return {
        error:
          "This item uses IMEI or serial. Scan or type each unit you are writing off. You cannot reduce phones by a piece count alone.",
      }
    }
    const unique = [...new Set(codes)]
    if (unique.length !== codes.length) return { error: "The same IMEI or serial is listed twice. Remove the copy." }

    const records = await prisma.imeiRecord.findMany({
      where: {
        productId,
        branchId,
        status: "IN_STOCK",
        OR: unique.flatMap((code) => [{ imei1: code }, { serialNumber: code }]),
      },
    })
    if (records.length !== unique.length) {
      const found = new Set(records.flatMap((row) => [row.imei1, row.serialNumber].filter(Boolean) as string[]))
      const missing = unique.filter((code) => !found.has(code))
      return {
        error: `These numbers are not In shop for this item at ${inv.branch.name}: ${missing.join(", ")}.`,
      }
    }
    if (records.length > inv.quantity) {
      return { error: `Shop stock for ${product.name} at ${inv.branch.name} is only ${inv.quantity}. Count again.` }
    }

    const nextQty = Math.max(0, inv.quantity - records.length)
    await prisma.$transaction([
      ...records.map((row) =>
        prisma.imeiRecord.update({
          where: { id: row.id },
          data: { status: "DISPOSED", notes: reason },
        })
      ),
      prisma.inventory.update({
        where: { productId_branchId: { productId, branchId } },
        data: { quantity: nextQty },
      }),
      // A write-off is a correction by hand. Before the stock ledger existed it
      // moved the shelf and left nothing behind but an audit note.
      prisma.stockMovement.create({
        data: {
          productId,
          branchId,
          quantity: -records.length,
          kind: "HAND_CORRECTION",
          reference: reason,
          userId: user.id,
          businessDate: watDayKey(),
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "UPDATE",
          entityType: "Inventory",
          entityId: inv.id,
          oldValue: String(inv.quantity),
          newValue: JSON.stringify({
            quantity: nextQty,
            wroteOff: records.length,
            reason,
            numbers: records.map((row) => row.imei1),
            shop: inv.branch.name,
            product: product.name,
          }),
          branchId,
          risk: "MEDIUM",
        },
      }),
    ])

    revalidatePath("/products")
    revalidatePath("/inventory")
    revalidatePath("/imei")
    revalidatePath("/pos")
    return { success: true }
  }

  const reduceBy = Number(formData.get("reduceBy") || 0)
  if (!Number.isFinite(reduceBy) || reduceBy <= 0) return { error: "Enter how many pieces to take off the shelf." }
  if (reduceBy > inv.quantity) {
    return { error: `You cannot reduce by ${reduceBy}. ${inv.branch.name} only has ${inv.quantity} on the shelf.` }
  }

  const nextQty = Math.max(0, inv.quantity - reduceBy)

  await prisma.$transaction([
    prisma.inventory.update({
      where: { productId_branchId: { productId, branchId } },
      data: { quantity: nextQty },
    }),
    prisma.stockMovement.create({
      data: {
        productId,
        branchId,
        quantity: -reduceBy,
        kind: "HAND_CORRECTION",
        reference: reason,
        userId: user.id,
        businessDate: watDayKey(),
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "Inventory",
        entityId: inv.id,
        oldValue: String(inv.quantity),
        newValue: JSON.stringify({
          quantity: nextQty,
          reducedBy: reduceBy,
          reason,
          shop: inv.branch.name,
          product: product.name,
        }),
        branchId,
        risk: "MEDIUM",
      },
    }),
  ])

  revalidatePath("/products")
  revalidatePath("/inventory")
  revalidatePath("/pos")
  return { success: true }
}

export async function deleteProduct(formData: FormData) {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) return { error: "You are not allowed to delete items. Ask the main admin." }
  if (!canHardDelete(user.role)) {
    return { error: "Only the Managing Director can remove or hide an item from the catalog. Ask the CEO." }
  }
  const id = String(formData.get("id") || "")
  if (!id) return { error: "Item ID missing." }

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          saleItems: true,
          purchaseItems: true,
          imeiRecords: true,
          swaps: true,
        },
      },
      inventory: true,
    },
  })
  if (!product) return { error: "Item not found." }

  const totalStock = product.inventory.reduce((sum, row) => sum + row.quantity, 0)
  const hasHistory =
    product._count.saleItems > 0 ||
    product._count.purchaseItems > 0 ||
    product._count.imeiRecords > 0 ||
    product._count.swaps > 0

  if (hasHistory || totalStock > 0) {
    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    })
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "UPDATE",
        entityType: "Product",
        entityId: id,
        newValue: JSON.stringify({
          isActive: false,
          note: `Deactivated item ${product.name} (${product.sku}) with historical transactions or remaining stock.`,
        }),
        branchId: user.branchId,
      },
    })
    revalidatePath("/products")
    revalidatePath("/inventory")
    revalidatePath("/pos")
    return { success: true, message: "Item has historical records, so it was deactivated and hidden from the active catalog." }
  }

  await prisma.$transaction([
    prisma.inventory.deleteMany({ where: { productId: id } }),
    prisma.product.delete({ where: { id } }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "DELETE",
        entityType: "Product",
        entityId: id,
        newValue: JSON.stringify({ note: `Permanently deleted unused item ${product.name} (${product.sku}).` }),
        branchId: user.branchId,
      },
    }),
  ])

  revalidatePath("/products")
  revalidatePath("/inventory")
  revalidatePath("/pos")
  return { success: true, message: "Item permanently deleted." }
}

export async function resetAllProductWarrantiesToZero() {
  const user = await requireUser()
  if (!(await canManageCatalog(user.role))) return { error: "You are not allowed to update warranty settings. Ask the main admin." }
  await prisma.product.updateMany({
    data: { warrantyDays: 0 },
  })
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "UPDATE",
      entityType: "Product",
      entityId: "ALL",
      newValue: JSON.stringify({ warrantyDays: 0, note: "Reset all product warranties to 0 days per company policy" }),
      branchId: user.branchId,
    },
  })
  revalidatePath("/products")
  revalidatePath("/products/warranty")
  revalidatePath("/pos")
  return { success: true }
}
