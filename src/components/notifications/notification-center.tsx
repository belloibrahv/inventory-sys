"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { markNotificationRead } from "@/app/actions/notifications"
import { getNetworkMonitor } from "@/lib/network-status"
import { useNotifications, type LiveNotification } from "@/store/notifications"
import { playChime, primeChime, showDeviceNotification } from "./alert-signals"

/**
 * How often the open app asks for new alerts. A customer may be standing at
 * the till waiting on a price approval, so this is quick; each ask is three
 * small indexed reads.
 */
const EVERY_MS = 5000

/**
 * Keeps alerts live while the app is open.
 *
 * Every few seconds (only while the tab is visible and the line is up) it asks
 * the server what is unread, what is new and which price approvals are
 * waiting. New alerts arrive as a toast, with a soft chime; when the app is in
 * the background they arrive as a notification on the device, if the person
 * allowed that. The bell count, the app icon badge and the tab title follow.
 *
 * Price approvals for the CEO and the main admin are not toasted here: they
 * appear as cards in the PriceApprovalDock, which reads the same store.
 */
export function NotificationCenter({ initialUnread }: { initialUnread: number }) {
  const router = useRouter()
  const setLive = useNotifications((state) => state.setLive)
  const setRefresh = useNotifications((state) => state.setRefresh)
  const unread = useNotifications((state) => state.unread)
  const loaded = useNotifications((state) => state.loaded)
  const seen = useRef<Set<string> | null>(null)
  const seenRequests = useRef<Set<string> | null>(null)
  const inFlight = useRef(false)
  const baseTitle = useRef<string | null>(null)

  useEffect(() => {
    primeChime()
  }, [])

  useEffect(() => {
    async function poll() {
      if (inFlight.current) return
      if (getNetworkMonitor().getSnapshot().state === "offline") return
      inFlight.current = true
      try {
        const response = await fetch("/api/notifications/live", { cache: "no-store", credentials: "same-origin" })
        if (!response.ok) return
        const data = (await response.json()) as {
          unread: number
          latest: LiveNotification[]
          pricePending: ReturnType<typeof useNotifications.getState>["pricePending"]
        }
        const firstLook = seen.current === null
        if (firstLook) {
          // Whatever was already there when the app opened is not "new".
          seen.current = new Set(data.latest.map((row) => row.id))
          seenRequests.current = new Set(data.pricePending.map((row) => row.id))
        } else {
          const fresh = data.latest.filter((row) => row.status === "UNREAD" && !seen.current!.has(row.id))
          for (const row of fresh) seen.current!.add(row.id)
          const newRequests = data.pricePending.filter((row) => !seenRequests.current!.has(row.id))
          for (const row of newRequests) seenRequests.current!.add(row.id)

          for (const row of fresh) {
            // The approver's own price requests show as dock cards instead.
            if (row.actionUrl?.startsWith("/approvals?price=")) continue
            announce(row)
          }
          if (newRequests.length > 0) {
            playChime("urgent")
            const first = newRequests[0]
            showDeviceNotification({
              title: `Price approval · ${first.shop}`,
              body: `${first.seller} asks to sell for ${naira(first.summary.total)}. Open to approve or decline.`,
              url: `/approvals?price=${first.id}`,
              tag: `price-${first.id}`,
              urgent: true,
            })
          }
        }
        setLive(data)
      } catch {
        // A missed look is harmless; the next one catches up.
      } finally {
        inFlight.current = false
      }
    }

    function announce(row: LiveNotification) {
      const decided = row.type === "PRICE_REQUEST"
      playChime(decided ? "urgent" : "soft")
      if (document.visibilityState !== "visible") {
        showDeviceNotification({ title: row.title, body: row.message, url: row.actionUrl ?? "/notifications", tag: row.id })
      }
      const show = /declined/i.test(row.title) ? toast.error : decided ? toast.success : toast
      show(row.title, {
        description: row.message,
        duration: decided ? 12000 : 7000,
        action: row.actionUrl
          ? {
              label: "Open",
              onClick: () => {
                void markNotificationRead(row.id)
                useNotifications.getState().markReadLocally(row.id)
                router.push(row.actionUrl!)
              },
            }
          : undefined,
      })
    }

    setRefresh(() => void poll())
    void poll()
    // Visible: every few seconds. Hidden: once a minute, so a phone in a pocket
    // still hears about an approval without burning data.
    let timer = window.setInterval(() => void poll(), EVERY_MS)
    const onVisibility = () => {
      window.clearInterval(timer)
      timer = window.setInterval(() => void poll(), document.visibilityState === "visible" ? EVERY_MS : 60000)
      if (document.visibilityState === "visible") void poll()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("online", poll)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("online", poll)
    }
  }, [router, setLive, setRefresh])

  // Bell count everywhere: the tab title, and the app icon on the home screen.
  const count = loaded ? unread : initialUnread
  useEffect(() => {
    if (baseTitle.current === null) baseTitle.current = document.title.replace(/^\(\d+\+?\)\s*/, "")
    const clean = document.title.replace(/^\(\d+\+?\)\s*/, "")
    document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${clean}` : clean
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (count > 0) nav.setAppBadge?.(count).catch(() => undefined)
    else nav.clearAppBadge?.().catch(() => undefined)
  }, [count])

  return null
}

function naira(value: number) {
  return `₦${Math.round(value).toLocaleString("en-NG")}`
}
