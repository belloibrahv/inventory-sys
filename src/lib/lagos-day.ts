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
