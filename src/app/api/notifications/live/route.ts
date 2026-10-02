import { NextResponse } from "next/server"
import { getPendingPriceRequests } from "@/app/actions/price-requests"
import { prisma } from "@/lib/prisma"
import { isShopOwner } from "@/lib/roles"
import { getCurrentUser } from "@/lib/session"
import { settleDoneAlerts } from "@/lib/settled-alerts"

export const dynamic = "force-dynamic"

/**
 * What the notification centre asks for every few seconds while the app is
 * open: how many alerts are unread, the newest few, and, for the CEO and the
 * main admin, the price approvals waiting on them. Small on purpose: three
 * indexed reads.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ signedOut: true }, { status: 401 })
  // Decided requests and paid invoices drop off the bell while it is open.
  await settleDoneAlerts(user.id).catch(() => {})

  const [unread, latest, pricePending] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, status: "UNREAD" } }),
    prisma.notification.findMany({
      where: { userId: user.id, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, type: true, title: true, message: true, actionUrl: true, status: true, createdAt: true },
    }),
    isShopOwner(user.role) ? getPendingPriceRequests() : Promise.resolve([]),
  ])

  return NextResponse.json(
    {
      unread,
      latest: latest.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      pricePending,
      serverTime: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
