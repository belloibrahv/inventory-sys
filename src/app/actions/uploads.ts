"use server"

import { revalidatePath } from "next/cache"
import { ProductCondition, ProductTracking } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { can } from "@/lib/permissions"
import { readTableFile, readWorkbookGrids } from "@/lib/table-file"
import { makeOpeningSku, planOpeningStock } from "@/lib/opening-stock"
import { planCustomers, planImeis, planStock, type CatalogItem, type ShopRef } from "@/lib/upload-plan"
import {
  MARKED_PAID_ON_UPLOAD,
  UPLOAD_STOCK_SOURCE,
  attachPurchaseLine,
  isMarkedPaidOnUpload,
} from "@/lib/upload-purchase"
import { generateDocNumber, money } from "@/lib/utils"

/**
 * Loading the shop system from a sheet or by hand.
 *
 * Manual adds and Excel loads create a real Goods from supplier bill (PO-…)
 * so accountants can see supplier, submission value, and paid or not paid.
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
  invoiceNumber?: string
  purchaseId?: string
  submissionValue?: number
  paid?: boolean
  paidAmount?: number
  balanceOwed?: number
}

export type BatchUploadItem = {
  productMode: "existing" | "new"
  productId?: string
  newProduct?: {
    name: string
    brandId: string
    categoryId: string
    condition: ProductCondition
    tracking: ProductTracking
    storage?: string
    costPrice: number
    minimumPrice: number
    sellingPrice: number
  }
  costPrice: number
  quantity: number
  tracking: ProductTracking
  identities?: string[]
}

export type BatchUploadPayload = {
  branchId: string
  supplierId?: string
  newSupplierName?: string
  newSupplierPhone?: string
  newSupplierCountry?: string
  newSupplierCity?: string
  invoiceNumber?: string
  uploadDate?: string
  amountPaid: number
  notes?: string
  items: BatchUploadItem[]
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
  if (!rows.length) return { error: "There is nothing under the header line in that file." }
  if (rows.length > MAX_ROWS) return { error: `Upload up to ${MAX_ROWS.toLocaleString("en-NG")} rows at a time. Split the sheet and send it in parts.` }
  return { rows, name: file.name }
}

async function requireUploader() {
  const user = await requireUser()
  if (!(await can(user.role, "action.upload"))) {
    return { error: "Only the main admin and the person who loads stock can load the shop from a sheet." as const }
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
 * Creates a Goods from supplier bill, missing item names, books phones and
 * serials In shop, and sets piece counts.
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

  const supplierId = String(formData.get("supplierId") || "")
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, isActive: true } })
  if (!supplier) return { error: "Pick the supplier these goods were bought from." }
  if (supplier.kind === "NEIGHBOR") {
    return { error: "A neighboring shop is not a supplier carton. Use Buy from next door for that." }
  }

  // The client asked for the paid / not-paid buttons to go: "we only type in
  // whatever amount we have paid, if at all we have made any payment for that
  // particular uploaded invoice." The bill total is only known once the sheet has
  // been read, so the amount is taken here and the balance worked out below.
  const amountPaid = Math.max(0, Number(formData.get("amountPaid") || 0))
  const note = String(formData.get("notes") || "").trim()

  let sheets: Array<{ sheet: string; grid: string[][] }>
  try {
    sheets = await readWorkbookGrids(file)
  } catch {
    return { error: "We could not read that Excel file. Save it again and try one more time." }
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
        "We found no stock in that sheet. Use the PHONES, ACCESSORIES, SCREEN, and LAPTOPS tabs, and put PRODUCT NAME on the header row.",
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
  const costByProductId = new Map<string, number>()
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
      costByProductId.set(existing.id, draft.costPrice)
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
    costByProductId.set(product.id, draft.costPrice)
    productsAdded += 1
  }

  const invoiceNumber = generateDocNumber("PO")
  const purchase = await prisma.purchase.create({
    data: {
      invoiceNumber,
      supplierId: supplier.id,
      branchId: shop.id,
      userId: user.id,
      status: "RECEIVED",
      totalAmount: "0.00",
      paidAmount: "0.00",
      paymentMethod: null,
      source: UPLOAD_STOCK_SOURCE,
      sessionOpen: false,
      receivedDate: new Date(),
      originCountry: supplier.country,
      originCity: supplier.city,
      notes: ["Loaded from the opening stock Excel sheet on Upload stock.", note || null, `File: ${file.name}`]
        .filter(Boolean)
        .join(" "),
    },
  })

  const unitPayload = plan.units.map((row) => {
    const productId = productIdByKey.get(row.productKey)
    if (!productId) throw new Error("Something went wrong while saving that item. Try the upload again.")
    return {
      imei1: row.identity.value,
      serialNumber: row.identity.kind === "serial" ? row.identity.value : null,
      productId,
      branchId: shop.id,
      supplierId: supplier.id,
      purchaseId: purchase.id,
      status: "IN_STOCK" as const,
      notes: `Opening stock · ${row.sheet} · ${invoiceNumber}`,
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
  const unitCounts = new Map<string, number>()
  for (let i = 0; i < freshUnits.length; i += 200) {
    const batch = freshUnits.slice(i, i + 200)
    await prisma.$transaction(async (tx) => {
      await tx.imeiRecord.createMany({ data: batch })
      const perShop = new Map<string, number>()
      for (const row of batch) {
        const key = `${row.productId}:${row.branchId}`
        perShop.set(key, (perShop.get(key) ?? 0) + 1)
        unitCounts.set(row.productId, (unitCounts.get(row.productId) ?? 0) + 1)
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
  const pieceCounts = new Map<string, number>()
  for (const row of plan.quantities) {
    const productId = productIdByKey.get(row.productKey)
    if (!productId) continue
    await prisma.inventory.upsert({
      where: { productId_branchId: { productId, branchId: shop.id } },
      update: { quantity: row.quantity, lastStockCheck: new Date() },
      create: { productId, branchId: shop.id, quantity: row.quantity },
    })
    pieceCounts.set(productId, (pieceCounts.get(productId) ?? 0) + row.quantity)
    pieceLines += 1
  }

  await prisma.$transaction(async (tx) => {
    for (const [productId, quantity] of unitCounts) {
      await attachPurchaseLine(tx, {
        purchaseId: purchase.id,
        productId,
        quantity,
        costPrice: costByProductId.get(productId) ?? 0,
        markedPaid: false,
      })
    }
    for (const [productId, quantity] of pieceCounts) {
      await attachPurchaseLine(tx, {
        purchaseId: purchase.id,
        productId,
        quantity,
        costPrice: costByProductId.get(productId) ?? 0,
        markedPaid: false,
      })
    }
  })

  if (phonesAdded === 0 && pieceLines === 0) {
    await prisma.purchase.delete({ where: { id: purchase.id } })
    await trail(
      user.id,
      "OpeningStock",
      {
        shop: shop.name,
        file: file.name,
        productsAdded,
        phonesAdded: 0,
        phonesAlready: unitPayload.length,
        pieceLines: 0,
        note: "There was nothing new to add, so no supplier bill was saved.",
      },
      shop.id
    )
    revalidateStockViews()
    return {
      success: true,
      added: productsAdded,
      products: productsAdded,
      phones: 0,
      pieces: 0,
      skipped: unitPayload.length,
    }
  }

  const refreshed = await prisma.purchase.findUnique({
    where: { id: purchase.id },
    select: { totalAmount: true, paidAmount: true },
  })

  // Never record more paid than the bill is worth. An over-typed figure would
  // show as a negative balance on Goods from supplier and on Finance.
  const billTotal = money(refreshed?.totalAmount)
  const settled = Math.min(amountPaid, billTotal)
  const balanceOwed = Math.max(0, billTotal - settled)
  const fullyPaid = billTotal > 0 && settled >= billTotal - 0.005

  await prisma.purchase.update({
    where: { id: purchase.id },
    data: {
      paidAmount: settled.toFixed(2),
      paymentMethod: fullyPaid ? MARKED_PAID_ON_UPLOAD : settled > 0 ? "PARTIAL_PAYMENT" : "UNPAID",
      notes: [
        "Loaded from the opening stock Excel sheet on Upload stock.",
        fullyPaid
          ? "This bill was paid in full when the stock was loaded."
          : settled > 0
            ? `Paid ${settled.toFixed(2)} on upload. Still owed ${balanceOwed.toFixed(2)}.`
            : `Nothing paid on upload. Still owed ${balanceOwed.toFixed(2)}.`,
        note || null,
        `File: ${file.name}`,
      ]
        .filter(Boolean)
        .join(" "),
    },
  })

  if (settled > 0) {
    await prisma.financeEntry.create({
      data: {
        branchId: shop.id,
        account: "SUPPLIER_PAYMENTS",
        type: "EXPENSE",
        amount: settled.toFixed(2),
        reference: invoiceNumber,
        description: `Paid to ${supplier.name} on opening stock upload ${invoiceNumber}`,
      },
    })
  }

  await trail(
    user.id,
    "OpeningStock",
    {
      shop: shop.name,
      file: file.name,
      invoiceNumber,
      supplier: supplier.name,
      productsAdded,
      phonesAdded,
      phonesAlready: unitPayload.length - phonesAdded,
      pieceLines,
      submissionValue: billTotal,
      amountPaid: settled,
      balanceOwed,
    },
    shop.id
  )

  revalidateStockViews()
  revalidatePath("/purchases")
  revalidatePath("/finance")
  revalidatePath("/suppliers")

  return {
    success: true,
    added: productsAdded + phonesAdded + pieceLines,
    products: productsAdded,
    phones: phonesAdded,
    pieces: pieceLines,
    skipped: unitPayload.length - phonesAdded,
    invoiceNumber,
    purchaseId: purchase.id,
    submissionValue: billTotal,
    paidAmount: settled,
    balanceOwed,
    paid: fullyPaid,
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
  if (!plan.rows.length) return { error: "There is no phone on that sheet." }

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
  if (!plan.rows.length) return { error: "There is no shelf count on that sheet." }

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
  if (!plan.rows.length) return { error: "There is no customer on that sheet." }

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

function cleanIdentity(raw: string) {
  return raw.replace(/\s+/g, " ").trim()
}

function revalidateStockViews() {
  revalidatePath("/uploads")
  revalidatePath("/products")
  revalidatePath("/imei")
  revalidatePath("/inventory")
  revalidatePath("/dashboard")
  revalidatePath("/pos")
  revalidatePath("/purchases")
  revalidatePath("/finance")
  revalidatePath("/suppliers")
}

/** What the upload screen shows about how far the shop has got. */
export async function getUploadProgress() {
  const user = await requireUser()
  if (!(await can(user.role, "view.uploads"))) return null
  const [items, withStock, phones, customers, branches, brands, categories, products, suppliers, openBill] =
    await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.inventory.count({ where: { quantity: { gt: 0 } } }),
      prisma.imeiRecord.count({ where: { status: "IN_STOCK" } }),
      prisma.customer.count(),
      prisma.branch.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
      prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          tracking: true,
          costPrice: true,
          brand: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.supplier.findMany({
        where: { isActive: true, kind: "SUPPLIER" },
        select: { id: true, name: true, city: true, country: true },
        orderBy: { name: "asc" },
      }),
      prisma.purchase.findFirst({
        where: { userId: user.id, source: UPLOAD_STOCK_SOURCE, sessionOpen: true },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          paidAmount: true,
          paymentMethod: true,
          branchId: true,
          supplierId: true,
          branch: { select: { id: true, name: true, code: true } },
          supplier: { select: { id: true, name: true } },
          _count: { select: { items: true, imeiRecords: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ])

  const openUploadBill = openBill
    ? {
        id: openBill.id,
        invoiceNumber: openBill.invoiceNumber,
        branchId: openBill.branchId,
        supplierId: openBill.supplierId,
        shopName: openBill.branch.name,
        shopCode: openBill.branch.code,
        supplierName: openBill.supplier.name,
        submissionValue: money(openBill.totalAmount),
        paid: isMarkedPaidOnUpload(openBill.paymentMethod),
        owed: Math.max(0, money(openBill.totalAmount) - money(openBill.paidAmount)),
        lineCount: openBill._count.items,
        unitCount: openBill._count.imeiRecords,
      }
    : null

  return {
    items,
    withStock,
    phones,
    customers,
    branches,
    brands,
    categories,
    products: products.map((row) => ({
      ...row,
      costPrice: money(row.costPrice),
    })),
    suppliers,
    openUploadBill,
  }
}

/**
 * Upload an entire batch of stock from the new Upload Stock Interface.
 * Handles supplier selection/creation, multiple items, dynamic IMEIs/serials,
 * initial amount paid calculation and balance tracking.
 */
export async function batchUploadStock(payload: BatchUploadPayload): Promise<UploadResult> {
  const gate = await requireUploader()
  if ("error" in gate) return { error: gate.error }
  const { user } = gate

  if (!payload.branchId) {
    return { error: "Pick the shop these goods are going to." }
  }

  const shop = await prisma.branch.findFirst({ where: { id: payload.branchId, isActive: true } })
  if (!shop) return { error: "That shop does not exist, or it is closed." }

  if (!payload.items || payload.items.length === 0) {
    return { error: "Add at least one item before you upload." }
  }

  // 1. Resolve Supplier
  let supplierId = payload.supplierId || ""
  let supplierName = ""
  if (!supplierId && payload.newSupplierName) {
    const sName = payload.newSupplierName.trim()
    const sPhone = (payload.newSupplierPhone || "").trim() || "N/A"
    const newSupp = await prisma.supplier.create({
      data: {
        name: sName,
        phone: sPhone,
        country: payload.newSupplierCountry?.trim() || null,
        city: payload.newSupplierCity?.trim() || null,
        kind: "SUPPLIER",
      },
    })
    supplierId = newSupp.id
    supplierName = newSupp.name
  } else if (supplierId) {
    const supp = await prisma.supplier.findUnique({ where: { id: supplierId } })
    if (!supp) return { error: "We could not find that supplier." }
    supplierName = supp.name
  } else {
    return { error: "Pick a supplier, or type the name of a new one." }
  }

  // 2. Validate all items and identities (IMEIs)
  const allIdentities: string[] = []
  for (let i = 0; i < payload.items.length; i++) {
    const item = payload.items[i]
    if (item.quantity <= 0) {
      return { error: `Item #${i + 1} must have a quantity of 1 or more.` }
    }
    if (item.costPrice < 0) {
      return { error: `Item #${i + 1} cost price cannot be negative.` }
    }
    if (item.tracking === "IMEI" || item.tracking === "SERIAL") {
      const ids = (item.identities || []).map((id) => cleanIdentity(id)).filter(Boolean)
      if (ids.length !== item.quantity) {
        return {
          error: `Item #${i + 1} requires ${item.quantity} ${item.tracking === "IMEI" ? "IMEI(s)" : "serial number(s)"}, but received ${ids.length}.`,
        }
      }
      for (const id of ids) {
        if (item.tracking === "IMEI") {
          const digits = id.replace(/\D/g, "")
          if (digits.length < 14) {
            return { error: `IMEI '${id}' is too short (must be at least 14 digits).` }
          }
          allIdentities.push(digits)
        } else {
          if (id.length < 3) {
            return { error: `Serial '${id}' is too short.` }
          }
          allIdentities.push(id)
        }
      }
    }
  }

  // Check for duplicate IMEIs in input batch
  const uniqueSet = new Set(allIdentities)
  if (uniqueSet.size < allIdentities.length) {
    return { error: "The same IMEI or serial number appears more than once in what you are uploading. Remove the repeat and try again." }
  }

  // Check for existing IMEIs in database
  if (allIdentities.length > 0) {
    const existingInDb = await prisma.imeiRecord.findMany({
      where: {
        OR: [
          { imei1: { in: allIdentities } },
          { serialNumber: { in: allIdentities } },
        ],
      },
      select: { imei1: true, serialNumber: true },
    })
    if (existingInDb.length > 0) {
      const conflict = existingInDb[0].imei1 || existingInDb[0].serialNumber
      return { error: `IMEI/Serial '${conflict}' is already registered in the system.` }
    }
  }

  // 3. Process products (create new products if needed)
  const resolvedItems: Array<{
    productId: string
    productName: string
    quantity: number
    costPrice: number
    tracking: ProductTracking
    identities: string[]
    createdProduct: boolean
  }> = []

  const activeShops = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true } })

  for (const item of payload.items) {
    let prodId = item.productId || ""
    let prodName = ""
    let isNewProd = false

    if (item.productMode === "new" && item.newProduct) {
      const np = item.newProduct
      const name = cleanIdentity(np.name)
      if (!name) return { error: "Type a name for this new item." }

      const [brand, category] = await Promise.all([
        prisma.brand.findUnique({ where: { id: np.brandId } }),
        prisma.category.findUnique({ where: { id: np.categoryId } }),
      ])
      if (!brand || !category) return { error: "Pick the brand and the kind of item for this new item." }

      const sku = makeOpeningSku({
        brand: brand.name,
        name,
        storage: np.storage || "",
        condition: np.condition,
      })

      const existingProd = await prisma.product.findFirst({
        where: {
          OR: [{ sku }, { name, brandId: np.brandId, condition: np.condition, tracking: np.tracking }],
        },
      })

      if (existingProd) {
        prodId = existingProd.id
        prodName = existingProd.name
      } else {
        const created = await prisma.product.create({
          data: {
            sku,
            name,
            brandId: np.brandId,
            categoryId: np.categoryId,
            tracking: np.tracking,
            condition: np.condition,
            storage: np.storage || null,
            costPrice: np.costPrice.toFixed(2),
            minimumPrice: np.minimumPrice.toFixed(2),
            sellingPrice: np.sellingPrice.toFixed(2),
            warrantyDays: 365,
            description: "Added while loading stock",
          },
        })
        if (activeShops.length) {
          await prisma.inventory.createMany({
            data: activeShops.map((s) => ({ productId: created.id, branchId: s.id, quantity: 0 })),
          })
        }
        prodId = created.id
        prodName = created.name
        isNewProd = true
      }
    } else {
      if (!prodId) return { error: "Pick the item first." }
      const prod = await prisma.product.findUnique({ where: { id: prodId } })
      if (!prod) return { error: `Product ID ${prodId} not found.` }
      prodName = prod.name
    }

    resolvedItems.push({
      productId: prodId,
      productName: prodName,
      quantity: item.quantity,
      costPrice: item.costPrice,
      tracking: item.tracking,
      identities: (item.identities || []).map((id) => cleanIdentity(id)).filter(Boolean),
      createdProduct: isNewProd,
    })
  }

  // 4. Calculate Financials
  const invoiceNumber = payload.invoiceNumber || generateDocNumber("PO")
  const totalAmount = resolvedItems.reduce((sum, item) => sum + item.quantity * item.costPrice, 0)
  const amountPaid = Math.max(0, Number(payload.amountPaid) || 0)
  const balanceOwed = Math.max(0, totalAmount - amountPaid)
  const uploadDate = payload.uploadDate ? new Date(payload.uploadDate) : new Date()

  let totalPhones = 0
  let totalPieces = 0
  let totalProductsAdded = resolvedItems.filter((i) => i.createdProduct).length

  // 5. Atomic database transaction
  const purchase = await prisma.$transaction(async (tx) => {
    // Create Purchase (PO)
    const po = await tx.purchase.create({
      data: {
        invoiceNumber,
        supplierId,
        branchId: shop.id,
        userId: user.id,
        status: "RECEIVED",
        totalAmount: totalAmount.toFixed(2),
        paidAmount: amountPaid.toFixed(2),
        paymentMethod: amountPaid >= totalAmount ? "PAID_ON_UPLOAD" : amountPaid > 0 ? "PARTIAL_PAYMENT" : "UNPAID",
        source: UPLOAD_STOCK_SOURCE,
        sessionOpen: false,
        receivedDate: uploadDate,
        createdAt: uploadDate,
        notes: [
          `Uploaded on Stock Upload.`,
          amountPaid >= totalAmount
            ? "This bill was paid in full when the stock was loaded."
            : amountPaid > 0
              ? `Partial payment of ₦${amountPaid.toLocaleString("en-NG")} on upload. Balance: ₦${balanceOwed.toLocaleString("en-NG")}.`
              : `Unpaid invoice. Balance: ₦${balanceOwed.toLocaleString("en-NG")}.`,
          payload.notes || null,
        ]
          .filter(Boolean)
          .join(" "),
      },
    })

    // Record Finance Entry if initial payment made
    if (amountPaid > 0) {
      await tx.financeEntry.create({
        data: {
          branchId: shop.id,
          account: "SUPPLIER_PAYMENTS",
          type: "EXPENSE",
          amount: amountPaid.toFixed(2),
          reference: invoiceNumber,
          description: `Supplier payment on upload for ${invoiceNumber} (${supplierName})`,
        },
      })
    }

    // Process each item
    for (const item of resolvedItems) {
      // Purchase Item
      await tx.purchaseItem.create({
        data: {
          purchaseId: po.id,
          productId: item.productId,
          quantity: item.quantity,
          receivedQty: item.quantity,
          costPrice: item.costPrice.toFixed(2),
          totalAmount: (item.quantity * item.costPrice).toFixed(2),
        },
      })

      // Increase Shop Inventory
      await tx.inventory.upsert({
        where: { productId_branchId: { productId: item.productId, branchId: shop.id } },
        update: { quantity: { increment: item.quantity }, lastStockCheck: new Date() },
        create: { productId: item.productId, branchId: shop.id, quantity: item.quantity, lastStockCheck: new Date() },
      })

      // If IMEI / SERIAL, insert individual records
      if (item.tracking === "IMEI" || item.tracking === "SERIAL") {
        totalPhones += item.identities.length
        for (const id of item.identities) {
          const isImei = item.tracking === "IMEI"
          const imeiDigits = isImei ? id.replace(/\D/g, "") : null
          await tx.imeiRecord.create({
            data: {
              imei1: imeiDigits || id,
              serialNumber: !isImei ? id : null,
              productId: item.productId,
              branchId: shop.id,
              supplierId,
              purchaseId: po.id,
              status: "IN_STOCK",
              notes: `Uploaded via Stock Upload · ${invoiceNumber}`,
            },
          })
        }
      } else {
        totalPieces += item.quantity
      }
    }

    return po
  })

  // 6. Audit Trail
  await trail(
    user.id,
    "Purchase",
    {
      invoiceNumber,
      supplier: supplierName,
      shop: shop.name,
      totalAmount,
      amountPaid,
      balanceOwed,
      itemsCount: resolvedItems.length,
      phonesAdded: totalPhones,
      piecesAdded: totalPieces,
      action: "batch-stock-upload",
    },
    shop.id
  )

  revalidateStockViews()

  return {
    success: true,
    invoiceNumber,
    purchaseId: purchase.id,
    submissionValue: totalAmount,
    paidAmount: amountPaid,
    balanceOwed,
    paid: amountPaid >= totalAmount,
    phones: totalPhones,
    pieces: totalPieces,
    products: totalProductsAdded,
    added: totalPhones + totalPieces,
  }
}

