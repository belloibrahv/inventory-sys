"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

/** Older than this and the figures are not live: the refresh runs every 45 seconds. */
const STALE_AFTER_MS = 3 * 60 * 1000

function clock(at: Date) {
  return at.toLocaleTimeString("en-NG", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit" })
}

/**
 * When these figures were worked out, on the server. A screen served from the
 * phone's saved copy (line down, or hung) carries the old time, so it says so
 * plainly instead of passing old figures off as live.
 */
export function UpdatedStamp({ at, className }: { at: string; className?: string }) {
  const router = useRouter()
  const [now, setNow] = useState<number | null>(null)
  const [refreshing, startRefresh] = useTransition()

  useEffect(() => {
    const update = () => setNow(Date.now())
    update()
    const timer = window.setInterval(update, 15_000)
    return () => window.clearInterval(timer)
  }, [])

  const rendered = new Date(at)
  const age = now == null ? 0 : now - rendered.getTime()
  const stale = age > STALE_AFTER_MS
  const label =
    now == null || age < 60_000
      ? "Live · updated just now"
      : stale
        ? `Saved copy from ${clock(rendered)} · not live`
        : `Live · updated ${clock(rendered)}`

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium",
        stale ? "bg-warning-soft text-warning" : "bg-success-soft text-success",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", stale ? "bg-warning" : "animate-pulse bg-success")} aria-hidden />
      {label}
      <button
        type="button"
        onClick={() => startRefresh(() => router.refresh())}
        disabled={refreshing}
        className="inline-flex items-center gap-1 rounded-full underline-offset-2 hover:underline disabled:opacity-60"
        aria-label="Refresh the figures now"
      >
        <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} aria-hidden />
        {stale ? "Refresh now" : null}
      </button>
    </span>
  )
}
