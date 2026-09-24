"use server"

import { revalidatePath } from "next/cache"
import { ProductCondition, ProductTracking } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { recordMovement, setStock } from "@/lib/concurrency"
import { requireUser } from "@/lib/session"
import { can } from "@/lib/permissions"
import { readTableFile, readWorkbookGrids } from "@/lib/table-file"
import { makeOpeningSku, planOpeningStock } from "@/lib/opening-stock"
import { planCustomers, planImeis, planStock, type CatalogItem, type ShopRef } from "@/lib/upload-plan"
import {
  OPENING_STOCK_METHOD,
  OPENING_STOCK_SUPPLIER_OPTION,
  OPENING_STOCK_SUPPLIER_PHONE,
  UPLOAD_STOCK_SOURCE,
  attachPurchaseLine,
  isMarkedPaidOnUpload,
} from "@/lib/upload-purchase"
import { generateDocNumber, money } from "@/lib/utils"
import { mapBillCondition, normalizeStorage } from "@/lib/item-specs"
import { displayPartyName } from "@/lib/party-key"
import { ensureOpeningStockSupplier, findDuplicateSupplier } from "@/lib/supplier-identity"
import { resolveWritableShopId, viewBranchFilter } from "@/lib/branch-scope"

/**
 * Loading the shop system from a sheet or by hand.
 *
 * Manual adds and Excel loads create a real Goods from supplier bill (PO-…)
 * so accountants can see supplier, submission value, and paid or not paid.
 */

const MAX_BYTES = 25_000_000
const MAX_ROWS = 20_000
const WRITE_CHUNK = 400

function chunks<T>(rows: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

export type UploadResult = {
  error?: string
  success?: boolean
  added?: number
  skipped?: number
  /** How many IMEI/serial repeats were folded into one entry. */
  duplicates?: number
  products?: number
  phones?: number
  pieces?: number
  /** Hard blockers when error is set; soft notices when success is set. */
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
  /** Model name only. Condition and storage are their own fields. */
  productName?: string
  brandId?: string
  categoryId?: string
  condition?: string
  storage?: string
  minimumPrice?: number
  sellingPrice?: number
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
  if (file.size > MAX_BYTES) return { error: "That file is too big. Use a file under 25 MB." }
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
  if (file.size > MAX_BYTES) return { error: "That file is too big. Use a file under 25 MB." }

  const branchId = String(formData.get("branchId") || "")
  const shopGate = await resolveWritableShopId(user, branchId)
  if ("error" in shopGate) return { error: shopGate.error }
  const shop = await prisma.branch.findFirst({ where: { id: shopGate.shopId, isActive: true } })
  if (!shop) return { error: "Pick the shop this file belongs to: Iwo Road, Bodija, or Challenge." }

  // One opening stock per shop. Once it exists, the count sheet on Correct &
  // close opening stock is how it changes, so a second workbook cannot double it.
  const opening = await prisma.openingStock.findUnique({ where: { branchId: shop.id }, select: { status: true } })
  if (opening) {
    return {
      error:
        opening.status === "OPEN"
          ? `${shop.name} already has opening stock. Correct it with the count sheet on Correct & close opening stock.`
          : `${shop.name}'s opening stock is closed. New goods go on a Supplier bill.`,
    }
  }

  const note = String(formData.get("notes") || "").trim()
  const newSupplierName = String(formData.get("newSupplierName") || "").trim()
  const newSupplierPhone = String(formData.get("newSupplierPhone") || "").trim()
  const newSupplierCity = String(formData.get("newSupplierCity") || "").trim()
  const newSupplierCountry = String(formData.get("newSupplierCountry") || "").trim()
  let supplierId = String(formData.get("supplierId") || "").trim()
  if (supplierId === "__new__") supplierId = ""

  let supplier =
    supplierId && supplierId !== OPENING_STOCK_SUPPLIER_OPTION
      ? await prisma.supplier.findFirst({ where: { id: supplierId, isActive: true } })
      : null

  if (supplierId && supplierId !== OPENING_STOCK_SUPPLIER_OPTION && !supplier && !newSupplierName) {
    return { error: "That supplier is not on the list, or it is locked. Pick Opening Stock, pick another name, or add a new supplier." }
  }

  // Default house when the real supplier is not known yet. No phone needed.
  if (supplierId === OPENING_STOCK_SUPPLIER_OPTION || (!supplierId && !newSupplierName)) {
    supplier = await ensureOpeningStockSupplier()
  }

  if (newSupplierName) {
    if (!displayPartyName(newSupplierName)) {
      return { error: "Type the new supplier name, or pick Opening Stock from the list." }
    }
    const phoneToStore = newSupplierPhone || OPENING_STOCK_SUPPLIER_PHONE
    const clash = await findDuplicateSupplier({ name: newSupplierName, phone: newSupplierPhone || undefined })
    if (clash) return clash
    supplier = await prisma.supplier.create({
      data: {
        name: displayPartyName(newSupplierName),
        phone: phoneToStore,
        city: newSupplierCity || null,
        country: newSupplierCountry || null,
        kind: "SUPPLIER",
      },
    })
    revalidatePath("/suppliers")
  }

  if (!supplier) {
    return {
      error: "Pick Opening Stock when you do not know the house yet, pick a supplier from the list, or type a new supplier name.",
    }
  }
  if (supplier.kind === "NEIGHBOR") {
    return { error: "A neighboring shop is not a supplier carton. Use Buy from next door for that." }
  }

  let sheets: Array<{ sheet: string; grid: string[][] }>
  try {
    sheets = await readWorkbookGrids(file)
  } catch {
    return { error: "We could not read that Excel file. Save it again and try one more time." }
  }

  const plan = planOpeningStock(sheets, { allowMissingPrices: true })
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

  const [brands, categories] = await Promise.all([
    prisma.brand.findMany(),
    prisma.category.findMany(),
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
        warrantyDays: 0,
        description: `Opening stock · ${draft.category}`,
      },
    })
    // Stock for this shop only. Other shops do not get a shelf row from this upload.
    await prisma.inventory.create({
      data: { productId: product.id, branchId: shop.id, quantity: 0 },
    })
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
      paymentMethod: OPENING_STOCK_METHOD,
      source: UPLOAD_STOCK_SOURCE,
      sessionOpen: false,
      receivedDate: new Date(),
      originCountry: supplier.country,
      originCity: supplier.city,
      notes: [
        "Loaded from the opening stock Excel sheet. This is the shop's opening stock value. It is not a supplier bill to pay.",
        note || null,
        `File: ${file.name}`,
      ]
        .filter(Boolean)
        .join(" "),
    },
  })

  await prisma.openingStock.create({ data: { branchId: shop.id, purchaseId: purchase.id } })

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
        await recordMovement(tx, {
          productId,
          branchId,
          quantity: count,
          move: { kind: "RECEIVED", reference: invoiceNumber, userId: user.id },
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
    await setStock(prisma, {
      productId,
      branchId: shop.id,
      quantity: row.quantity,
      lastStockCheck: true,
      move: { kind: "OPENING", reference: invoiceNumber, userId: user.id },
    })
    pieceCounts.set(productId, (pieceCounts.get(productId) ?? 0) + row.quantity)
    pieceLines += 1
  }

  const namesOnlyIds = [...new Set(productIdByKey.values())].filter(
    (productId) => !unitCounts.has(productId) && !pieceCounts.has(productId)
  )

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
    for (const productId of namesOnlyIds) {
      await attachPurchaseLine(tx, {
        purchaseId: purchase.id,
        productId,
        quantity: 0,
        costPrice: costByProductId.get(productId) ?? 0,
        markedPaid: false,
      })
    }
  })

  if (phonesAdded === 0 && pieceLines === 0 && namesOnlyIds.length === 0) {
    await prisma.openingStock.deleteMany({ where: { purchaseId: purchase.id } })
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
    const softNotes = [...plan.skipped]
    if (unitPayload.length > 0) {
      softNotes.push(
        `${unitPayload.length} IMEI or serial number(s) were already on the system. Each stays as one entry and was not doubled. Staff can edit later on Correct and close opening stock or Phones and items.`
      )
    }
    return {
      success: true,
      added: productsAdded,
      products: productsAdded,
      phones: 0,
      pieces: 0,
      skipped: unitPayload.length,
      duplicates: plan.skipped.filter((row) => row.includes("twice") || row.includes("counted once")).length,
      problems: softNotes.length ? softNotes.slice(0, 40) : undefined,
    }
  }

  const refreshed = await prisma.purchase.findUnique({
    where: { id: purchase.id },
    select: { totalAmount: true },
  })

  // Opening stock is an independent value. paidAmount matches the value so the
  // books never treat it as money owed to a supplier, and no payment is posted.
  const billTotal = money(refreshed?.totalAmount)

  await prisma.purchase.update({
    where: { id: purchase.id },
    data: {
      paidAmount: billTotal.toFixed(2),
      paymentMethod: OPENING_STOCK_METHOD,
      notes: [
        "Loaded from the opening stock Excel sheet. This is the shop's opening stock value. It is not a supplier bill to pay.",
        note || null,
        `File: ${file.name}`,
      ]
        .filter(Boolean)
        .join(" "),
    },
  })

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
      amountPaid: 0,
      balanceOwed: 0,
    },
    shop.id
  )

  revalidateStockViews()
  revalidatePath("/purchases")
  revalidatePath("/finance")
  revalidatePath("/suppliers")

  const alreadyCount = unitPayload.length - phonesAdded
  const softNotes = [...plan.skipped]
  if (alreadyCount > 0) {
    softNotes.push(
      `${alreadyCount} IMEI or serial number(s) were already on the system. Each stays as one entry and was not doubled. Staff can edit later on Correct and close opening stock or Phones and items.`
    )
  }
  if (namesOnlyIds.length > 0) {
    softNotes.push(
      `${namesOnlyIds.length} item name(s) were booked without an IMEI, serial, or piece count. Add those details on Correct and close opening stock.`
    )
  }

  return {
    success: true,
    added: productsAdded + phonesAdded + pieceLines + namesOnlyIds.length,
    products: productsAdded,
    phones: phonesAdded,
    pieces: pieceLines,
    skipped: alreadyCount,
    duplicates: plan.skipped.filter((row) => row.includes("twice") || row.includes("counted once")).length,
    problems: softNotes.length ? softNotes.slice(0, 40) : undefined,
    invoiceNumber,
    purchaseId: purchase.id,
    submissionValue: billTotal,
    paidAmount: 0,
    balanceOwed: 0,
    paid: true,
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
        await recordMovement(tx, {
          productId,
          branchId,
          quantity: count,
          move: { kind: "RECEIVED", reference: name, userId: user.id },
        })
      }
    })
    added += batch.length
  }

  const softNotes = [...(plan.notices ?? [])]
  if (already.size > 0) {
    softNotes.push(
      `${already.size} IMEI(s) were already on the system and were left as one entry each (not doubled). Staff can edit later on Phones and items.`
    )
  }

  await trail(
    user.id,
    "IMEIRecord",
    { added, alreadyOnSystem: already.size, duplicatesInSheet: plan.notices?.length ?? 0, file: name },
    user.branchId
  )
  revalidatePath("/imei")
  revalidatePath("/inventory")
  revalidatePath("/uploads")
  revalidatePath("/dashboard")
  return {
    success: true,
    added,
    skipped: already.size,
    duplicates: plan.notices?.length ?? 0,
    problems: softNotes.length ? softNotes.slice(0, 40) : undefined,
  }
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
    const shopGate = await resolveWritableShopId(user, row.branchId)
    if ("error" in shopGate) {
      return { error: `A line for another shop was refused: ${shopGate.error}` }
    }
    await setStock(prisma, {
      productId: row.productId,
      branchId: shopGate.shopId,
      quantity: row.quantity,
      lastStockCheck: true,
      move: { kind: "HAND_CORRECTION", reference: name, userId: user.id },
    })
    if (row.minStock !== null) {
      await prisma.inventory.update({
        where: { productId_branchId: { productId: row.productId, branchId: shopGate.shopId } },
        data: { minStock: row.minStock },
      })
    }
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

function billLineName(item: BatchUploadItem) {
  return cleanIdentity(item.productName || item.newProduct?.name || "")
}

function billLineCondition(item: BatchUploadItem) {
  return mapBillCondition(item.condition || item.newProduct?.condition || "")
}

function billLineStorage(item: BatchUploadItem) {
  return normalizeStorage(item.storage || item.newProduct?.storage || "") || null
}

async function resolveBillProduct(
  item: BatchUploadItem,
  targetShopId: string
): Promise<{ productId: string; productName: string; createdProduct: boolean } | { error: string }> {
  const name = billLineName(item)
  const condition = billLineCondition(item)
  const storage = billLineStorage(item)
  const brandId = item.brandId || item.newProduct?.brandId || ""
  const categoryId = item.categoryId || item.newProduct?.categoryId || ""
  const tracking = item.tracking || item.newProduct?.tracking || "IMEI"
  const costPrice = Number(item.costPrice || item.newProduct?.costPrice || 0)
  const minimumPrice = Math.max(
    Number(item.minimumPrice || item.newProduct?.minimumPrice || 0),
    costPrice
  )
  const sellingPrice = Math.max(
    Number(item.sellingPrice || item.newProduct?.sellingPrice || 0),
    minimumPrice,
    costPrice
  )

  if (name && condition) {
    const existing =
      (brandId
        ? await prisma.product.findFirst({
            where: { name, brandId, condition, tracking, storage },
          })
        : await prisma.product.findFirst({
            where: { name, condition, tracking, storage },
          })) ||
      (item.productId
        ? await prisma.product.findUnique({ where: { id: item.productId } })
        : null)

    if (existing && existing.name.toLowerCase() === name.toLowerCase() && existing.condition === condition) {
      const sameStorage = (existing.storage || null) === storage
      if (sameStorage) {
        return { productId: existing.id, productName: existing.name, createdProduct: false }
      }
    }

    if (!brandId || !categoryId) {
      return { error: "Pick the item name, then pick the brand if this name is new." }
    }

    const [brand, category] = await Promise.all([
      prisma.brand.findUnique({ where: { id: brandId } }),
      prisma.category.findUnique({ where: { id: categoryId } }),
    ])
    if (!brand || !category) {
      return { error: "Pick the brand and the kind of item." }
    }

    const sku = makeOpeningSku({
      brand: brand.name,
      name,
      storage: storage || "",
      condition,
    })

    const bySku = await prisma.product.findUnique({ where: { sku } })
    if (bySku) {
      return { productId: bySku.id, productName: bySku.name, createdProduct: false }
    }

    const created = await prisma.product.create({
      data: {
        sku,
        name,
        brandId,
        categoryId,
        tracking,
        condition,
        storage,
        costPrice: costPrice.toFixed(2),
        minimumPrice: minimumPrice.toFixed(2),
        sellingPrice: sellingPrice.toFixed(2),
        warrantyDays: 0,
        description: "Added while loading stock",
      },
    })
    await prisma.inventory.create({
      data: { productId: created.id, branchId: targetShopId, quantity: 0 },
    })
    return { productId: created.id, productName: created.name, createdProduct: true }
  }

  if (item.productId) {
    const prod = await prisma.product.findUnique({ where: { id: item.productId } })
    if (!prod) return { error: "That item is not on the list." }
    return { productId: prod.id, productName: prod.name, createdProduct: false }
  }

  return { error: "Type the name of the item, then pick condition and storage." }
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
  revalidatePath("/opening-stock")
  revalidatePath("/uploads/opening-stock")
  revalidatePath("/reports")
  revalidatePath("/audit/books")
}

/** What the upload screen shows about how far the shop has got. */
export async function getUploadProgress() {
  const user = await requireUser()
  if (!(await can(user.role, "view.uploads"))) return null
  const shopScope = await viewBranchFilter(user)
  const [items, withStock, phones, customers, branches, brands, categories, products, suppliers, openBill] =
    await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.inventory.count({ where: { quantity: { gt: 0 }, ...(shopScope ? { branchId: shopScope } : {}) } }),
      prisma.imeiRecord.count({ where: { status: "IN_STOCK", ...(shopScope ? { branchId: shopScope } : {}) } }),
      prisma.customer.count({ where: shopScope ? { branchId: shopScope } : undefined }),
      prisma.branch.findMany({
        where: {
          isActive: true,
          ...(shopScope ? { id: shopScope } : {}),
        },
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
          condition: true,
          storage: true,
          costPrice: true,
          minimumPrice: true,
          sellingPrice: true,
          brandId: true,
          categoryId: true,
          brand: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.supplier.findMany({
        where: { isActive: true, kind: "SUPPLIER" },
        select: { id: true, name: true, phone: true, city: true, country: true },
        orderBy: { name: "asc" },
      }),
      prisma.purchase.findFirst({
        where: {
          userId: user.id,
          source: UPLOAD_STOCK_SOURCE,
          sessionOpen: true,
          ...(shopScope ? { branchId: shopScope } : {}),
        },
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

  const openingHouse = await ensureOpeningStockSupplier()
  const suppliersForForm = [
    {
      id: openingHouse.id,
      name: openingHouse.name,
      phone: openingHouse.phone,
      city: openingHouse.city,
      country: openingHouse.country,
    },
    ...suppliers.filter((row) => row.id !== openingHouse.id),
  ]

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
      minimumPrice: money(row.minimumPrice),
      sellingPrice: money(row.sellingPrice),
    })),
    suppliers: suppliersForForm,
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

  const shopGate = await resolveWritableShopId(user, payload.branchId)
  if ("error" in shopGate) return { error: shopGate.error }
  const shop = await prisma.branch.findFirst({ where: { id: shopGate.shopId, isActive: true } })
  if (!shop) return { error: "That shop does not exist, or it is closed." }

  if (!payload.items || payload.items.length === 0) {
    return { error: "Add at least one item before you upload." }
  }

  // 1. Resolve Supplier
  let supplierId = payload.supplierId || ""
  let supplierName = ""
  if (!supplierId && payload.newSupplierName) {
    const sName = displayPartyName(payload.newSupplierName)
    const sPhone = (payload.newSupplierPhone || "").trim()
    if (!sPhone) return { error: "Type the new supplier phone number." }
    const clash = await findDuplicateSupplier({ name: sName, phone: sPhone })
    if (clash) return clash
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

  // 2. Validate items. Duplicate IMEI/serial in this upload or already on the
  // system is kept as one entry — the upload continues; staff can edit later.
  const softNotes: string[] = []
  const seenInUpload = new Set<string>()
  const normalizedItems: typeof payload.items = []

  for (let i = 0; i < payload.items.length; i++) {
    const item = payload.items[i]
    if (item.quantity <= 0) {
      return { error: `Item #${i + 1} must have a quantity of 1 or more.` }
    }
    if (item.costPrice < 0) {
      return { error: `Item #${i + 1} cost price cannot be negative.` }
    }

    if (item.tracking !== "IMEI" && item.tracking !== "SERIAL") {
      normalizedItems.push({ ...item })
      continue
    }

    const rawIds = (item.identities || []).map((id) => cleanIdentity(id)).filter(Boolean)
    if (rawIds.length === 0) {
      return {
        error: `Item #${i + 1} needs ${item.tracking === "IMEI" ? "IMEI" : "serial"} numbers for the units you are loading.`,
      }
    }

    const uniqueIds: string[] = []
    for (const id of rawIds) {
      let value = id
      if (item.tracking === "IMEI") {
        const digits = id.replace(/\D/g, "")
        if (digits.length < 14) {
          return { error: `IMEI '${id}' is too short (must be at least 14 digits).` }
        }
        value = digits
      } else if (id.length < 3) {
        return { error: `Serial '${id}' is too short.` }
      }

      if (seenInUpload.has(value)) {
        softNotes.push(
          `Item #${i + 1}: ${value} appears more than once in this upload, so it is counted once.`
        )
        continue
      }
      seenInUpload.add(value)
      uniqueIds.push(value)
    }

    if (!uniqueIds.length) {
      softNotes.push(`Item #${i + 1}: every number was a duplicate of another line, so this line was skipped.`)
      continue
    }

    normalizedItems.push({
      ...item,
      identities: uniqueIds,
      quantity: uniqueIds.length,
    })
  }

  if (!normalizedItems.length) {
    return {
      error: "After removing duplicate numbers, there was nothing new to load. Check the IMEIs or serials.",
      problems: softNotes.slice(0, 40),
    }
  }

  const allIdentities = normalizedItems.flatMap((item) =>
    item.tracking === "IMEI" || item.tracking === "SERIAL" ? item.identities || [] : []
  )

  const alreadyOnSystem = new Set<string>()
  if (allIdentities.length > 0) {
    for (const batch of chunks(allIdentities, WRITE_CHUNK)) {
      const existingInDb = await prisma.imeiRecord.findMany({
        where: {
          OR: [{ imei1: { in: batch } }, { serialNumber: { in: batch } }],
        },
        select: { imei1: true, serialNumber: true },
      })
      for (const row of existingInDb) {
        if (row.imei1) alreadyOnSystem.add(row.imei1)
        if (row.serialNumber) alreadyOnSystem.add(row.serialNumber)
      }
    }
  }

  const itemsToLoad: typeof normalizedItems = []
  let skippedExisting = 0
  for (let i = 0; i < normalizedItems.length; i++) {
    const item = normalizedItems[i]
    if (item.tracking !== "IMEI" && item.tracking !== "SERIAL") {
      itemsToLoad.push(item)
      continue
    }
    const fresh = (item.identities || []).filter((id) => !alreadyOnSystem.has(id))
    const dropped = (item.identities || []).length - fresh.length
    if (dropped > 0) skippedExisting += dropped
    if (!fresh.length) continue
    itemsToLoad.push({ ...item, identities: fresh, quantity: fresh.length })
  }
  if (skippedExisting > 0) {
    softNotes.push(
      `${skippedExisting} IMEI or serial number(s) were already on the system. Each stays as one entry and was not doubled. Staff can edit stock later on Phones and items or Correct and close opening stock.`
    )
  }

  if (!itemsToLoad.length) {
    return {
      success: true,
      added: 0,
      phones: 0,
      pieces: 0,
      skipped: skippedExisting || allIdentities.length,
      duplicates: softNotes.filter((n) => n.includes("more than once") || n.includes("duplicate")).length,
      problems: softNotes.slice(0, 40),
    }
  }

  // Replace payload items with the deduped list for the rest of the upload.
  payload = { ...payload, items: itemsToLoad }

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

  for (let i = 0; i < payload.items.length; i++) {
    const item = payload.items[i]
    const resolved = await resolveBillProduct(item, shop.id)
    if ("error" in resolved) {
      return { error: `Item line #${i + 1}: ${resolved.error}` }
    }

    resolvedItems.push({
      productId: resolved.productId,
      productName: resolved.productName,
      quantity: item.quantity,
      costPrice: item.costPrice,
      tracking: item.tracking,
      identities: (item.identities || []).map((id) => cleanIdentity(id)).filter(Boolean),
      createdProduct: resolved.createdProduct,
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
      await recordMovement(tx, {
        productId: item.productId,
        branchId: shop.id,
        quantity: item.quantity,
        move: { kind: "RECEIVED", reference: invoiceNumber, userId: user.id },
      })

      // If IMEI / SERIAL, insert individual records
      if (item.tracking === "IMEI" || item.tracking === "SERIAL") {
        totalPhones += item.identities.length
        const unitRows = item.identities.map((id) => {
          const isImei = item.tracking === "IMEI"
          const imeiDigits = isImei ? id.replace(/\D/g, "") : null
          return {
            imei1: imeiDigits || id,
            serialNumber: !isImei ? id : null,
            productId: item.productId,
            branchId: shop.id,
            supplierId,
            purchaseId: po.id,
            status: "IN_STOCK" as const,
            notes: `Uploaded via Stock Upload · ${invoiceNumber}`,
          }
        })
        for (const batch of chunks(unitRows, WRITE_CHUNK)) {
          await tx.imeiRecord.createMany({ data: batch })
        }
      } else {
        totalPieces += item.quantity
      }
    }

    return po
  }, { timeout: 180_000, maxWait: 20_000 })

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
    skipped: skippedExisting,
    duplicates: softNotes.filter((n) => n.includes("more than once") || n.includes("duplicate")).length,
    problems: softNotes.length ? softNotes.slice(0, 40) : undefined,
  }
}

