export type QueuedSale = {
  id: string
  createdAt: string
  payload: {
    customerId?: string
    branchId: string
    paymentMethod: "CASH" | "TRANSFER" | "POS" | "CREDIT"
    paidAmount: number
    notes?: string
    wholesale?: boolean
    items: Array<{ productId: string; imeiId?: string; quantity: number; unitPrice: number }>
  }
}

export type OfflineEvent = {
  id: string
  at: string
  kind: "LINE_DOWN" | "SALE_PARKED" | "LINE_BACK" | "SYNC_OK" | "SYNC_FAILED"
  detail?: Record<string, unknown>
}

const SALE_KEY = "abutwins.offline-sales"
const EVENT_KEY = "abutwins.offline-events"
const DEVICE_KEY = "abutwins.device-id"

export function getDeviceId() {
  if (typeof window === "undefined") return ""
  const existing = window.localStorage.getItem(DEVICE_KEY)
  if (existing) return existing
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `dev-${crypto.randomUUID()}`
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  window.localStorage.setItem(DEVICE_KEY, id)
  return id
}

export function parkedHeartbeatRows() {
  return readSaleQueue().map((row) => ({
    id: row.id,
    queuedAt: row.createdAt,
    branchId: row.payload.branchId,
    itemCount: row.payload.items.length,
    paidAmount: row.payload.paidAmount,
  }))
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new Event("abutwins-queue"))
}

export function readSaleQueue(): QueuedSale[] {
  return readJson<QueuedSale[]>(SALE_KEY, [])
}

export function readOfflineEvents(): OfflineEvent[] {
  return readJson<OfflineEvent[]>(EVENT_KEY, [])
}

export function recordOfflineEvent(kind: OfflineEvent["kind"], detail?: Record<string, unknown>) {
  const events = readOfflineEvents()
  const last = events[events.length - 1]
  if (last && last.kind === kind && Date.now() - new Date(last.at).getTime() < 15_000) return events
  const next = [
    ...events,
    { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), kind, detail },
  ]
  writeJson(EVENT_KEY, next)
  return next
}

export function clearOfflineEvents() {
  writeJson(EVENT_KEY, [])
}

export function pushSaleQueue(payload: QueuedSale["payload"]) {
  const row: QueuedSale = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    payload,
  }
  writeJson(SALE_KEY, [...readSaleQueue(), row])
  recordOfflineEvent("SALE_PARKED", {
    queueId: row.id,
    branchId: payload.branchId,
    items: payload.items.length,
    paidAmount: payload.paidAmount,
    method: payload.paymentMethod,
  })
  return readSaleQueue()
}

export function removeSaleQueue(id: string) {
  writeJson(SALE_KEY, readSaleQueue().filter((row) => row.id !== id))
  return readSaleQueue()
}
