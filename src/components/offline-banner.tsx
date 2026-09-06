"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { checkoutSale } from "@/app/actions/sales"
import { readSaleQueue, removeSaleQueue, type QueuedSale } from "@/lib/offline-sales"
import { Button } from "@/components/ui/button"

export function OfflineBanner() {
  const router = useRouter()
  const [offline, setOffline] = useState(false)
  const [queue, setQueue] = useState<QueuedSale[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const sync = () => {
      setOffline(!navigator.onLine)
      setQueue(readSaleQueue())
    }
    sync()
    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    window.addEventListener("storage", sync)
    window.addEventListener("abutwins-queue", sync)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
      window.removeEventListener("storage", sync)
      window.removeEventListener("abutwins-queue", sync)
    }
  }, [])

  async function retry() {
    setBusy(true)
    const pending = readSaleQueue()
    for (const row of pending) {
      const result = await checkoutSale(row.payload)
      if (result.error) {
        toast.error(result.error)
        setBusy(false)
        setQueue(readSaleQueue())
        return
      }
      removeSaleQueue(row.id)
    }
    setBusy(false)
    setQueue(readSaleQueue())
    toast.success("Queued sales are now on the server.")
    router.refresh()
  }

  if (!offline && queue.length === 0) return null

  return (
    <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
      {offline ? (
        <p>This device is offline. Scan and build a cart, then wait for the line before you complete the sale. If a sale is saved here, it stays on this phone until you retry.</p>
      ) : (
        <p>{queue.length} sale{queue.length === 1 ? "" : "s"} waiting on this device.</p>
      )}
      {queue.length && !offline ? (
        <Button type="button" size="sm" className="mt-2 min-h-11" disabled={busy} onClick={retry}>
          {busy ? "Sending..." : "Send waiting sales"}
        </Button>
      ) : null}
    </div>
  )
}
