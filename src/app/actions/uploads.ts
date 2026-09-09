"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { can } from "@/lib/permissions"
import { readTableFile, readWorkbookGrids } from "@/lib/table-file"
import { planOpeningStock } from "@/lib/opening-stock"
import { planCustomers, planImeis, planStock, type CatalogItem, type ShopRef } from "@/lib/upload-plan"

/**
 * Loading the shop system from a sheet.
 *
 * Prefer the Abu Twins opening stock workbook (one file per shop, with PHONES,
 * ACCESSORIES, SCREEN, LAPTOPS). The older four-step sheets remain for cases
 * where stock arrives after the item list already exists.
 *
 * Every upload is checked from top to bottom before a single row is written, so
 * a mistake on the last line does not leave half a shop loaded.
 */

const MAX_BYTES = 4_000_000
const MAX_ROWS = 2_000

export type UploadResult = {
  error?: string
  success?: boolean
  added?: number
  skipped?: number
  products?: number
  phones?: number
  pieces?: number
  problems?: string[]
}

async function readSheet(formData: FormData): Promise<{ rows: Record<string, string>[]; name: string } | { error: string }> {
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an Excel or CSV file first." }
  if (file.size > MAX_BYTES) return { error: "That file is too big. Use a file under 4 MB." }
  let rows: Record<string, string>[]
  try {
    rows = await readTableFile(file)
  } catch {
    return { error: "We could not read that file. Save it as Excel or CSV and try again." }
  }
  if (!rows.length) return { error: "The file has no rows under the header line." }
  if (rows.length > MAX_ROWS) return { error: `Upload up to ${MAX_ROWS.toLocaleString("en-NG")} rows at a time. Split the sheet and send it in parts.` }
  return { rows, name: file.name }
}

async function requireUploader() {
  const user = await requireUser()
  if (!(await can(user.role, "action.upload"))) {
    return { error: "Only Super Admin and the stock uploader can load the shop system from a sheet." as const }
  }
  return { user }
}

async function trail(userId: string, entity: string, detail: Record<string, unknown>, branchId: string | null) {
  await prisma.auditLog.create({
    data: {
      userId,
      action: "IMPORT",
      entityType: entity,
      entityId: "sheet-upload",
      newValue: JSON.stringify(detail),
      branchId,
    },
  })
}

/**
 * Abu Twins opening stock: one workbook per shop.
 * Creates missing item names, books phones and serials In shop, and sets piece counts.
 */
export async function importOpeningStock(formData: FormData): Promise<UploadResult> {
  const gate = await requireUploader()
  if ("error" in gate) return { error: gate.error }
  const { user } = gate

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the opening stock Excel file first." }
  if (file.size > MAX_BYTES) return { error: "That file is too big. Use a file under 4 MB." }

  const branchId = String(formData.get("branchId") || "")
  const shop = await prisma.branch.findFirst({ where: { id: branchId, isActive: true } })
  if (!shop) return { error: "Pick the shop this file belongs to: Iwo Road, Bodija, or Challenge." }

  let sheets: Array<{ sheet: string; grid: string[][] }>
  try {
    sheets = await readWorkbookGrids(file)
  } catch {
    return { error: "We could not read that Excel file. Save it again and try once more." }
  }

  const plan = planOpeningStock(sheets)
  if (plan.problems.length) {
    return {
      error: `${plan.problems.length} line(s) need fixing. Nothing was loaded.`,
      problems: plan.problems.slice(0, 40),
    }
  }
  if (!plan.products.length) {
    return {
      error:
        "No stock rows were found. Use the PHONES, ACCESSORIES, SCREEN, and LAPTOPS tabs with PRODUCT NAME on the header row.",
    }
  }

  const [brands, categories, activeShops] = await Promise.all([
    prisma.brand.findMany(),
    prisma.category.findMany(),
    prisma.branch.findMany({ where: { isActive: true }, select: { id: true } }),
  ])
  const brandIds = new Map(brands.map((row) => [row.name.toLowerCase(), row.id]))
  const categoryIds = new Map(categories.map((row) => [row.name.toLowerCase(), row.id]))

  const productIdByKey = new Map<string, string>()
  let productsAdded = 0

  for (const draft of plan.products) {
    const key = [
      draft.name.toLowerCase(),
      draft.brand.toLowerCase(),
      draft.condition,
      (draft.storage || "").toLowerCase(),
      draft.tracking,
    ].join("|")

    let brandId = brandIds.get(draft.brand.toLowerCase())
    if (!brandId) {
      const brand = await prisma.brand.create({ data: { name: draft.brand } })
      brandId = brand.id
      brandIds.set(draft.brand.toLowerCase(), brandId)
    }
    let categoryId = categoryIds.get(draft.category.toLowerCase())
    if (!categoryId) {
      const category = await prisma.category.create({ data: { name: draft.category } })
      categoryId = category.id
      categoryIds.set(draft.category.toLowerCase(), categoryId)
    }

    const existing =
      (await prisma.product.findUnique({ where: { sku: draft.sku } })) ||
      (await prisma.product.findFirst({
        where: {
          name: draft.name,
          brandId,
          condition: draft.condition,
          tracking: draft.tracking,
          storage: draft.storage,
        },
      }))

    if (existing) {
      productIdByKey.set(key, existing.id)
      continue
    }

    const product = await prisma.product.create({
      data: {
        sku: draft.sku,
        name: draft.name,
        brandId,
        categoryId,
        tracking: draft.tracking,
        condition: draft.condition,
        storage: draft.storage,
        costPrice: draft.costPrice.toFixed(2),
        minimumPrice: draft.minimumPrice.toFixed(2),
        sellingPrice: draft.sellingPrice.toFixed(2),
        warrantyDays: 365,
        description: `Opening stock · ${draft.category}`,
      },
    })
    if (activeShops.length) {
      await prisma.inventory.createMany({
        data: activeShops.map((row) => ({ productId: product.id, branchId: row.id, quantity: 0 })),
      })
    }
    productIdByKey.set(key, product.id)
    productsAdded += 1
  }

  const unitPayload = plan.units.map((row) => {
    const productId = productIdByKey.get(row.productKey)
    if (!productId) throw new Error("Opening stock product key missing after create.")
    return {
      imei1: row.identity.value,
      serialNumber: row.identity.kind === "serial" ? row.identity.value : null,
      productId,
      branchId: shop.id,
      status: "IN_STOCK" as const,
      notes: `Opening stock · ${row.sheet}`,
    }
  })

  const existingImeis = unitPayload.length
    ? await prisma.imeiRecord.findMany({
        where: {
          OR: [
            { imei1: { in: unitPayload.map((row) => row.imei1) } },
            {
              serialNumber: {
                in: unitPayload.map((row) => row.serialNumber).filter(Boolean) as string[],
              },
            },
          ],
        },
        select: { imei1: true, serialNumber: true },
      })
    : []
  const already = new Set(
    existingImeis.flatMap((row) => [row.imei1, row.serialNumber].filter(Boolean) as string[])
  )
  const freshUnits = unitPayload.filter(
    (row) => !already.has(row.imei1) && !(row.serialNumber && already.has(row.serialNumber))
  )

  let phonesAdded = 0
  for (let i = 0; i < freshUnits.length; i += 200) {
    const batch = freshUnits.slice(i, i + 200)
    await prisma.$transaction(async (tx) => {
      await tx.imeiRecord.createMany({ data: batch })
      const perShop = new Map<string, number>()
      for (const row of batch) {
        const key = `${row.productId}:${row.branchId}`
        perShop.set(key, (perShop.get(key) ?? 0) + 1)
      }
      for (const [key, count] of perShop) {
        const [productId, branchId] = key.split(":")
        await tx.inventory.upsert({
          where: { productId_branchId: { productId, branchId } },
          update: { quantity: { increment: count } },
          create: { productId, branchId, quantity: count },
        })
      }
    })
    phonesAdded += batch.length
  }

  let pieceLines = 0
  for (const row of plan.quantities) {
    const productId = productIdByKey.get(row.productKey)
    if (!productId) continue
    await prisma.inventory.upsert({
      where: { productId_branchId: { productId, branchId: shop.id } },
      update: { quantity: row.quantity, lastStockCheck: new Date() },
      create: { productId, branchId: shop.id, quantity: row.quantity },
    })
    pieceLines += 1
  }

  await trail(
    user.id,
    "OpeningStock",
    {
      shop: shop.name,
      file: file.name,
      productsAdded,
      phonesAdded,
      phonesAlready: unitPayload.length - phonesAdded,
      pieceLines,
    },
    shop.id
  )

  revalidatePath("/uploads")
  revalidatePath("/products")
  revalidatePath("/imei")
  revalidatePath("/inventory")
  revalidatePath("/dashboard")
  revalidatePath("/pos")

  return {
    success: true,
    added: productsAdded + phonesAdded + pieceLines,
    products: productsAdded,
    phones: phonesAdded,
    pieces: pieceLines,
    skipped: unitPayload.length - phonesAdded,
  }
}

/**
 * Step 3. The phones, one IMEI to a line.
 *
 * This is the one the shop asked for most. Booking a container in by hand, one
 * phone at a time, is where an evening goes.
 */
export async function importImeis(formData: FormData): Promise<UploadResult> {
  const gate = await requireUploader()
  if ("error" in gate) return { error: gate.error }
  const { user } = gate

  const read = await readSheet(formData)
  if ("error" in read) return { error: read.error }
  const { rows, name } = read

  const [items, suppliers, shops] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, select: { id: true, sku: true, name: true, tracking: true } }),
    prisma.supplier.findMany({ select: { id: true, name: true } }),
    prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
  ])
  const supplierByName = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id]))

  const plan = planImeis(rows, items as CatalogItem[], shops as ShopRef[])
  if (plan.problems.length) {
    return { error: `${plan.problems.length} line(s) need fixing. Nothing was loaded.`, problems: plan.problems.slice(0, 40) }
  }
  if (!plan.rows.length) return { error: "The sheet has no phones on it." }

  // A phone already on the system is left exactly as it is. Re-sending the same
  // container must never move a sold phone back onto the shelf.
  const existing = await prisma.imeiRecord.findMany({
    where: { imei1: { in: plan.rows.map((p) => p.imei1) } },
    select: { imei1: true },
  })
  const already = new Set(existing.map((row) => row.imei1))
  const fresh = plan.rows.filter((row) => !already.has(row.imei1))

  let added = 0
  for (let i = 0; i < fresh.length; i += 200) {
    const batch = fresh.slice(i, i + 200)
    await prisma.$transaction(async (tx) => {
      await tx.imeiRecord.createMany({
        data: batch.map((row) => ({
          imei1: row.imei1,
          imei2: row.imei2,
          serialNumber: row.serialNumber,
          productId: row.productId,
          branchId: row.branchId,
          supplierId: row.supplierName ? supplierByName.get(row.supplierName.toLowerCase()) ?? null : null,
          status: "IN_STOCK" as const,
          notes: row.notes,
        })),
      })
      // The shelf count follows the phones, so Shop stock and the IMEI list
      // agree from the very first day.
      const perShop = new Map<string, number>()
      for (const row of batch) {
        const key = `${row.productId}:${row.branchId}`
        perShop.set(key, (perShop.get(key) ?? 0) + 1)
      }
      for (const [key, count] of perShop) {
        const [productId, branchId] = key.split(":")
        await tx.inventory.upsert({
          where: { productId_branchId: { productId, branchId } },
          update: { quantity: { increment: count } },
          create: { productId, branchId, quantity: count },
        })
      }
    })
    added += batch.length
  }

  await trail(user.id, "IMEIRecord", { added, alreadyOnSystem: already.size, file: name }, user.branchId)
  revalidatePath("/imei")
  revalidatePath("/inventory")
  revalidatePath("/uploads")
  revalidatePath("/dashboard")
  return { success: true, added, skipped: already.size }
}

/**
 * Step 2. How many of each countable item are on the shelf, per shop.
 * For cords, chargers and anything with no unique number.
 */
export async function importStock(formData: FormData): Promise<UploadResult> {
  const gate = await requireUploader()
  if ("error" in gate) return { error: gate.error }
  const { user } = gate

  const read = await readSheet(formData)
  if ("error" in read) return { error: read.error }
  const { rows, name } = read

  const [items, shops] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, select: { id: true, sku: true, name: true, tracking: true } }),
    prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
  ])

  const plan = planStock(rows, items as CatalogItem[], shops as ShopRef[])
  if (plan.problems.length) {
    return { error: `${plan.problems.length} line(s) need fixing. Nothing was loaded.`, problems: plan.problems.slice(0, 40) }
  }
  if (!plan.rows.length) return { error: "The sheet has no shelf counts on it." }

  for (const row of plan.rows) {
    await prisma.inventory.upsert({
      where: { productId_branchId: { productId: row.productId, branchId: row.branchId } },
      update: { quantity: row.quantity, ...(row.minStock !== null ? { minStock: row.minStock } : {}), lastStockCheck: new Date() },
      create: { productId: row.productId, branchId: row.branchId, quantity: row.quantity, ...(row.minStock !== null ? { minStock: row.minStock } : {}) },
    })
  }

  await trail(user.id, "Inventory", { lines: plan.rows.length, file: name }, user.branchId)
  revalidatePath("/inventory")
  revalidatePath("/uploads")
  revalidatePath("/dashboard")
  return { success: true, added: plan.rows.length }
}

/** Step 4. Customer names, so old debts and warranties can be attached. */
export async function importCustomers(formData: FormData): Promise<UploadResult> {
  const gate = await requireUploader()
  if ("error" in gate) return { error: gate.error }
  const { user } = gate

  const read = await readSheet(formData)
  if ("error" in read) return { error: read.error }
  const { rows, name } = read

  const shops = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } })
  const plan = planCustomers(rows, shops as ShopRef[])
  if (plan.problems.length) {
    return { error: `${plan.problems.length} line(s) need fixing. Nothing was loaded.`, problems: plan.problems.slice(0, 40) }
  }
  if (!plan.rows.length) return { error: "The sheet has no customers on it." }

  const existing = await prisma.customer.findMany({
    where: { phone: { in: plan.rows.map((p) => p.phone) } },
    select: { phone: true },
  })
  const already = new Set(existing.map((row) => row.phone))
  const fresh = plan.rows.filter((row) => !already.has(row.phone))

  if (fresh.length) {
    await prisma.customer.createMany({
      data: fresh.map((row) => ({
        name: row.name,
        phone: row.phone,
        branchId: row.branchId,
        email: row.email,
        address: row.address,
        creditLimit: row.creditLimit.toFixed(2),
      })),
    })
  }

  await trail(user.id, "Customer", { added: fresh.length, alreadyOnSystem: already.size, file: name }, user.branchId)
  revalidatePath("/customers")
  revalidatePath("/uploads")
  return { success: true, added: fresh.length, skipped: already.size }
}

/** What the upload screen shows about how far the shop has got. */
export async function getUploadProgress() {
  const user = await requireUser()
  if (!(await can(user.role, "view.uploads"))) return null
  const [items, withStock, phones, customers, branches] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.inventory.count({ where: { quantity: { gt: 0 } } }),
    prisma.imeiRecord.count({ where: { status: "IN_STOCK" } }),
    prisma.customer.count(),
    prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
  ])
  return { items, withStock, phones, customers, branches }
}
