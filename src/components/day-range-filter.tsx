"use client"

import { useState } from "react"
import { CalendarDays } from "lucide-react"
import { FilterChips } from "@/components/filter-chips"
import { Input } from "@/components/ui/input"
import { type WhenFilter, whenChipFromRange, whenFilterRange } from "@/lib/lagos-day"

/**
 * When something happened: Any day, Today, 7 or 30 days, or two dates. The
 * two date boxes stay folded away until "Pick days" is tapped, so the filter
 * is one line instead of half a phone screen.
 */
export function DayRangeFilter({
  from,
  to,
  onChange,
  label = "When",
}: {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
  label?: string
}) {
  const when = whenChipFromRange(from, to)
  const [picking, setPicking] = useState(when === "custom")
  const showDates = picking || when === "custom"

  return (
    <div className="min-w-0 space-y-2">
      <FilterChips
        label={label}
        activeKey={showDates ? "custom" : when}
        onSelect={(key) => {
          if (key === "custom") {
            setPicking(true)
            return
          }
          setPicking(false)
          onChange(whenFilterRange(key as Exclude<WhenFilter, "custom">))
        }}
        chips={[
          { key: "all", label: "Any day" },
          { key: "today", label: "Today" },
          { key: "week", label: "Last 7 days" },
          { key: "month", label: "Last 30 days" },
          { key: "custom", label: "Pick days" },
        ]}
      />
      {showDates ? (
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            type="date"
            className="h-9 w-auto"
            value={from}
            onChange={(event) => onChange({ from: event.target.value, to })}
            aria-label="First day"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            className="h-9 w-auto"
            value={to}
            onChange={(event) => onChange({ from, to: event.target.value })}
            aria-label="Last day"
          />
        </div>
      ) : null}
    </div>
  )
}
