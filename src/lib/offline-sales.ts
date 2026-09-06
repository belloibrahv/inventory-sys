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

const KEY = "abutwins.offline-sales"

export function readSaleQueue(): QueuedSale[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as QueuedSale[]) : []
  } catch {
    return []
  }
}

export function pushSaleQueue(payload: QueuedSale["payload"]) {
  const next = [
    ...readSaleQueue(),
    { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), payload },
  ]
  window.localStorage.setItem(KEY, JSON.stringify(next))
  window.dispatchEvent(new Event("abutwins-queue"))
  return next
}

export function removeSaleQueue(id: string) {
  const next = readSaleQueue().filter((row) => row.id !== id)
  window.localStorage.setItem(KEY, JSON.stringify(next))
  window.dispatchEvent(new Event("abutwins-queue"))
  return next
}
