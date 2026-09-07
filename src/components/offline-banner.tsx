"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { syncOfflineTrail } from "@/app/actions/audit"
import { heartbeatParkedSales } from "@/app/actions/parked"
import { checkoutSale } from "@/app/actions/sales"
import {
  clearOfflineEvents,
  getDeviceId,
  parkedHeartbeatRows,
  readOfflineEvents,
  readSaleQueue,
  recordOfflineEvent,
  removeSaleQueue,
  type QueuedSale,
} from "@/lib/offline-sales"
import { Button } from "@/components/ui/button"

export function OfflineBanner() {
  const router = useRouter()
  const [offline, setOffline] = useState(false)
  const [queue, setQueue] = useState<QueuedSale[]>([])
  const [eventCount, setEventCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const syncing = useRef(false)

  useEffect(() => {
    const refresh = () => {
      const down = !navigator.onLine
      setOffline(down)
      setQueue(readSaleQueue())
      setEventCount(readOfflineEvents().length)
      if (down) recordOfflineEvent("LINE_DOWN")
    }
    refresh()

    const onDown = () => {
      recordOfflineEvent("LINE_DOWN")
      refresh()
    }
    const onUp = () => {
      recordOfflineEvent("LINE_BACK")
      refresh()
      void flush("auto")
    }

    const beat = () => {
      if (!navigator.onLine) return
      void heartbeatParkedSales({ deviceId: getDeviceId(), rows: parkedHeartbeatRows() }).catch(() => undefined)
    }
    beat()
    const timer = window.setInterval(beat, 45_000)

    window.addEventListener("online", onUp)
    window.addEventListener("offline", onDown)
    window.addEventListener("storage", refresh)
    window.addEventListener("abutwins-queue", refresh)
    window.addEventListener("abutwins-queue", beat)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("online", onUp)
      window.removeEventListener("offline", onDown)
      window.removeEventListener("storage", refresh)
      window.removeEventListener("abutwins-queue", refresh)
      window.removeEventListener("abutwins-queue", beat)
    }
  }, [])

  async function flush(reason: "auto" | "manual") {
    if (syncing.current || !navigator.onLine) return
    try {
      await heartbeatParkedSales({ deviceId: getDeviceId(), rows: parkedHeartbeatRows() })
    } catch {
      // Line may have dropped again. Flush still tries to post parked sales.
    }
    const pendingSales = readSaleQueue()
    const pendingEvents = readOfflineEvents()
    if (!pendingSales.length && !pendingEvents.length) return

    syncing.current = true
    setBusy(true)
    const posted: string[] = []
    try {
      for (const row of pendingSales) {
        const result = await checkoutSale({
          ...row.payload,
          queuedAt: row.createdAt,
          offlineId: row.id,
        })
        if (result.error) {
          recordOfflineEvent("SYNC_FAILED", { queueId: row.id, error: result.error })
          toast.error(result.error)
          break
        }
        posted.push(result.saleId ?? row.id)
        removeSaleQueue(row.id)
      }
      const leftover = readSaleQueue()
      if (leftover.length === 0) {
        const events = [...pendingEvents, ...readOfflineEvents().filter((event) => event.kind === "SYNC_FAILED")]
        recordOfflineEvent("SYNC_OK", { posted: posted.length })
        await syncOfflineTrail({
          events: [...events, { id: `ok-${Date.now()}`, at: new Date().toISOString(), kind: "SYNC_OK", detail: { posted } }],
          postedInvoices: posted,
        })
        clearOfflineEvents()
        if (posted.length) toast.success(`${posted.length} parked sale${posted.length === 1 ? "" : "s"} are now on the server. Who did what has the trail.`)
        else if (reason === "manual" || pendingEvents.some((event) => event.kind === "LINE_DOWN")) {
          toast.success("Line-down time is now on Who did what.")
        }
        router.refresh()
      }
    } catch {
      recordOfflineEvent("SYNC_FAILED", { error: "network" })
      toast.error("The line dropped again. Waiting sales stay on this device.")
    }
    setBusy(false)
    syncing.current = false
    setQueue(readSaleQueue())
    setEventCount(readOfflineEvents().length)
  }

  if (!offline && queue.length === 0 && eventCount === 0) return null

  return (
    <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
      {offline ? (
        <p>
          This device is offline. You can still finish a sale on Sell now. It stays on this phone until the line returns, then it posts to the shop and Who did what.
        </p>
      ) : queue.length ? (
        <p>{queue.length} parked sale{queue.length === 1 ? "" : "s"} waiting on this device.</p>
      ) : (
        <p>The line is back. Sending the offline trail to Who did what.</p>
      )}
      {!offline && (queue.length || eventCount) ? (
        <Button type="button" size="sm" className="mt-2 min-h-11" disabled={busy} onClick={() => void flush("manual")}>
          {busy ? "Sending parked work" : "Send parked work now"}
        </Button>
      ) : null}
    </div>
  )
}
