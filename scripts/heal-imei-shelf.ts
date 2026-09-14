/**
 * Make shelf counts match phones that are really In shop.
 *
 * For every IMEI/serial item at every shop, set Inventory.quantity to the number
 * of ImeiRecord rows still status IN_STOCK. That repairs the drift from older
 * sales that marked a phone Sold without taking one off the shelf number.
 *
 *   npx tsx scripts/heal-imei-shelf.ts            # dry run
 *   npx tsx scripts/heal-imei-shelf.ts --apply    # write the fixes
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const APPLY = process.argv.includes("--apply")

async function main() {
  const tracked = await prisma.product.findMany({
    where: { tracking: { in: ["IMEI", "SERIAL"] } },
    select: { id: true, name: true, sku: true },
  })
  const branches = await prisma.branch.findMany({ select: { id: true, code: true, name: true } })

  const inShop = await prisma.imeiRecord.groupBy({
    by: ["productId", "branchId"],
    where: { status: "IN_STOCK" },
    _count: { _all: true },
  })
  const want = new Map(inShop.map((row) => [`${row.productId}:${row.branchId}`, row._count._all]))

  const shelves = await prisma.inventory.findMany({
    where: { productId: { in: tracked.map((row) => row.id) } },
    select: { id: true, productId: true, branchId: true, quantity: true },
  })
  const have = new Map(shelves.map((row) => [`${row.productId}:${row.branchId}`, row]))

  type Fix = {
    key: string
    product: string
    shop: string
    before: number
    after: number
  }
  const fixes: Fix[] = []

  for (const product of tracked) {
    for (const branch of branches) {
      const key = `${product.id}:${branch.id}`
      const after = want.get(key) ?? 0
      const row = have.get(key)
      const before = row?.quantity ?? 0
      if (before === after && (after > 0 || row)) continue
      if (before === 0 && after === 0 && !row) continue
      fixes.push({
        key,
        product: `${product.name} (${product.sku})`,
        shop: `${branch.code} · ${branch.name}`,
        before,
        after,
      })
    }
  }

  console.log(APPLY ? "APPLYING shelf heal\n" : "DRY RUN — nothing written\n")
  if (!fixes.length) {
    console.log("Every tracked shelf already matches its In-shop IMEI count.")
    return
  }

  console.log(`Lines to fix: ${fixes.length}\n`)
  for (const fix of fixes.slice(0, 40)) {
    console.log(`  ${fix.before.toString().padStart(4)} → ${fix.after.toString().padStart(4)}  ${fix.shop}  ${fix.product}`)
  }
  if (fixes.length > 40) console.log(`  … and ${fixes.length - 40} more`)

  if (!APPLY) {
    console.log("\nRe-run with --apply to write these shelf numbers.")
    return
  }

  for (const fix of fixes) {
    const [productId, branchId] = fix.key.split(":")
    await prisma.inventory.upsert({
      where: { productId_branchId: { productId, branchId } },
      update: { quantity: fix.after, lastStockCheck: new Date() },
      create: { productId, branchId, quantity: fix.after, lastStockCheck: new Date() },
    })
  }

  console.log(`\nDone. ${fixes.length} shelf lines now match In-shop IMEI counts.`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
