"use server"

import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/session"
import { alertWatchers, writeAudit } from "@/lib/audit"
import { scopedBranchId } from "@/lib/rbac"

const SIT_MS = 2 * 60 * 60 * 1000
const VANISH_GRACE_MS = 90 * 1000

export async function heartbeatParkedSales(input: {
  deviceId: string
  rows: Array<{ id: string; queuedAt: string; branchId: string; itemCount: number; paidAmount: number }>
}) {
  const user = await requireUser()
  const deviceId = input.deviceId.slice(0, 80)
  if (!deviceId) return { vanished: 0, sitting: 0 }
  const now = new Date()
  const seen = new Set(input.rows.map((row) => row.id))
  const fallbackShop =
    user.branchId ||
    (await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { isHq: "desc" }, select: { id: true } }))?.id ||
    ""

  for (const row of input.rows) {
    const shopId = row.branchId || fallbackShop
    if (!shopId) continue
    await prisma.parkedSale.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        userId: user.id,
        branchId: shopId,
        deviceId,
        queuedAt: new Date(row.queuedAt),
        lastSeenAt: now,
        status: "PARKED",
        payload: JSON.stringify({ itemCount: row.itemCount, paidAmount: row.paidAmount }),
      },
      update: {
        lastSeenAt: now,
        status: "PARKED",
        payload: JSON.stringify({ itemCount: row.itemCount, paidAmount: row.paidAmount }),
      },
    })
  }

  const missing = await prisma.parkedSale.findMany({
    where: {
      userId: user.id,
      deviceId,
      status: "PARKED",
      id: { notIn: seen.size ? [...seen] : ["__none__"] },
      lastSeenAt: { lt: new Date(now.getTime() - VANISH_GRACE_MS) },
    },
  })

  for (const row of missing) {
    await prisma.parkedSale.update({
      where: { id: row.id },
      data: { status: "VANISHED" },
    })
    await writeAudit({
      userId: user.id,
      action: "DELETE",
      entityType: "ParkedSale",
      entityId: row.id,
      newValue: JSON.stringify({ result: "vanished", queuedAt: row.queuedAt, deviceId }),
      branchId: row.branchId,
      success: false,
      risk: "HIGH",
    })
    await alertWatchers(
      "Parked sale disappeared",
      `${user.name ?? user.email} had a parked sale from ${row.queuedAt.toLocaleString("en-NG")} that is no longer on that device. Open Who did what.`,
      "/audit?risk=HIGH"
    )
  }

  const sitting = await prisma.parkedSale.findMany({
    where: {
      status: "PARKED",
      queuedAt: { lt: new Date(now.getTime() - SIT_MS) },
      alertedAt: null,
    },
  })
  for (const row of sitting) {
    await prisma.parkedSale.update({ where: { id: row.id }, data: { alertedAt: now } })
    await alertWatchers(
      "Parked sale sitting too long",
      `A sale parked at ${row.queuedAt.toLocaleString("en-NG")} has not been posted. Cash may be in a drawer with no invoice.`,
      "/pos"
    )
    await writeAudit({
      userId: row.userId,
      action: "UPDATE",
      entityType: "ParkedSale",
      entityId: row.id,
      newValue: JSON.stringify({ result: "sitting", queuedAt: row.queuedAt }),
      branchId: row.branchId,
      risk: "HIGH",
    })
  }

  return { vanished: missing.length, sitting: sitting.length }
}

export async function markParkedPosted(offlineId: string, saleId: string) {
  await prisma.parkedSale.updateMany({
    where: { id: offlineId },
    data: { status: "POSTED", postedSaleId: saleId, lastSeenAt: new Date() },
  })
}

export async function getParkedWatch() {
  const user = await requireUser()
  const branchId = await scopedBranchId(user.role, user.branchId)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const sitFrom = new Date(Date.now() - SIT_MS)
  const where = branchId ? { branchId } : {}
  const [sitting, vanished, parked] = await Promise.all([
    prisma.parkedSale.count({ where: { ...where, status: "PARKED", queuedAt: { lt: sitFrom } } }),
    prisma.parkedSale.count({ where: { ...where, status: "VANISHED", updatedAt: { gte: weekAgo } } }),
    prisma.parkedSale.count({ where: { ...where, status: "PARKED" } }),
  ])
  return { sitting, vanished, parked }
}
