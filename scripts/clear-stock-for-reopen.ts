/**
 * Clear stock and trading history so a shop can load a fresh opening stock Excel.
 *
 * Removes: opening stock, IMEIs, shelf counts, products, purchases, sales,
 * transfers, returns, swaps, repairs, and related money trails.
 *
 * Keeps: shops, settings, role permissions, and logins named with --keep
 * or --keep-roster.
 *
 *   npx tsx scripts/clear-stock-for-reopen.ts --keep-roster
 *   npx tsx scripts/clear-stock-for-reopen.ts --keep-roster --apply
 *
 * Take a Railway backup before --apply. This cannot be undone.
 */
import { PrismaClient } from "@prisma/client"
import { SEATS } from "./staff-roster"

const prisma = new PrismaClient()
const APPLY = process.argv.includes("--apply")

function keepEmails() {
  const out: string[] = []
  process.argv.forEach((value, i) => {
    if (value === "--keep" && process.argv[i + 1]) out.push(process.argv[i + 1].toLowerCase().trim())
  })
  if (process.argv.includes("--keep-roster")) {
    for (const seat of SEATS) out.push(seat.email.toLowerCase())
  }
  return [...new Set(out)]
}

async function main() {
  const keep = keepEmails()
  const users = await prisma.user.findMany({ select: { email: true, name: true, role: true } })
  const kept = users.filter((user) => keep.includes(user.email.toLowerCase()))
  const doomed = users.filter((user) => !keep.includes(user.email.toLowerCase()))

  const counts = {
    openingStock: await prisma.openingStock.count(),
    auditLog: await prisma.auditLog.count(),
    notification: await prisma.notification.count(),
    approval: await prisma.approval.count(),
    reconciliationItem: await prisma.reconciliationItem.count(),
    reconciliation: await prisma.reconciliation.count(),
    financeEntry: await prisma.financeEntry.count(),
    ledgerEntry: await prisma.ledgerEntry.count(),
    payment: await prisma.payment.count(),
    saleItem: await prisma.saleItem.count(),
    neighborFill: 0, // removed feature
    stockReturn: await prisma.stockReturn.count(),
    repair: await prisma.repair.count(),
    swap: await prisma.swap.count(),
    parkedSale: await prisma.parkedSale.count(),
    dayClose: await prisma.dayClose.count(),
    imeiRecord: await prisma.imeiRecord.count(),
    sale: await prisma.sale.count(),
    incomingItem: await prisma.incomingItem.count(),
    incomingLot: await prisma.incomingLot.count(),
    purchaseItem: await prisma.purchaseItem.count(),
    purchase: await prisma.purchase.count(),
    transferItem: await prisma.transferItem.count(),
    stockTransfer: await prisma.stockTransfer.count(),
    expense: await prisma.expense.count(),
    priceHistory: await prisma.priceHistory.count(),
    inventory: await prisma.inventory.count(),
    product: await prisma.product.count(),
    customer: await prisma.customer.count(),
    supplier: await prisma.supplier.count(),
    brand: await prisma.brand.count(),
    category: await prisma.category.count(),
  }

  console.log(APPLY ? "APPLYING on this database — cannot be undone\n" : "DRY RUN — nothing will be deleted\n")
  console.log("Stock and trading rows that will go:")
  for (const [table, n] of Object.entries(counts)) {
    if (n > 0) console.log(`  ${String(n).padStart(6)}  ${table}`)
  }
  console.log(`\nLogins to keep (${kept.length}):`)
  for (const user of kept) console.log(`  ${user.email}  (${user.role})`)
  if (doomed.length) {
    console.log(`\nExtra logins left on the system (${doomed.length}) — not deleted by this script:`)
    for (const user of doomed.slice(0, 20)) console.log(`  ${user.email}  (${user.role})`)
    if (doomed.length > 20) console.log(`  … and ${doomed.length - 20} more`)
  }

  if (kept.length === 0) {
    throw new Error("Name at least one login with --keep or use --keep-roster so someone can still sign in.")
  }
  if (!APPLY) {
    console.log("\nNothing was changed. Re-run with --apply when the list above is right.")
    return
  }

  // Children before parents so foreign keys never block.
  await prisma.auditLog.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.approval.deleteMany()
  await prisma.reconciliationItem.deleteMany()
  await prisma.reconciliation.deleteMany()
  await prisma.financeEntry.deleteMany()
  await prisma.ledgerEntry.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.saleItem.deleteMany()
  await prisma.stockReturn.deleteMany()
  await prisma.repair.deleteMany()
  await prisma.swap.deleteMany()
  await prisma.parkedSale.deleteMany()
  await prisma.dayClose.deleteMany()
  await prisma.imeiRecord.deleteMany()
  await prisma.sale.deleteMany()
  await prisma.incomingItem.deleteMany()
  await prisma.incomingLot.deleteMany()
  await prisma.openingStock.deleteMany()
  await prisma.purchaseItem.deleteMany()
  await prisma.purchase.deleteMany()
  await prisma.transferItem.deleteMany()
  await prisma.stockTransfer.deleteMany()
  await prisma.expense.deleteMany()
  await prisma.priceHistory.deleteMany()
  await prisma.inventory.deleteMany()
  await prisma.product.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.supplier.deleteMany()
  await prisma.brand.deleteMany()
  await prisma.category.deleteMany()

  const left = {
    openingStock: await prisma.openingStock.count(),
    imeiRecord: await prisma.imeiRecord.count(),
    inventory: await prisma.inventory.count(),
    product: await prisma.product.count(),
    purchase: await prisma.purchase.count(),
  }
  console.log("\nDone. Stock is clear.")
  console.log("Remaining:", left)
  console.log("Shops, settings, role permissions, and kept logins are still here.")
  console.log("Next: Upload stock → Many at once (Excel) for Iwo Road.")
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
