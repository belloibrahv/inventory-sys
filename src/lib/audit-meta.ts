import { createHash } from "crypto"
import type { AuditAction } from "@prisma/client"

export type AuditRisk = "LOW" | "MEDIUM" | "HIGH"

const HIGH_ENTITIES = new Set([
  "User",
  "RolePermission",
  "Backup",
  "Setting",
  "DayClose",
  "Approval",
])

export async function requestContext() {
  try {
    const { headers } = await import("next/headers")
    const h = await headers()
    const forwarded = h.get("x-forwarded-for")
    return {
      ip: forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
      userAgent: (h.get("user-agent") ?? "").slice(0, 240) || null,
      path: h.get("x-pathname") || null,
    }
  } catch {
    return { ip: null, userAgent: null, path: null }
  }
}

export function isAfterHours(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(date)
  )
  return hour >= 22 || hour < 6
}

export function inferRisk(input: {
  action: AuditAction | string
  entityType?: string
  success?: boolean
  createdAt?: Date
}): AuditRisk {
  if (input.success === false) return "HIGH"
  if (input.action === "DENIED" || input.action === "DELETE" || input.action === "EXPORT") return "HIGH"
  if (input.entityType === "Offline") return "HIGH"
  if (HIGH_ENTITIES.has(input.entityType ?? "") && input.action !== "VIEW") return "HIGH"
  if (input.action === "APPROVE" || input.action === "REJECT" || input.action === "IMPORT") return "MEDIUM"
  if (isAfterHours(input.createdAt) && input.action !== "VIEW") return "MEDIUM"
  return "LOW"
}

export function stampHash(prev: string | null, row: {
  createdAt: Date | string
  userId?: string | null
  action: string
  entityType: string
  entityId: string
  newValue?: string | null
  success?: boolean
}) {
  return createHash("sha256")
    .update(
      [
        prev ?? "GENESIS",
        typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString(),
        row.userId ?? "",
        row.action,
        row.entityType,
        row.entityId,
        row.newValue ?? "",
        row.success === false ? "0" : "1",
      ].join("|")
    )
    .digest("hex")
}

export function userIdFromCreate(data: { userId?: string | null; user?: { connect?: { id?: string } } }) {
  if (typeof data.userId === "string") return data.userId
  return data.user?.connect?.id ?? null
}
