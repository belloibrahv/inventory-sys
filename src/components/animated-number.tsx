"use client"

import { useEffect, useRef, useState } from "react"
import { cn, formatCurrency } from "@/lib/utils"

/**
 * A figure that visibly moves when it changes: it counts from the old value to
 * the new one and gives a small bump, so a cashier sees the total react to the
 * phone they just scanned. The first render is the plain value (no count-up on
 * page load), and anyone who asked for less motion gets the new value at once.
 */
export function AnimatedNumber({
  value,
  format = formatCurrency,
  duration = 450,
  className,
}: {
  value: number
  format?: (value: number) => string
  duration?: number
  className?: string
}) {
  const [shown, setShown] = useState(value)
  const [bump, setBump] = useState(0)
  const last = useRef(value)

  useEffect(() => {
    const from = last.current
    if (from === value) return
    last.current = value
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce || !Number.isFinite(from) || !Number.isFinite(value)) {
      setShown(value)
      return
    }
    setBump((count) => count + 1)
    let frame = 0
    const started = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setShown(from + (value - from) * eased)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return (
    <span key={bump} className={cn("inline-block tabular-nums", bump > 0 && "motion-bump", className)}>
      {format(shown)}
    </span>
  )
}
