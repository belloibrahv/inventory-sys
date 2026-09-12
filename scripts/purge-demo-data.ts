/**
 * Take a database that has been used for demos and leave only the real shop.
 *
 * What it REMOVES: every movement and every record that came from a demo or a
 * test run - sales, payments, purchases, IMEIs, stock, products, customers,
 * suppliers, expenses, transfers, swaps, repairs, returns, stock counts, day
 * closes, finance entries, approvals, notifications, the audit trail, and every
 * login except the ones named with --keep.
 *
 * What it KEEPS: the three real shops (Iwo Road, Bodija, Challenge), the company
 * settings that print on invoices, the role permission ticks, and the logins you
 * name with --keep.
 *
 * It refuses to run without --apply, and prints exactly what it would delete
 * first. Take a database backup before running with --apply: this cannot be
 * undone.
 *
 *   npx tsx scripts/purge-demo-data.ts                       # dry run, deletes nothing
 *   npx tsx scripts/purge-demo-data.ts --keep owner@abutwins.com --apply
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
  // --keep-roster keeps every real seat in scripts/staff-roster.ts, which is the
  // same list create-staff.ts builds from. Sharing one list is what stops a purge
  // deleting the accounts that were just created for the shop.
  if (process.argv.includes("--keep-roster")) {
    for (const seat of SEATS) out.push(seat.email.toLowerCase())
  }
  return [...new Set(out)]
}

async function main() {
  const keep = keepEmails()

  const counts = {
    auditLog: await prisma.auditLog.count(),
    notification: await prisma.notification.count(),
    approval: await prisma.approval.count(),
    reconciliationItem: await prisma.reconciliationItem.count(),
    reconciliation: await prisma.reconciliation.count(),
    financeEntry: await prisma.financeEntry.count(),
    ledgerEntry: await prisma.ledgerEntry.count(),
    payment: await prisma.payment.count(),
    saleItem: await prisma.saleItem.count(),
    stockReturn: await prisma.stockReturn.count(),
    repair: await prisma.repair.count(),
    swap: await prisma.swap.count(),
    neighborFill: await prisma.neighborFill.count(),
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

  const users = await prisma.user.findMany({ select: { email: true, name: true, role: true } })
  const doomed = users.filter((user) => !keep.includes(user.email.toLowerCase()))
  const kept = users.filter((user) => keep.includes(user.email.toLowerCase()))

  console.log(APPLY ? "APPLYING - this cannot be undone\n" : "DRY RUN - nothing will be deleted\n")
  console.log("Rows to delete:")
  for (const [table, n] of Object.entries(counts)) {
    if (n > 0) console.log(`  ${String(n).padStart(6)}  ${table}`)
  }
  console.log(`\nLogins to delete (${doomed.length}):`)
  for (const user of doomed) console.log(`  ${user.email}  (${user.role})`)
  console.log(`\nLogins to keep (${kept.length}):`)
  for (const user of kept) console.log(`  ${user.email}  (${user.role})`)
  for (const email of keep) {
    if (!kept.some((u) => u.email.toLowerCase() === email)) {
      console.log(`  !! ${email} is not on this database, so nothing will be kept under that name`)
    }
  }

  const branches = await prisma.branch.count()
  const settings = await prisma.setting.count()
  const perms = await prisma.rolePermission.count()
  console.log(`\nKeeping ${branches} shops, ${settings} company settings, ${perms} role permission rows.`)

  if (!APPLY) {
    console.log("\nNothing was changed. Re-run with --apply once the list above is right.")
    return
  }
  if (kept.length === 0) {
    throw new Error(
      "Refusing to delete every login: nobody could sign in afterwards. Name the real one with --keep, " +
        "or create it first with scripts/create-owner.ts."
    )
  }

  // Children before parents, so a foreign key never blocks the delete.
  await prisma.auditLog.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.approval.deleteMany()
  await prisma.reconciliationItem.deleteMany()
  await prisma.reconciliation.deleteMany()
  await prisma.financeEntry.deleteMany()
  await prisma.ledgerEntry.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.saleItem.deleteMany()
  await prisma.neighborFill.deleteMany()
  await prisma.stockReturn.deleteMany()
  await prisma.repair.deleteMany()
  await prisma.swap.deleteMany()
  await prisma.parkedSale.deleteMany()
  await prisma.dayClose.deleteMany()
  await prisma.imeiRecord.deleteMany()
  await prisma.sale.deleteMany()
  await prisma.incomingItem.deleteMany()
  await prisma.incomingLot.deleteMany()
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
  await prisma.user.deleteMany({ where: { email: { notIn: kept.map((u) => u.email) } } })

  console.log("\nDone. The shops, the company settings, the role permissions and the kept logins are still here.")
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
