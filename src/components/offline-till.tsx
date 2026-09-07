"use client"

import { useEffect, useState } from "react"
import { flushParkedSales } from "@/lib/flush-parked"
import { formatLagosStamp } from "@/lib/lagos-day"
import { readSaleQueue, type QueuedSale } from "@/lib/offline-sales"
import { formatCurrency } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export function OfflineTill() {
  const [online, setOnline] = useState(true)
  const [queue, setQueue] = useState<QueuedSale[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const refresh = async () => {
      setOnline(navigator.onLine)
      setQueue(await readSaleQueue())
    }
    void refresh()
    const onChange = () => void refresh()
    window.addEventListener("online", onChange)
    window.addEventListener("offline", onChange)
    window.addEventListener("abutwins-queue", onChange)
    return () => {
      window.removeEventListener("online", onChange)
      window.removeEventListener("offline", onChange)
      window.removeEventListener("abutwins-queue", onChange)
    }
  }, [])

  async function sendParked() {
    setBusy(true)
    setMessage("")
    const result = await flushParkedSales("manual")
    setBusy(false)
    setQueue(await readSaleQueue())
    if (result.error) {
      setMessage(result.error)
      return
    }
    if (result.posted.length) {
      setMessage(`${result.posted.length} parked sale${result.posted.length === 1 ? "" : "s"} are now on the server. Who did what has the trail.`)
      return
    }
    setMessage("There is no parked sale waiting on this device.")
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-[#001BCE] px-6 py-6 text-white">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <img src="/brand/ab-mark.jpg" alt="" width={48} height={48} className="rounded-full bg-white ring-2 ring-[#7CFF86]" />
          <div>
            <p className="text-lg font-semibold">Abu Twins Softskills</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7CFF86]">The till is still here</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-5 px-6 py-8">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">This device cannot reach the shop server</h1>
          <p className="mt-2 text-sm text-slate-700">
            {online
              ? "The line is back. Open Sell now to keep selling, or send parked work from here."
              : "Parked sales stay on this phone. Refresh is safe. When the line returns, send the work. The invoice is only born on the server."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="/pos"
              className="inline-flex min-h-11 items-center rounded-xl bg-[#001BCE] px-4 text-sm font-medium text-white"
            >
              Open Sell now
            </a>
            {online && queue.length ? (
              <Button type="button" disabled={busy} onClick={() => void sendParked()}>
                {busy ? "Sending parked work" : "Send parked work now"}
              </Button>
            ) : null}
          </div>
          {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Parked sales on this device</h2>
          {queue.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No parked sale is waiting here.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {queue.map((row) => (
                <li key={row.id} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
                  <p className="font-medium">
                    {row.payload.items.length} item{row.payload.items.length === 1 ? "" : "s"} · {formatCurrency(row.payload.paidAmount)} · {row.payload.paymentMethod}
                  </p>
                  <p className="mt-1 text-slate-600">Parked {formatLagosStamp(new Date(row.createdAt))}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
