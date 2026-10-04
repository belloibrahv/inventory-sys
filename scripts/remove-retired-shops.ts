/**
 * Removes the three demo shops that were never Abu Twins shops — Computer
 * Village HQ (LOS), Wuse II (ABJ) and Trans Amadi (PHC) — from the system for
 * good.
 *
 *   npx tsx scripts/remove-retired-shops.ts            reports, changes nothing
 *   npx tsx scripts/remove-retired-shops.ts --apply    removes them
 *
 * A shop nothing points at is simply deleted. A shop that still holds records
 * has them filed under the Ibadan shop that took its place first, so no sale,
 * phone or naira is lost and the business totals do not change:
 *
 *   Computer Village HQ (LOS) -> Iwo Road (IWO)
 *   Wuse II (ABJ)             -> Bodija (BOD)
 *   Trans Amadi (PHC)         -> Challenge (CHL)
 *
 * Opening stock and day closes allow one per shop (per day, for closes). If the
 * Ibadan shop already has its own, the two cannot be merged by a script, so the
 * run stops and names them instead of guessing. Each shop is removed in one
 * transaction: it goes completely, or nothing about it changes.
 */
import { PrismaClient, type Prisma } from "@prisma/client"

const prisma = new PrismaClient()
const APPLY = process.argv.includes("--apply")

const MOVES: Record<string, string> = { LOS: "IWO", ABJ: "BOD", PHC: "CHL" }

type Tx = Prisma.TransactionClient
type Table = { label: string; count: (db: Tx, id: string) => Promise<number>; move: (db: Tx, from: string, to: string) => Promise<unknown> }
/** What every one of these tables can do with its shop column. */
type FiledByShop = {
  count(args: { where: { branchId: string } }): Promise<number>
  updateMany(args: { where: { branchId: string }; data: { branchId: string } }): Promise<unknown>
}
const filed = (db: Tx, model: string) => db[model as keyof Tx] as unknown as FiledByShop

/** Every table that files a record under a shop, bar the three handled by hand below. */
const TABLES: Table[] = [
  ["phones", "imeiRecord"],
  ["stock ledger", "stockMovement"],
  ["sales", "sale"],
  ["supplier bills", "purchase"],
  ["customers", "customer"],
  ["returns", "stockReturn"],
  ["swaps", "swap"],
  ["repairs", "repair"],
  ["expenses", "expense"],
  ["money entries", "financeEntry"],
  ["bank accounts", "bankAccount"],
  ["cash to bank", "cashDeposit"],
  ["returns to suppliers", "supplierReturnLine"],
  ["stock counts", "reconciliation"],
  ["goods on the way", "incomingLot"],
  ["parked sales", "parkedSale"],
  ["price approvals", "priceRequest"],
  ["staff", "user"],
  ["activity trail", "auditLog"],
].map(([label, model]) => ({
  label,
  count: (db, id) => filed(db, model).count({ where: { branchId: id } }),
  move: (db, from, to) => filed(db, model).updateMany({ where: { branchId: from }, data: { branchId: to } }),
}))

async function main() {
  const shops = await prisma.branch.findMany({ select: { id: true, code: true, name: true } })
  const byCode = new Map(shops.map((shop) => [shop.code, shop]))
  let blocked = false

  for (const [fromCode, toCode] of Object.entries(MOVES)) {
    const from = byCode.get(fromCode)
    if (!from) {
      console.log(`${fromCode}: already gone.`)
      continue
    }
    const to = byCode.get(toCode)
    if (!to) {
      console.log(`${from.name} (${fromCode}): there is no ${toCode} shop to take its records. Skipped.`)
      blocked = true
      continue
    }
    console.log(`\n${from.name} (${fromCode})  ->  ${to.name} (${toCode})`)

    // What still points at this shop.
    const found: Array<[string, number]> = []
    for (const table of TABLES) found.push([table.label, await table.count(prisma, from.id)])
    const [stockLines, openingStock, sentOut, sentIn, closes] = await Promise.all([
      prisma.inventory.findMany({ where: { branchId: from.id } }),
      prisma.openingStock.findUnique({ where: { branchId: from.id }, select: { id: true } }),
      prisma.stockTransfer.count({ where: { fromBranchId: from.id } }),
      prisma.stockTransfer.count({ where: { toBranchId: from.id } }),
      prisma.dayClose.findMany({ where: { branchId: from.id }, select: { businessDate: true } }),
    ])
    found.push(["stock lines", stockLines.length], ["shop to shop (sent / received)", sentOut + sentIn], ["day closes", closes.length])
    if (openingStock) found.push(["opening stock", 1])
    for (const [label, n] of found) if (n) console.log(`  ${label}: ${n}`)
    if (found.every(([, n]) => n === 0)) console.log("  nothing points at this shop")

    // The two that cannot be merged.
    const clashes: string[] = []
    if (openingStock && (await prisma.openingStock.findUnique({ where: { branchId: to.id }, select: { id: true } }))) {
      clashes.push(`both ${from.name} and ${to.name} have an opening stock record`)
    }
    if (closes.length) {
      const taken = await prisma.dayClose.findMany({
        where: { branchId: to.id, businessDate: { in: closes.map((row) => row.businessDate) } },
        select: { businessDate: true },
      })
      if (taken.length) clashes.push(`both shops closed the day on ${taken.map((row) => row.businessDate).join(", ")}`)
    }
    if (clashes.length) {
      for (const clash of clashes) console.log(`  STOP  ${clash}. Settle this by hand; this shop was left as it is.`)
      blocked = true
      continue
    }

    if (!APPLY) {
      console.log("  would be removed (run with --apply)")
      continue
    }

    await prisma.$transaction(
      async (tx) => {
        for (const table of TABLES) await table.move(tx, from.id, to.id)
        // One stock line per item per shop: add onto the Ibadan line when there is one.
        for (const row of stockLines) {
          const existing = await tx.inventory.findUnique({
            where: { productId_branchId: { productId: row.productId, branchId: to.id } },
            select: { id: true },
          })
          if (existing) {
            await tx.inventory.update({
              where: { id: existing.id },
              data: {
                quantity: { increment: row.quantity },
                incomingQty: { increment: row.incomingQty },
                reserved: { increment: row.reserved },
              },
            })
            await tx.inventory.delete({ where: { id: row.id } })
          } else {
            await tx.inventory.update({ where: { id: row.id }, data: { branchId: to.id } })
          }
        }
        await tx.stockTransfer.updateMany({ where: { fromBranchId: from.id }, data: { fromBranchId: to.id } })
        await tx.stockTransfer.updateMany({ where: { toBranchId: from.id }, data: { toBranchId: to.id } })
        await tx.dayClose.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } })
        if (openingStock) await tx.openingStock.update({ where: { id: openingStock.id }, data: { branchId: to.id } })
        await tx.branch.delete({ where: { id: from.id } })
      },
      { timeout: 120_000 }
    )
    console.log("  removed")
  }

  console.log(
    APPLY
      ? `\nDone.${blocked ? " Some shops were left; see STOP above." : ""}`
      : "\nNothing was written. Run again with --apply to remove them."
  )
  await prisma.$disconnect()
  if (blocked) process.exitCode = 1
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
