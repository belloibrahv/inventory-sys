import { formatDate } from "@/lib/utils"

export function coverDays(days?: number | string | null, fallback = 0) {
  if (days == null || days === "") return fallback
  const parsed = Number(days)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export function warrantyUntil(soldAt: Date | string | null | undefined, days?: number | string | null) {
  if (!soldAt) return null
  const length = coverDays(days)
  if (length <= 0) return null
  const start = new Date(soldAt)
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(start)
  end.setDate(end.getDate() + length)
  return end
}

export function warrantyState(soldAt: Date | string | null | undefined, days?: number | string | null, now = new Date()) {
  const length = coverDays(days)
  if (length <= 0 || !soldAt) {
    return { label: "No warranty (Tested OK)", until: null, active: false, daysLeft: 0, days: 0 }
  }
  const until = warrantyUntil(soldAt, length)
  if (!until) {
    return { label: "No warranty", until: null, active: false, daysLeft: 0, days: 0 }
  }
  const daysLeft = Math.ceil((until.getTime() - now.getTime()) / 86_400_000)
  if (daysLeft >= 0) {
    return {
      label: `${length} days test warranty (until ${formatDate(until)} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left)`,
      until,
      active: true,
      daysLeft,
      days: length,
    }
  }
  return {
    label: `Warranty ended ${formatDate(until)} (${length} days)`,
    until,
    active: false,
    daysLeft,
    days: length,
  }
}
