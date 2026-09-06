import type { AuditAction } from "@prisma/client"
import { inferRisk, isAfterHours, stampHash, type AuditRisk } from "@/lib/audit-meta"
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

export async function verifyAuditChain(limit = 400) {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "asc" },
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
  })
  let prev: string | null = null
  let checked = 0
  for (const row of rows) {
    if (!row.hash) {
      prev = null
      continue
    }
    const expected = stampHash(prev, row)
    if (expected !== row.hash) {
      return { ok: false, checked, brokenAt: row.id }
    }
    prev = row.hash
    checked += 1
  }
  return { ok: true, checked, brokenAt: null as string | null }
}

export async function alertWatchers(title: string, message: string, actionUrl = "/audit") {
  const watchers = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["SUPER_ADMIN", "CEO", "AUDITOR"] } },
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
