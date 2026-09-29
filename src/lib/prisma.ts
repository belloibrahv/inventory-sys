import { PrismaClient } from "@prisma/client"
import { inferRisk, requestContext, stampHash, userIdFromCreate } from "@/lib/audit-meta"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const base =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

export const prisma = base.$extends({
  query: {
    auditLog: {
      async create({ args, query }) {
        const ctx = await requestContext()
        const data = args.data
        const createdAt = data.createdAt ? new Date(data.createdAt as Date) : new Date()
        const action = String(data.action)
        const entityType = String(data.entityType ?? "")
        const success = data.success !== false
        const last = await base.auditLog.findFirst({
          orderBy: { createdAt: "desc" },
          select: { hash: true },
        })
        args.data = {
          ...data,
          createdAt,
          ipAddress: data.ipAddress ?? ctx.ip,
          userAgent: data.userAgent ?? ctx.userAgent,
          path: data.path ?? ctx.path,
          success,
          risk: data.risk ?? inferRisk({ action, entityType, success, createdAt }),
          hash: stampHash(last?.hash ?? null, {
            createdAt,
            userId: userIdFromCreate(data),
            action,
            entityType,
            entityId: String(data.entityId ?? ""),
            newValue: typeof data.newValue === "string" ? data.newValue : null,
            success,
          }),
        }
        const saved = await query(args)
        void watchMainAdmin(args.data as WatchedRow)
        return saved
      },
    },
  },
}) as unknown as PrismaClient

type WatchedRow = {
  userId?: string | null
  user?: { connect?: { id?: string } }
  action?: unknown
  entityType?: unknown
  entityId?: unknown
  newValue?: unknown
  success?: boolean
  risk?: unknown
}

/**
 * The main admin holds full control of the system, under the CEO's watch.
 * Every move is already in Who did what; the high-risk ones (removals,
 * downloads, staff, access, settings, day closes, approvals) and every cost
 * change also land on the CEO's alerts as they happen. Best effort: an alert
 * that fails never touches the work it reports on.
 */
async function watchMainAdmin(row: WatchedRow) {
  try {
    const action = String(row.action ?? "")
    if (row.success === false || action === "VIEW" || action === "LOGIN" || action === "LOGOUT" || action === "DENIED") return
    const newValue = typeof row.newValue === "string" ? row.newValue : ""
    const costChange = row.entityType === "Product" && newValue.includes("costPrice")
    if (row.risk !== "HIGH" && !costChange) return
    const userId = userIdFromCreate(row)
    if (!userId) return
    const actor = await base.user.findUnique({ where: { id: userId }, select: { role: true, name: true, email: true } })
    if (actor?.role !== "SUPER_ADMIN") return
    const ceos = await base.user.findMany({ where: { role: "CEO", isActive: true }, select: { id: true } })
    if (ceos.length === 0) return
    const what = costChange ? "changed a cost price" : `${action.toLowerCase()} on ${String(row.entityType ?? "a record")}`
    await base.notification.createMany({
      data: ceos.map((ceo) => ({
        userId: ceo.id,
        type: "SYSTEM" as const,
        title: "Main admin activity",
        message: `${actor.name || actor.email} ${what}${row.entityId ? ` (${String(row.entityId).slice(0, 60)})` : ""}.`,
        actionUrl: "/audit?role=SUPER_ADMIN",
      })),
    })
  } catch {
    // Watching must never break the work being watched.
  }
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = base
}
