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
        return query(args)
      },
    },
  },
}) as unknown as PrismaClient

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = base
}
