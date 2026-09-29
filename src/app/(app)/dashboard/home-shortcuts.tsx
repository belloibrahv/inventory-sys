"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * One-key jobs on Home: S opens Sell now. Ignored while typing in a box, and
 * when Ctrl, Cmd or Alt is held, so it never fights a real shortcut.
 */
export function HomeShortcuts({ canSell }: { canSell: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!canSell) return
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return
      if (event.key === "s" || event.key === "S") {
        event.preventDefault()
        router.push("/pos")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [canSell, router])
  return null
}
