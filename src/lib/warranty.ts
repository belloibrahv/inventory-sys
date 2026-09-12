import { formatDate } from "@/lib/utils"

export function coverDays(days?: number | string | null, fallback = 365) {
  const parsed = Number(days)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function warrantyUntil(soldAt: Date | string | null | undefined, days?: number | string | null) {
  if (!soldAt) return null
  const start = new Date(soldAt)
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(start)
  end.setDate(end.getDate() + coverDays(days))
  return end
}

export function warrantyState(soldAt: Date | string | null | undefined, days?: number | string | null, now = new Date()) {
  const length = coverDays(days)
  const until = warrantyUntil(soldAt, length)
  if (!until) return { label: "No warranty", until: null, active: false, daysLeft: 0, days: length }
  const daysLeft = Math.ceil((until.getTime() - now.getTime()) / 86_400_000)
  if (daysLeft >= 0) {
    return { label: `In warranty until ${formatDate(until)}`, until, active: true, daysLeft, days: length }
  }
  return { label: `Warranty ended ${formatDate(until)}`, until, active: false, daysLeft, days: length }
}
