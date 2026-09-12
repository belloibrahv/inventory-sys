/**
 * Load one shop's opening stock workbook.
 *
 * This is the one-off day-one load, not the daily Upload stock screen. Two
 * things differ deliberately:
 *
 *  - A blank cost or selling price does not throw the whole workbook out. The
 *    row is loaded with the price at zero and listed at the end so somebody can
 *    fill it in. Holding back a shop's entire shelf over a missing accessory
 *    cost would be worse than loading it and saying so.
 *  - The bill it creates is settled in full. Opening stock is stock the shop
 *    already owns and already paid for, so leaving it unpaid would show as money
 *    owed to a supplier that is not in fact owed.
 *
 *   npx tsx scripts/import-opening-stock.ts --file "path.xlsx" --shop IWO
 *   npx tsx scripts/import-opening-stock.ts --file "path.xlsx" --shop IWO --apply
 */
import { PrismaClient } from "@prisma/client"
import XLSX from "xlsx"
import { planOpeningStock, type OpeningProductDraft } from "../src/lib/opening-stock"

const prisma = new PrismaClient()
const APPLY = process.argv.includes("--apply")

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

function productKey(d: OpeningProductDraft) {
  return [d.name.toLowerCase(), d.brand.toLowerCase(), d.condition, (d.storage || "").toLowerCase(), d.tracking].join("|")
}

const naira = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n)

async function main() {
  const file = arg("file")
  const shopCode = (arg("shop") || "").toUpperCase()
  if (!file || !shopCode) throw new Error('Need --file "path.xlsx" and --shop IWO')

  const shop = await prisma.branch.findUnique({ where: { code: shopCode } })
  if (!shop) throw new Error(`No shop with code ${shopCode}`)

  const wb = XLSX.readFile(file)
  const sheets = wb.SheetNames.map((sheet) => ({
    sheet,
    grid: (XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheet], { header: 1, defval: "", raw: false }) as string[][]).map(
      (line) => line.map((cell) => String(cell ?? "").trim())
    ),
  }))

  const plan = planOpeningStock(sheets, { allowMissingPrices: true })
  const byKey = new Map(plan.products.map((d) => [productKey(d), d]))

  const unpriced = plan.products.filter((d) => d.costPrice <= 0)
  const unsellable = plan.products.filter((d) => d.minimumPrice <= 0)

  const unitValue = plan.units.reduce((sum, u) => sum + (byKey.get(u.productKey)?.costPrice ?? 0), 0)
  const pieceValue = plan.quantities.reduce((sum, q) => sum + (byKey.get(q.productKey)?.costPrice ?? 0) * q.quantity, 0)
  const totalValue = unitValue + pieceValue
  const pieceUnits = plan.quantities.reduce((sum, q) => sum + q.quantity, 0)

  console.log(`Shop            : ${shop.name} (${shop.code})`)
  console.log(`Distinct items  : ${plan.products.length}`)
  console.log(`Serialised units: ${plan.units.length}  (phones and laptops, one IMEI or serial each)`)
  console.log(`Piece lines     : ${plan.quantities.length}  (${pieceUnits} pieces)`)
  console.log(`Opening value   : ${naira(totalValue)} at cost`)
  console.log(`Blocking problems: ${plan.problems.length}`)
  for (const p of plan.problems.slice(0, 20)) console.log("  •", p)
  if (plan.problems.length > 20) console.log(`  ... and ${plan.problems.length - 20} more`)
  console.log(`\nItems with no cost price : ${unpriced.length} (loaded at zero, fill in later)`)
  console.log(`Items with no sell price : ${unsellable.length} (loaded at zero, price before selling)`)

  // Nothing is dropped quietly: every row left out is named here.
  if (plan.skipped.length) {
    console.log(`\nRows left out (${plan.skipped.length}):`)
    for (const row of plan.skipped) console.log("  •", row)
  }

  if (plan.problems.length) throw new Error("Fix the problems above first. Nothing was loaded.")
  if (!APPLY) {
    console.log("\nDRY RUN - nothing written. Re-run with --apply.")
    return
  }

  // Brands and categories the workbook refers to.
  const brandIds = new Map((await prisma.brand.findMany()).map((r) => [r.name.toLowerCase(), r.id]))
  const categoryIds = new Map((await prisma.category.findMany()).map((r) => [r.name.toLowerCase(), r.id]))
  for (const draft of plan.products) {
    if (!brandIds.has(draft.brand.toLowerCase())) {
      const row = await prisma.brand.create({ data: { name: draft.brand } })
      brandIds.set(draft.brand.toLowerCase(), row.id)
    }
    if (!categoryIds.has(draft.category.toLowerCase())) {
      const row = await prisma.category.create({ data: { name: draft.category } })
      categoryIds.set(draft.category.toLowerCase(), row.id)
    }
  }

  // Opening stock is not a purchase from a vendor; it is what the shop already
  // holds. It is booked against a supplier of that name so the trail is honest.
  const supplier =
    (await prisma.supplier.findFirst({ where: { name: "Opening stock" } })) ??
    (await prisma.supplier.create({
      data: { name: "Opening stock", phone: "-", country: "Nigeria", city: "Ibadan", kind: "SUPPLIER" },
    }))

  const uploader =
    (await prisma.user.findFirst({ where: { role: "STOCK_UPLOADER" } })) ??
    (await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } }))
  if (!uploader) throw new Error("No stock uploader or super admin on this database to attribute the load to.")

  const productIdByKey = new Map<string, string>()
  for (const draft of plan.products) {
    const existing = await prisma.product.findUnique({ where: { sku: draft.sku } })
    const data = {
      name: draft.name,
      brandId: brandIds.get(draft.brand.toLowerCase())!,
      categoryId: categoryIds.get(draft.category.toLowerCase())!,
      condition: draft.condition,
      storage: draft.storage,
      tracking: draft.tracking,
      costPrice: draft.costPrice.toFixed(2),
      minimumPrice: draft.minimumPrice.toFixed(2),
      sellingPrice: draft.sellingPrice.toFixed(2),
    }
    const row = existing
      ? await prisma.product.update({ where: { id: existing.id }, data })
      : await prisma.product.create({ data: { sku: draft.sku, ...data } })
    productIdByKey.set(productKey(draft), row.id)
  }

  const stamp = new Date()
  const invoiceNumber = `OPEN-${shop.code}-${stamp.toISOString().slice(0, 10).replaceAll("-", "")}`
  const purchase = await prisma.purchase.create({
    data: {
      invoiceNumber,
      supplierId: supplier.id,
      branchId: shop.id,
      userId: uploader.id,
      status: "RECEIVED",
      totalAmount: totalValue.toFixed(2),
      // Settled in full: the shop already owns this stock, so it is not a payable.
      paidAmount: totalValue.toFixed(2),
      paymentMethod: "OPENING_STOCK",
      source: "UPLOAD_STOCK",
      sessionOpen: false,
      receivedDate: stamp,
      notes: `Opening stock for ${shop.name}, loaded from ${file.split("/").pop()}. Already owned, so the bill is settled.`,
    },
  })

  // Serialised units: one IMEI or serial row each, and the shelf count follows.
  let phones = 0
  const perProduct = new Map<string, number>()
  for (const unit of plan.units) {
    const productId = productIdByKey.get(unit.productKey)
    if (!productId) continue
    const value = unit.identity.value
    const already = await prisma.imeiRecord.findFirst({
      where: { OR: [{ imei1: value }, { serialNumber: value }] },
      select: { id: true },
    })
    if (already) continue
    await prisma.imeiRecord.create({
      data: {
        imei1: value,
        serialNumber: unit.identity.kind === "serial" ? value : null,
        productId,
        branchId: shop.id,
        supplierId: supplier.id,
        purchaseId: purchase.id,
        status: "IN_STOCK",
        notes: `Opening stock ${invoiceNumber}`,
      },
    })
    perProduct.set(productId, (perProduct.get(productId) ?? 0) + 1)
    phones += 1
  }

  for (const [productId, count] of perProduct) {
    await prisma.inventory.upsert({
      where: { productId_branchId: { productId, branchId: shop.id } },
      update: { quantity: { increment: count } },
      create: { productId, branchId: shop.id, quantity: count },
    })
  }

  // Piece counts: the sheet is the truth for these, so the shelf is set, not added to.
  let pieceLines = 0
  const perPieceProduct = new Map<string, number>()
  for (const line of plan.quantities) {
    const productId = productIdByKey.get(line.productKey)
    if (!productId) continue
    perPieceProduct.set(productId, (perPieceProduct.get(productId) ?? 0) + line.quantity)
    pieceLines += 1
  }
  for (const [productId, quantity] of perPieceProduct) {
    await prisma.inventory.upsert({
      where: { productId_branchId: { productId, branchId: shop.id } },
      update: { quantity, lastStockCheck: stamp },
      create: { productId, branchId: shop.id, quantity },
    })
  }

  // One bill line per item, so Goods from supplier reconciles against the shelf.
  for (const [productId, count] of [...perProduct, ...perPieceProduct]) {
    const draft = plan.products.find((d) => productIdByKey.get(productKey(d)) === productId)
    const cost = draft?.costPrice ?? 0
    const existing = await prisma.purchaseItem.findFirst({ where: { purchaseId: purchase.id, productId } })
    if (existing) {
      await prisma.purchaseItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + count,
          receivedQty: existing.receivedQty + count,
          totalAmount: (Number(existing.totalAmount) + cost * count).toFixed(2),
        },
      })
    } else {
      await prisma.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          productId,
          quantity: count,
          receivedQty: count,
          costPrice: cost.toFixed(2),
          totalAmount: (cost * count).toFixed(2),
        },
      })
    }
  }

  console.log(`\nLoaded into ${shop.name}:`)
  console.log(`  bill      ${invoiceNumber} for ${naira(totalValue)}, settled in full`)
  console.log(`  items     ${plan.products.length}`)
  console.log(`  phones    ${phones} booked In shop by IMEI or serial`)
  console.log(`  pieces    ${pieceLines} lines set on the shelf`)
  if (unpriced.length) console.log(`\n  ${unpriced.length} items still need a cost price.`)
  if (unsellable.length) console.log(`  ${unsellable.length} items still need a selling price before they are sold.`)
}

main()
  .catch((error) => {
    console.error("\n" + (error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
