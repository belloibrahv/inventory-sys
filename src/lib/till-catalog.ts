import { ensureOfflineStore, getShopDb, type QueuedSale } from "@/lib/offline-sales"

export type TillImei = {
  id: string
  imei1: string
  serialNumber: string | null
  productId: string
  branchId: string
  product: { name: string; sellingPrice: number; minimumPrice: number }
}

export type TillProduct = {
  id: string
  name: string
  sku: string
  sellingPrice: number
  minimumPrice: number
  serialized: boolean
  brand: { name: string }
  stock: Array<{ branchId: string; quantity: number }>
}

export type TillCustomer = {
  id: string
  name: string
  phone: string
  branchId: string
  creditLimit: number
  currentBalance: number
}

export type TillBranch = { id: string; name: string; code: string }

export type TillSellLock = { locked: boolean; dates: string[]; href: string; message: string }

export type TillSnapshot = {
  savedAt: string
  defaultBranchId?: string | null
  canOverrideFloor?: boolean
  sellLocks?: Record<string, TillSellLock>
  products: TillProduct[]
  customers: TillCustomer[]
  imeis: TillImei[]
  branches: TillBranch[]
}

const SNAP_KEY = "current"

export async function saveTillSnapshot(snapshot: Omit<TillSnapshot, "savedAt"> & { savedAt?: string }) {
  if (typeof window === "undefined") return
  await ensureOfflineStore()
  const store = getShopDb()
  if (!store) return
  const row: TillSnapshot = { ...snapshot, savedAt: snapshot.savedAt || new Date().toISOString() }
  await store.tillSnapshots.put({ key: SNAP_KEY, savedAt: row.savedAt, json: JSON.stringify(row) })
}

export async function readTillSnapshot(): Promise<TillSnapshot | null> {
  if (typeof window === "undefined") return null
  await ensureOfflineStore()
  const row = await getShopDb()?.tillSnapshots.get(SNAP_KEY)
  if (!row?.json) return null
  try {
    return JSON.parse(row.json) as TillSnapshot
  } catch {
    return null
  }
}

export async function applyParkedToTillSnapshot(payload: QueuedSale["payload"]) {
  const snap = await readTillSnapshot()
  if (!snap) return null
  const sold = new Set(payload.items.map((line) => line.imeiId).filter(Boolean) as string[])
  snap.imeis = snap.imeis.filter((item) => !sold.has(item.id))
  snap.products = snap.products.map((product) => {
    const used = payload.items.filter((line) => !line.imeiId && line.productId === product.id)
    if (!used.length) return product
    const qty = used.reduce((sum, line) => sum + line.quantity, 0)
    return {
      ...product,
      stock: product.stock.map((row) =>
        row.branchId === payload.branchId ? { ...row, quantity: Math.max(0, row.quantity - qty) } : row
      ),
    }
  })
  snap.savedAt = new Date().toISOString()
  await saveTillSnapshot(snap)
  return snap
}
