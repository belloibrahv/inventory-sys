/**
 * Looks for shops that closed the same day twice.
 *
 *   npx tsx scripts/check-day-closes.ts
 *
 * Nothing is changed. This only reports.
 *
 * Why it matters: DayClose has no unique index on branch and business date, so
 * two people pressing Close the day at the same moment can write two closes for
 * one day. The till lock and the books then disagree about that day.
 *
 * The lasting fix is this line on the DayClose model in prisma/schema.prisma:
 *
 *   @@unique([branchId, businessDate])
 *
 * Do not add it until this script reports a clean result against the live
 * database. Railway runs `prisma db push` on every deploy, and adding a unique
 * index over rows that already break it makes that command fail, which takes the
 * shop offline. Clean the duplicates first, then add the line, then deploy.
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
    console.log(`Clean. ${total} day closes, no shop closed the same day twice.`)
    console.log("It is safe to add @@unique([branchId, businessDate]) to DayClose.")
    await prisma.$disconnect()
    return
  }

  console.log(`${groups.length} day(s) closed more than once:\n`)
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } })
  const branchName = new Map(branches.map((row) => [row.id, row.name]))

  for (const group of groups) {
    const rows = await prisma.dayClose.findMany({
      where: { branchId: group.branchId, businessDate: group.businessDate },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, countedCash: true, expectedCash: true, variance: true },
    })
    console.log(`${branchName.get(group.branchId) ?? group.branchId} on ${group.businessDate}: ${rows.length} closes`)
    for (const row of rows) {
      console.log(`   ${row.createdAt.toISOString()}  counted ${row.countedCash}  expected ${row.expectedCash}  difference ${row.variance}`)
    }
    console.log("   Keep the one the shop actually counted, then delete the rest by id.\n")
  }
  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
