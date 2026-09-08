"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

/**
 * Keeps the screen in step with the rest of the shop.
 *
 * Every screen here is built on the server, so until now a figure only changed
 * when you did something yourself. A sale rung up at the other till, a transfer
 * confirmed at Bodija or a phone taken into stock did not show until the page
 * was opened again.
 *
 * This asks the server for the current picture on a quiet loop. It holds back
 * whenever refreshing would be rude or wasteful:
 *
 *   - the tab is not being looked at, so a phone in someone's pocket is not
 *     burning shop data all afternoon
 *   - the device says the line is down, so there is nothing to ask
 *   - someone is typing, so a half-filled form is never disturbed
 *   - a request is already in flight
 *
 * Client state is kept across a refresh, so a cart being built at the till and
 * a half-typed note both survive.
 */
export function LiveRefresh({ seconds = 45 }: { seconds?: number }) {
  const router = useRouter()
  const running = useRef(false)

  useEffect(() => {
    if (seconds <= 0) return

    function busyTyping() {
      const active = document.activeElement
      if (!active) return false
      const tag = active.tagName
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (active as HTMLElement).isContentEditable === true
      )
    }

    const tick = () => {
      if (running.current) return
      if (document.visibilityState !== "visible") return
      if (typeof navigator !== "undefined" && !navigator.onLine) return
      if (busyTyping()) return
      running.current = true
      router.refresh()
      // router.refresh() gives nothing back to wait on, so the guard is simply
      // held long enough that a slow shop line cannot stack requests up.
      window.setTimeout(() => {
        running.current = false
      }, 4000)
    }

    const timer = window.setInterval(tick, seconds * 1000)
    // Coming back to the tab should show current figures straight away rather
    // than after another wait.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [router, seconds])

  return null
}
