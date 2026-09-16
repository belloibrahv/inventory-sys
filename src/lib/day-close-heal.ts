import { cache } from "react"
import { prisma } from "@/lib/prisma"

/**
 * Two people closing the same shop on the same Lagos day used to write two
 * DayClose rows. Keep the earliest close and drop the rest so the unique
 * index on branch + business date can go on.
 */
export const healDuplicateDayCloses = cache(async () => {
  const groups = await prisma.dayClose.groupBy({
    by: ["branchId", "businessDate"],
    _count: { _all: true },
    having: { branchId: { _count: { gt: 1 } } },
  })
  for (const group of groups) {
    const rows = await prisma.dayClose.findMany({
      where: { branchId: group.branchId, businessDate: group.businessDate },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })
    const extras = rows.slice(1).map((row) => row.id)
    if (extras.length) {
      await prisma.dayClose.deleteMany({ where: { id: { in: extras } } })
    }
  }
})
