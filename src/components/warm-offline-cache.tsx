"use client"

import { useEffect } from "react"
import { useNetworkStatus } from "@/lib/network-status"

const WARM = ["/offline", "/pos", "/imei", "/inventory", "/sales", "/dashboard", "/customers"]

/**
 * While the line is up, quietly fetch the screens the shop uses all day so
 * the service worker already has a copy before the line drops.
 */
export function WarmOfflineCache() {
  const network = useNetworkStatus()

  useEffect(() => {
    if (network.state !== "online") return
    if (typeof navigator !== "undefined" && "connection" in navigator) {
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      if (connection?.saveData) return
    }

    const idle = window.setTimeout(() => {
      for (const href of WARM) {
        void fetch(href, {
          credentials: "same-origin",
          cache: "no-cache",
          headers: { Accept: "text/html" },
        }).catch(() => {
          // A miss here only means that screen was not warmed. Selling still parks.
        })
      }
    }, 4000)

    return () => window.clearTimeout(idle)
  }, [network.state])

  return null
}
