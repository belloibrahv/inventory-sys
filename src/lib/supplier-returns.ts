import type { Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { supplierReturnMoneyPlan } from "@/lib/vendor-return"
import { money } from "@/lib/utils"

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Returns outward: one row per unit sent back to a supplier, so Reports can say
 * what went back, to which supplier, from which shop, and what it was worth.
 * Before this, a send-back only changed the phone's status and the bill, and
 * nothing could list them.
 */
export async function recordSupplierReturnLine(
  db: Db,
  line: {
    reference: string
    supplierId: string | null
    branchId: string
    imeiId: string
    productId: string
    purchaseId: string | null
    cost: number
    moneyEffect: string
    source: "SEND_BACK" | "CUSTOMER_RETURN"
    userId: string | null
  }
) {
  if (!line.supplierId) return
  await db.supplierReturnLine.upsert({
    where: { reference_imeiId: { reference: line.reference, imeiId: line.imeiId } },
    update: {},
    create: {
      reference: line.reference,
      supplierId: line.supplierId,
      branchId: line.branchId,
      imeiId: line.imeiId,
      productId: line.productId,
      purchaseId: line.purchaseId,
      cost: line.cost.toFixed(2),
      moneyEffect: line.moneyEffect,
      source: line.source,
      userId: line.userId,
    },
  })
}

const HEALED_KEY = "supplier-returns.backfilled"

/**
 * Send-backs made before these rows existed, filled in once from what was
 * already recorded: the per-unit entry each send-back wrote to Who did what
 * (with its RTV number and cost), and customer returns applied as "send back
 * to the supplier". Runs once; a setting marks it done.
 */
export async function backfillSupplierReturnLines() {
  const done = await prisma.setting.findUnique({ where: { key: HEALED_KEY } })
  if (done) return

  // 1. Send back to supplier (RTV-…), from the per-unit audit entries.
  const entries = await prisma.auditLog.findMany({
    where: { entityType: "IMEIRecord", newValue: { contains: "RETURNED_TO_SUPPLIER" } },
    select: { entityId: true, newValue: true, userId: true, branchId: true, createdAt: true },
  })
  const parsed = entries
    .map((entry) => {
      try {
        const value = JSON.parse(entry.newValue ?? "{}") as { rtv?: string; supplierId?: string; cost?: number; reason?: string }
        return value.rtv ? { ...entry, value } : null
      } catch {
        return null
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
  const units = await prisma.imeiRecord.findMany({
    where: { imei1: { in: parsed.map((row) => row.entityId) } },
    select: { id: true, imei1: true, productId: true, purchaseId: true, branchId: true, supplierId: true },
  })
  const byImei = new Map(units.map((unit) => [unit.imei1, unit]))
  for (const row of parsed) {
    const unit = byImei.get(row.entityId)
    if (!unit) continue
    await prisma.supplierReturnLine.upsert({
      where: { reference_imeiId: { reference: row.value.rtv!, imeiId: unit.id } },
      update: {},
      create: {
        reference: row.value.rtv!,
        supplierId: row.value.supplierId || unit.supplierId || "",
        branchId: row.branchId || unit.branchId,
        imeiId: unit.id,
        productId: unit.productId,
        purchaseId: unit.purchaseId,
        cost: money(row.value.cost).toFixed(2),
        moneyEffect: row.value.reason || "bill",
        source: "SEND_BACK",
        userId: row.userId,
        sentAt: row.createdAt,
      },
    }).catch(() => undefined)
  }

  // 2. Customer returns applied as "send back to the supplier" (RTN-…).
  const returns = await prisma.stockReturn.findMany({
    where: { outcome: "SEND_TO_SUPPLIER", status: "COMPLETED", imeiId: { not: null } },
    select: {
      returnNumber: true,
      supplierId: true,
      branchId: true,
      userId: true,
      approvedBy: true,
      completedAt: true,
      createdAt: true,
      imei: {
        select: {
          id: true,
          productId: true,
          supplierId: true,
          purchaseId: true,
          product: { select: { costPrice: true } },
          purchase: { include: { items: { select: { productId: true, costPrice: true } }, openingStock: { select: { id: true } } } },
        },
      },
    },
  })
  for (const row of returns) {
    if (!row.imei) continue
    const supplierId = row.supplierId || row.imei.supplierId
    if (!supplierId) continue
    const plan = supplierReturnMoneyPlan({
      supplierId,
      productId: row.imei.productId,
      productCost: row.imei.product.costPrice,
      purchase: row.imei.purchase,
    })
    await prisma.supplierReturnLine.upsert({
      where: { reference_imeiId: { reference: row.returnNumber, imeiId: row.imei.id } },
      update: {},
      create: {
        reference: row.returnNumber,
        supplierId,
        branchId: row.branchId,
        imeiId: row.imei.id,
        productId: row.imei.productId,
        purchaseId: row.imei.purchaseId,
        cost: plan.cost.toFixed(2),
        moneyEffect: plan.reason,
        source: "CUSTOMER_RETURN",
        userId: row.approvedBy || row.userId,
        sentAt: row.completedAt ?? row.createdAt,
      },
    }).catch(() => undefined)
  }

  await prisma.setting.upsert({
    where: { key: HEALED_KEY },
    update: { value: new Date().toISOString() },
    create: { key: HEALED_KEY, value: new Date().toISOString(), description: "Past send-backs to suppliers filled into the returns outward record." },
  })
}

/** Plain words for what a send-back did to the money. */
export function moneyEffectWords(effect: string) {
  if (effect === "bill") return "Taken off the supplier bill"
  if (effect === "house-credit") return "Credit with the supplier"
  if (effect === "opening-stock") return "Opening stock (value only)"
  if (effect === "no-cost") return "No cost recorded"
  return "No money effect"
}
