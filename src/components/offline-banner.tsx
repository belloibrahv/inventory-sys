"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { heartbeatParkedSales } from "@/app/actions/parked"
import { flushParkedSales } from "@/lib/flush-parked"
import {
  getDeviceId,
  parkedHeartbeatRows,
  readOfflineEvents,
  readSaleQueue,
  recordOfflineEvent,
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
  const ready = useRef(false)

  useEffect(() => {
    const refresh = async () => {
      const down = !navigator.onLine
      setOffline(down)
      setQueue(await readSaleQueue())
      setEventCount((await readOfflineEvents()).length)
      if (down) await recordOfflineEvent("LINE_DOWN")
      ready.current = true
    }
    void refresh()

    const onDown = () => {
      void recordOfflineEvent("LINE_DOWN").then(() => refresh())
    }
    const onUp = () => {
      void recordOfflineEvent("LINE_BACK").then(() => {
        void refresh()
        void flush("auto")
      })
    }

    const beat = async () => {
      if (!navigator.onLine || !ready.current) return
      try {
        await heartbeatParkedSales({ deviceId: await getDeviceId(), rows: await parkedHeartbeatRows() })
      } catch {
        // Heartbeat can wait. Do not mark parked work vanished because the line flickered.
      }
    }
    const onStore = () => {
      void refresh()
      void beat()
    }
    const timer = window.setInterval(() => void beat(), 45_000)

    window.addEventListener("online", onUp)
    window.addEventListener("offline", onDown)
    window.addEventListener("storage", onStore)
    window.addEventListener("abutwins-queue", onStore)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("online", onUp)
      window.removeEventListener("offline", onDown)
      window.removeEventListener("storage", onStore)
      window.removeEventListener("abutwins-queue", onStore)
    }
  }, [])

  async function flush(reason: "auto" | "manual") {
    if (syncing.current || !navigator.onLine) return
    syncing.current = true
    setBusy(true)
    const result = await flushParkedSales(reason)
    if (result.error) toast.error(result.error)
    else if (result.posted.length) {
      toast.success(`${result.posted.length} parked sale${result.posted.length === 1 ? "" : "s"} are now on the server. Who did what has the trail.`)
      router.refresh()
    } else if (reason === "manual") {
      toast.success("Line-down time is now on Who did what.")
    }
    setBusy(false)
    syncing.current = false
    setQueue(await readSaleQueue())
    setEventCount((await readOfflineEvents()).length)
  }

  if (!offline && queue.length === 0 && eventCount === 0) return null

  return (
    <div className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
      {offline ? (
        <p>
          This device is offline. You can still finish a sale on Sell now. Refresh is safe. Parked sales stay on this phone until the line returns, then they post to the shop and Who did what.
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
