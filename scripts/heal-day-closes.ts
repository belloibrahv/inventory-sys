/**
 * Keep one Close the day row per shop and Lagos day. Run this before adding
 * @@unique([branchId, businessDate]) or Railway db push will refuse.
 *
 *   npx tsx scripts/heal-day-closes.ts
 * Railway start then runs prisma db push --accept-data-loss so the unique
 * shop+day lock can go on after this heal. Prisma treats a new unique index as
 * possible data loss even when the table is already clean.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const groups = await prisma.dayClose.groupBy({
    by: ["branchId", "businessDate"],
    _count: { _all: true },
    having: { branchId: { _count: { gt: 1 } } },
  })
  if (!groups.length) {
    const total = await prisma.dayClose.count()
    console.log(`Clean. ${total} day closes. Safe to keep the unique shop+day lock.`)
    await prisma.$disconnect()
    return
  }

  let removed = 0
  for (const group of groups) {
    const rows = await prisma.dayClose.findMany({
      where: { branchId: group.branchId, businessDate: group.businessDate },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })
    const extras = rows.slice(1).map((row) => row.id)
    if (extras.length) {
      await prisma.dayClose.deleteMany({ where: { id: { in: extras } } })
      removed += extras.length
    }
  }
  console.log(`Kept the first close for each shop day. Removed ${removed} extra close(s).`)
  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
