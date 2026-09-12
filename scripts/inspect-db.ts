/**
 * Read-only snapshot of who is logged in and how much data sits in the database.
 * Used before and after a production cutover so we can confirm the wipe worked.
 *
 *   railway run -- npx tsx scripts/inspect-db.ts
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, name: true, role: true },
    orderBy: { email: "asc" },
  })
  console.log(`users ${users.length}`)
  for (const user of users) {
    console.log(`  ${user.role.padEnd(16)} ${user.email}  ${user.name}`)
  }
  console.log(`products ${await prisma.product.count()}`)
  console.log(`inventory ${await prisma.inventory.count()}`)
  console.log(`imei ${await prisma.imeiRecord.count()}`)
  console.log(`sales ${await prisma.sale.count()}`)
  console.log(`customers ${await prisma.customer.count()}`)
  console.log(`suppliers ${await prisma.supplier.count()}`)
  console.log(`expenses ${await prisma.expense.count()}`)
  console.log(`purchases ${await prisma.purchase.count()}`)
  console.log(`branches ${await prisma.branch.count()}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
