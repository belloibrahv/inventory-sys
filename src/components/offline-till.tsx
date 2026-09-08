"use client"

import { useEffect, useState } from "react"
import { PosClient } from "@/app/(app)/pos/pos-client"
import { flushParkedSales } from "@/lib/flush-parked"
import { formatLagosStamp } from "@/lib/lagos-day"
import { readSaleQueue, type QueuedSale } from "@/lib/offline-sales"
import { readTillSnapshot, type TillSnapshot } from "@/lib/till-catalog"
import { formatCurrency } from "@/lib/utils"
import { statusLabel } from "@/lib/status"
import { Button } from "@/components/ui/button"

export function OfflineTill() {
  const [online, setOnline] = useState(true)
  const [queue, setQueue] = useState<QueuedSale[]>([])
  const [snapshot, setSnapshot] = useState<TillSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const refresh = async () => {
      setOnline(navigator.onLine)
      setQueue(await readSaleQueue())
      setSnapshot(await readTillSnapshot())
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
    setSnapshot(await readTillSnapshot())
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-[#001BCE] px-6 py-6 text-white">
        <div className={`mx-auto flex items-center gap-3 ${snapshot ? "max-w-6xl" : "max-w-xl"}`}>
          <img src="/brand/ab-mark.jpg" alt="" width={48} height={48} className="rounded-full bg-white ring-2 ring-[#7CFF86]" />
          <div>
            <p className="text-lg font-semibold">Abu Twins Softskills</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7CFF86]">The till is still here</p>
          </div>
        </div>
      </header>

      <main className={`mx-auto space-y-5 px-6 py-8 ${snapshot ? "max-w-6xl" : "max-w-xl"}`}>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">This device cannot reach the shop server</h1>
          <p className="mt-2 text-sm text-slate-700">
            {online
              ? "The line is back. Open Sell now to keep selling, or send parked work from here."
              : snapshot
                ? "Sell from the last In shop list saved on this phone. Parked sales stay here. The invoice is only born on the server."
                : "Parked sales stay on this phone. Open Sell now once while the line is up so this phone can keep the shop list."}
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
          {snapshot ? (
            <p className="mt-3 text-xs text-slate-600">
              Last shop list saved {formatLagosStamp(new Date(snapshot.savedAt))}. {snapshot.imeis.length} In shop IMEIs. {snapshot.customers.length} named customers.
            </p>
          ) : null}
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
                    {row.payload.items.length} item{row.payload.items.length === 1 ? "" : "s"} · {formatCurrency(row.payload.paidAmount)} · {statusLabel(row.payload.paymentMethod)}
                  </p>
                  <p className="mt-1 text-slate-600">Parked {formatLagosStamp(new Date(row.createdAt))}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {snapshot ? (
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold">Sell from the list on this phone</h2>
            <PosClient
              products={snapshot.products}
              customers={snapshot.customers}
              imeis={snapshot.imeis}
              branches={snapshot.branches}
              defaultBranchId={snapshot.defaultBranchId}
              canOverrideFloor={snapshot.canOverrideFloor}
              sellLocks={snapshot.sellLocks}
            />
          </div>
        ) : null}
      </main>
    </div>
  )
}
