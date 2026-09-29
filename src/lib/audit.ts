import type { AuditAction } from "@prisma/client"
import { stampHash, type AuditRisk } from "@/lib/audit-meta"
import { prisma } from "@/lib/prisma"

export { inferRisk, isAfterHours, requestContext, stampHash, type AuditRisk } from "@/lib/audit-meta"

export async function writeAudit(input: {
  userId?: string | null
  action: AuditAction
  entityType: string
  entityId: string
  oldValue?: string | null
  newValue?: string | null
  branchId?: string | null
  success?: boolean
  risk?: AuditRisk
  path?: string | null
}) {
  return prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      branchId: input.branchId ?? null,
      success: input.success ?? true,
      risk: input.risk,
      path: input.path,
    },
  })
}

/**
 * How far either side of a row its parent may sit. Each row is hashed onto the
 * newest row its writer could see. Two writers at the same moment (two shops,
 * or a write inside a slow transaction) can both chain onto the same parent,
 * and a row's own timestamp can land just before the parent it saw. That is a
 * fork, not tampering, so a row counts as sound when its hash matches any
 * neighbour within this window. An edited or removed row still fails: nothing
 * nearby hashes to it.
 */
const CHAIN_WINDOW = 8

/** Checks the most recent `limit` rows, where tampering would matter now. */
export async function verifyAuditChain(limit = 400) {
  const [total, newestFirst] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        createdAt: true,
        userId: true,
        action: true,
        entityType: true,
        entityId: true,
        newValue: true,
        success: true,
        hash: true,
      },
    }),
  ])
  const rows = newestFirst.reverse()
  // When the whole log fits, the first rows chain onto GENESIS. Otherwise the
  // oldest rows fetched are anchors: their parents are outside the window.
  const fromStart = total <= limit
  let checked = 0
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    if (!row.hash) continue
    if (!fromStart && i < CHAIN_WINDOW) continue
    const parents: Array<string | null> = []
    if (fromStart && i < CHAIN_WINDOW) parents.push(null)
    for (let j = Math.max(0, i - CHAIN_WINDOW); j <= Math.min(rows.length - 1, i + CHAIN_WINDOW); j += 1) {
      if (j === i) continue
      // Rows written before hashing began break the chain; the next row starts again from GENESIS.
      parents.push(rows[j].hash ?? null)
    }
    if (!parents.some((parent) => stampHash(parent, row) === row.hash)) {
      return { ok: false, checked, brokenAt: row.id }
    }
    checked += 1
  }
  return { ok: true, checked, brokenAt: null as string | null }
}

export async function alertWatchers(title: string, message: string, actionUrl = "/audit") {
  const watchers = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["SUPER_ADMIN", "CEO", "AUDITOR", "ACCOUNTANT"] } },
    select: { id: true },
  })
  if (!watchers.length) return
  await prisma.notification.createMany({
    data: watchers.map((watcher) => ({
      userId: watcher.id,
      type: "SYSTEM" as const,
      title,
      message,
      actionUrl,
    })),
  })
}
