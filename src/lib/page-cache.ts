import { ensureOfflineStore, getShopDb } from "@/lib/offline-sales"

export type PageSnapshot<T = unknown> = {
  key: string
  title: string
  savedAt: string
  data: T
}

/**
 * Last copy of a shop list saved on this phone.
 *
 * Sell now already keeps IMEIs for the till. Phones, shop stock, sales and
 * customers need the same so a refresh with the line down still shows the
 * last list, instead of Firefox's empty "no internet" page.
 */
export async function savePageSnapshot(key: string, title: string, data: unknown) {
  if (typeof window === "undefined") return
  await ensureOfflineStore()
  const store = getShopDb()
  if (!store) return
  await store.pageSnapshots.put({
    key,
    title,
    savedAt: new Date().toISOString(),
    json: JSON.stringify(data, (_key, value) => {
      if (value instanceof Date) return value.toISOString()
      if (value != null && typeof value === "object" && typeof (value as { toNumber?: unknown }).toNumber === "function") {
        return (value as { toNumber: () => number }).toNumber()
      }
      return value
    }),
  })
}

export async function readPageSnapshot<T = unknown>(key: string): Promise<PageSnapshot<T> | null> {
  if (typeof window === "undefined") return null
  await ensureOfflineStore()
  const row = await getShopDb()?.pageSnapshots.get(key)
  if (!row?.json) return null
  try {
    return { key: row.key, title: row.title, savedAt: row.savedAt, data: JSON.parse(row.json) as T }
  } catch {
    return null
  }
}

export async function listPageSnapshots(): Promise<Array<Pick<PageSnapshot, "key" | "title" | "savedAt">>> {
  if (typeof window === "undefined") return []
  await ensureOfflineStore()
  const rows = (await getShopDb()?.pageSnapshots.orderBy("savedAt").reverse().toArray()) ?? []
  return rows.map((row) => ({ key: row.key, title: row.title, savedAt: row.savedAt }))
}

export function pageKeyForPath(pathname: string) {
  if (pathname === "/imei" || pathname.startsWith("/imei/")) return "imei"
  if (pathname === "/inventory" || pathname.startsWith("/inventory/")) return "inventory"
  if (pathname === "/sales" || pathname.startsWith("/sales/")) return "sales"
  if (pathname === "/customers" || pathname.startsWith("/customers/")) return "customers"
  if (pathname === "/pos" || pathname.startsWith("/pos/")) return "pos"
  if (pathname === "/dashboard") return "dashboard"
  return null
}
