/** Business days for the Ibadan shops. West Africa Time is UTC+1 with no DST. */

export function watDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export function shiftWatDay(dayKey: string, days: number) {
  const [year, month, day] = dayKey.split("-").map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + days))
  return next.toISOString().slice(0, 10)
}

export function watBounds(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number)
  return {
    start: new Date(Date.UTC(year, month - 1, day, -1, 0, 0, 0)),
    end: new Date(Date.UTC(year, month - 1, day + 1, -1, 0, 0, 0)),
  }
}

export function recentWatDays(count: number, from = watDayKey()) {
  return Array.from({ length: count }, (_, index) => shiftWatDay(from, -index))
}

export function formatWatLong(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number)
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function formatLagosStamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

/**
 * Shop-facing date and time in Lagos.
 *
 * Staff need to know *when* something happened, not only that it happened.
 * Today and yesterday are said plainly; older days keep the full stamp.
 */
export function formatShopWhen(date: Date | string | null | undefined) {
  if (!date) return "—"
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return "—"

  const today = watDayKey()
  const day = watDayKey(value)
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value)

  if (day === today) return `Today, ${clock}`
  if (day === shiftWatDay(today, -1)) return `Yesterday, ${clock}`

  return formatLagosStamp(value)
}

/** Short date only (no clock), still Lagos. */
export function formatShopDay(date: Date | string | null | undefined) {
  if (!date) return "—"
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return "—"
  const today = watDayKey()
  const day = watDayKey(value)
  if (day === today) return "Today"
  if (day === shiftWatDay(today, -1)) return "Yesterday"
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value)
}

/** Client list chips: Any day / Today / Last 7 days / Last 30 days. */
export type WhenFilter = "all" | "today" | "week" | "month"

export function matchesWhenFilter(date: Date | string | null | undefined, when: WhenFilter) {
  if (when === "all") return true
  if (!date) return false
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return false
  const day = watDayKey(value)
  if (when === "today") return day === watDayKey()
  if (when === "week") return recentWatDays(7).includes(day)
  if (when === "month") return recentWatDays(30).includes(day)
  return true
}
