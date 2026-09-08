/**
 * Moves everything sitting on the three retired demo shops onto the three real
 * Ibadan shops, so each shop has stock and history to be tested with.
 *
 *   npx tsx scripts/move-retired-shop-data.ts            reports, changes nothing
 *   npx tsx scripts/move-retired-shop-data.ts --apply    moves the records
 *
 * Why this exists: the original demo data was seeded onto Lagos, Abuja and Port
 * Harcourt. Those shops were retired when the business moved to Ibadan, but
 * their stock, phones and sales stayed with them. The result is a system where
 * head office sees millions in stock across "all shops", yet Iwo Road, Bodija
 * and Challenge each look empty, and a cashier has nothing to sell.
 *
 * The move is a straight renaming of which shop each record belongs to:
 *
 *   Lagos         -> Iwo Road    (the busiest, onto the HQ shop)
 *   Abuja         -> Bodija
 *   Port Harcourt -> Challenge
 *
 * Nothing is deleted and no figures are changed, so totals across the business
 * stay exactly the same. Only the shop each record is filed under changes.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const APPLY = process.argv.includes("--apply")

/** Retired shop code -> the Ibadan shop that takes over its records. */
const MOVES: Record<string, string> = { LOS: "IWO", ABJ: "BOD", PHC: "CHL" }

async function main() {
  const branches = await prisma.branch.findMany({ select: { id: true, code: true, name: true, isActive: true } })
  const byCode = new Map(branches.map((b) => [b.code, b]))

  const plan: Array<{ from: { id: string; name: string }; to: { id: string; name: string } }> = []
  for (const [fromCode, toCode] of Object.entries(MOVES)) {
    const from = byCode.get(fromCode)
    const to = byCode.get(toCode)
    if (!from) continue
    if (!to) {
      console.error(`Cannot move ${fromCode}: there is no ${toCode} shop. Deploy the shop seed first.`)
      process.exit(1)
    }
    plan.push({ from, to })
  }
  if (!plan.length) {
    console.log("No retired shops found. Nothing to move.")
    await prisma.$disconnect()
    return
  }

  let moved = 0
  let merged = 0

  for (const { from, to } of plan) {
    console.log(`\n${from.name}  ->  ${to.name}`)

    // Stock is the awkward one: a product may already have a row at the
    // receiving shop, and only one row per product per shop is allowed. Those
    // are added together rather than moved.
    const stock = await prisma.inventory.findMany({ where: { branchId: from.id } })
    const atTarget = await prisma.inventory.findMany({
      where: { branchId: to.id, productId: { in: stock.map((r) => r.productId) } },
      select: { productId: true, quantity: true },
    })
    const targetByProduct = new Map(atTarget.map((r) => [r.productId, r.quantity]))

    for (const row of stock) {
      const clash = targetByProduct.has(row.productId)
      if (APPLY) {
        if (clash) {
          await prisma.$transaction([
            prisma.inventory.update({
              where: { productId_branchId: { productId: row.productId, branchId: to.id } },
              data: {
                quantity: { increment: row.quantity },
                incomingQty: { increment: row.incomingQty },
                reserved: { increment: row.reserved },
              },
            }),
            prisma.inventory.delete({ where: { id: row.id } }),
          ])
        } else {
          await prisma.inventory.update({ where: { id: row.id }, data: { branchId: to.id } })
        }
      }
      clash ? merged++ : moved++
    }
    console.log(`  stock lines: ${stock.length}`)

    // Everything else is a plain change of which shop it belongs to.
    const tables: Array<[string, () => Promise<{ count: number }>, () => Promise<number>]> = [
      ["phones", () => prisma.imeiRecord.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.imeiRecord.count({ where: { branchId: from.id } })],
      ["sales", () => prisma.sale.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.sale.count({ where: { branchId: from.id } })],
      ["supplier bills", () => prisma.purchase.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.purchase.count({ where: { branchId: from.id } })],
      ["customers", () => prisma.customer.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.customer.count({ where: { branchId: from.id } })],
      ["expenses", () => prisma.expense.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.expense.count({ where: { branchId: from.id } })],
      ["money entries", () => prisma.financeEntry.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.financeEntry.count({ where: { branchId: from.id } })],
      ["returns", () => prisma.stockReturn.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.stockReturn.count({ where: { branchId: from.id } })],
      ["swaps", () => prisma.swap.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.swap.count({ where: { branchId: from.id } })],
      ["repairs", () => prisma.repair.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.repair.count({ where: { branchId: from.id } })],
      ["stock counts", () => prisma.reconciliation.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.reconciliation.count({ where: { branchId: from.id } })],
      ["goods on the way", () => prisma.incomingLot.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.incomingLot.count({ where: { branchId: from.id } })],
      ["neighbor fills", () => prisma.neighborFill.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.neighborFill.count({ where: { branchId: from.id } })],
      ["day closes", () => prisma.dayClose.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.dayClose.count({ where: { branchId: from.id } })],
      ["parked sales", () => prisma.parkedSale.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.parkedSale.count({ where: { branchId: from.id } })],
      ["staff", () => prisma.user.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.user.count({ where: { branchId: from.id } })],
      ["activity trail", () => prisma.auditLog.updateMany({ where: { branchId: from.id }, data: { branchId: to.id } }), () => prisma.auditLog.count({ where: { branchId: from.id } })],
    ]

    for (const [label, run, peek] of tables) {
      const n = APPLY ? (await run()).count : await peek()
      if (n) console.log(`  ${label}: ${n}`)
      moved += n
    }

    // Transfers point at two shops and need both ends redirected.
    const sent = APPLY
      ? (await prisma.stockTransfer.updateMany({ where: { fromBranchId: from.id }, data: { fromBranchId: to.id } })).count
      : await prisma.stockTransfer.count({ where: { fromBranchId: from.id } })
    const got = APPLY
      ? (await prisma.stockTransfer.updateMany({ where: { toBranchId: from.id }, data: { toBranchId: to.id } })).count
      : await prisma.stockTransfer.count({ where: { toBranchId: from.id } })
    if (sent || got) console.log(`  shop to shop sends: ${sent} out, ${got} in`)
    moved += sent + got
  }

  console.log(
    APPLY
      ? `\nDone. ${moved} record(s) moved, ${merged} stock line(s) added onto an existing line.`
      : `\n${moved} record(s) would move, ${merged} stock line(s) would be added onto an existing line.\nNothing was written. Run again with --apply.`
  )
  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
