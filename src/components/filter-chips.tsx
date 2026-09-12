"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"

export type FilterChip = {
  key: string
  label: string
  /** URL mode (IMEI page). Omit when using `onSelect` for client filters. */
  href?: string
  count?: number
  tone?: "neutral" | "primary" | "success" | "warning" | "danger"
}

/**
 * World-class filter strip: tap a chip, the list below changes.
 *
 * Used for status, shop stage, owing/paid, and similar cuts of a list.
 * Pass `href` on each chip for URL filters, or `onSelect` for local state.
 */
export function FilterChips({
  chips,
  activeKey,
  label = "Show",
  className,
  onSelect,
}: {
  chips: FilterChip[]
  activeKey: string
  label?: string
  className?: string
  onSelect?: (key: string) => void
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const active = chip.key === activeKey
          const classes = cn(
            "inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all",
            active
              ? toneActive(chip.tone)
              : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
          )
          const body = (
            <>
              <span>{chip.label}</span>
              {typeof chip.count === "number" ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                    active ? "bg-background/70" : "bg-muted text-muted-foreground"
                  )}
                >
                  {chip.count}
                </span>
              ) : null}
            </>
          )

          if (chip.href) {
            return (
              <Link
                key={chip.key}
                href={chip.href}
                aria-current={active ? "page" : undefined}
                className={classes}
              >
                {body}
              </Link>
            )
          }

          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect?.(chip.key)}
              className={classes}
            >
              {body}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function toneActive(tone: FilterChip["tone"] = "primary") {
  switch (tone) {
    case "success":
      return "border-success/40 bg-success-soft text-success shadow-sm"
    case "warning":
      return "border-warning/40 bg-warning-soft text-warning shadow-sm"
    case "danger":
      return "border-danger/40 bg-danger-soft text-danger shadow-sm"
    case "neutral":
      return "border-foreground/20 bg-muted text-foreground shadow-sm"
    default:
      return "border-primary/40 bg-primary/10 text-primary shadow-sm"
  }
}
