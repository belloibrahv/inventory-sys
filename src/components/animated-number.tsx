"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { cn, formatCurrency } from "@/lib/utils"

const noSubscribe = () => () => {}

/**
 * True while React is hydrating what the server drew, false for anything drawn
 * in the browser afterwards. A figure the server drew must start as it is
 * (counting it up would snap it to zero and fail hydration); a figure that
 * appears after moving between screens inside the app can count up from zero.
 * Asked per figure, because pages stream in after the app's frame hydrates.
 */
function useIsHydrating() {
  return useSyncExternalStore(noSubscribe, () => false, () => true)
}

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
  countUp = false,
}: {
  value: number
  format?: (value: number) => string
  duration?: number
  className?: string
  /** Count up from zero when it first appears, after moving between screens. */
  countUp?: boolean
}) {
  const hydrating = useIsHydrating()
  const [start] = useState(() => (countUp && !hydrating ? 0 : value))
  const [shown, setShown] = useState(start)
  const [bump, setBump] = useState(0)
  // The number actually on screen. The animation always runs from here, so an
  // effect that restarts (React does this on purpose in development) carries
  // on towards the target instead of stopping short.
  const onScreen = useRef(start)

  useEffect(() => {
    const from = onScreen.current
    if (from === value) return
    const show = (next: number) => {
      onScreen.current = next
      setShown(next)
    }
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce || !Number.isFinite(from) || !Number.isFinite(value)) {
      show(value)
      return
    }
    setBump((count) => count + 1)
    let frame = 0
    const started = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      show(progress < 1 ? from + (value - from) * eased : value)
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
