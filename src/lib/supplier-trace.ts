import { watBounds, watDayKey } from "@/lib/lagos-day"

export type ImeiTraceRow = {
  id: string
  imei1: string
  status: string
  shop: string
  invoiceNumber: string | null
  saleId: string | null
  soldAt: Date | null
  customerName: string | null
}

export type SupplierBillTrace = {
  expected: number
  recorded: number
  coming: number
  inShop: number
  sold: number
  soldToday: number
  inTransit: number
  backToSupplier: number
  otherKnown: number
  shortVsBill: number
  tracking: "IMEI" | "SERIAL" | "NONE"
}

function todayBounds() {
  return watBounds(watDayKey())
}

export function bucketImeiStatus(status: string) {
  if (status === "INCOMING") return "coming" as const
  if (status === "IN_STOCK" || status === "RECEIVED") return "inShop" as const
  if (status === "TRANSFERRED") return "inTransit" as const
  if (status === "SOLD") return "sold" as const
  if (status === "RETURNED_TO_SUPPLIER") return "backToSupplier" as const
  return "otherKnown" as const
}

export function buildBillTrace(
  expected: number,
  tracking: "IMEI" | "SERIAL" | "NONE",
  imeis: Array<{ status: string; saleDate: Date | null }>,
  accessory?: { receivedQty: number; soldQty: number; soldToday?: number }
): SupplierBillTrace {
  const counts: SupplierBillTrace = {
    expected,
    recorded: 0,
    coming: 0,
    inShop: 0,
    sold: 0,
    soldToday: 0,
    inTransit: 0,
    backToSupplier: 0,
    otherKnown: 0,
    shortVsBill: 0,
    tracking,
  }
  const { start, end } = todayBounds()

  if (tracking === "NONE") {
    counts.recorded = accessory?.receivedQty ?? 0
    counts.sold = accessory?.soldQty ?? 0
    counts.soldToday = accessory?.soldToday ?? 0
    counts.inShop = Math.max(0, counts.recorded - counts.sold)
    counts.shortVsBill = Math.max(0, expected - counts.recorded)
    return counts
  }

  counts.recorded = imeis.length
  for (const row of imeis) {
    const bucket = bucketImeiStatus(row.status)
    counts[bucket] += 1
    if (row.status === "SOLD" && row.saleDate && row.saleDate >= start && row.saleDate < end) {
      counts.soldToday += 1
    }
  }
  counts.shortVsBill = Math.max(0, expected - counts.recorded)
  return counts
}
