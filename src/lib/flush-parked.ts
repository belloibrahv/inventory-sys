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
} from "@/lib/offline-sales"

export async function flushParkedSales(reason: "auto" | "manual") {
  if (typeof navigator === "undefined" || !navigator.onLine) {
    return { posted: [] as string[], leftover: (await readSaleQueue()).length }
  }

  try {
    await heartbeatParkedSales({ deviceId: await getDeviceId(), rows: await parkedHeartbeatRows() })
  } catch {
    // Line may have dropped again. Flush still tries to post parked sales.
  }

  const pendingSales = await readSaleQueue()
  const pendingEvents = await readOfflineEvents()
  if (!pendingSales.length && !pendingEvents.length) {
    return { posted: [] as string[], leftover: 0 }
  }

  const posted: string[] = []
  try {
    for (const row of pendingSales) {
      const result = await checkoutSale({
        ...row.payload,
        queuedAt: row.createdAt,
        offlineId: row.id,
      })
      if (result.error) {
        await recordOfflineEvent("SYNC_FAILED", { queueId: row.id, error: result.error })
        return { posted, leftover: (await readSaleQueue()).length, error: result.error }
      }
      posted.push(result.saleId ?? row.id)
      await removeSaleQueue(row.id)
    }

    const leftover = await readSaleQueue()
    if (leftover.length === 0) {
      const events = [...pendingEvents, ...(await readOfflineEvents()).filter((event) => event.kind === "SYNC_FAILED")]
      await recordOfflineEvent("SYNC_OK", { posted: posted.length })
      await syncOfflineTrail({
        events: [...events, { id: `ok-${Date.now()}`, at: new Date().toISOString(), kind: "SYNC_OK", detail: { posted } }],
        postedInvoices: posted,
      })
      await clearOfflineEvents()
    }
    return { posted, leftover: leftover.length }
  } catch {
    await recordOfflineEvent("SYNC_FAILED", { error: "network" })
    return {
      posted,
      leftover: (await readSaleQueue()).length,
      error: "The line dropped again. Waiting sales stay on this device.",
    }
  }
}
