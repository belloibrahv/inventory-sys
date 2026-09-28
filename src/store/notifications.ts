import { create } from "zustand"
import type { PendingPriceRequest } from "@/app/actions/price-requests"

export type LiveNotification = {
  id: string
  type: string
  title: string
  message: string
  actionUrl: string | null
  status: "UNREAD" | "READ" | "ARCHIVED"
  createdAt: string
}

/**
 * What the notification centre last heard from the server. The bell, its
 * panel, the price approval dock and the Alerts page all read from here, so a
 * read alert or an answered approval disappears everywhere at once.
 */
type NotificationState = {
  loaded: boolean
  unread: number
  latest: LiveNotification[]
  pricePending: PendingPriceRequest[]
  /** Ask the server again now (after an approval, a mark-as-read, a focus). */
  refresh: () => void
  setLive: (data: { unread: number; latest: LiveNotification[]; pricePending: PendingPriceRequest[] }) => void
  setRefresh: (refresh: () => void) => void
  markReadLocally: (id: string) => void
  markAllReadLocally: () => void
  dropPriceRequest: (id: string) => void
}

export const useNotifications = create<NotificationState>((set) => ({
  loaded: false,
  unread: 0,
  latest: [],
  pricePending: [],
  refresh: () => undefined,
  setLive: (data) => set({ ...data, loaded: true }),
  setRefresh: (refresh) => set({ refresh }),
  markReadLocally: (id) =>
    set((state) => {
      const wasUnread = state.latest.some((row) => row.id === id && row.status === "UNREAD")
      return {
        latest: state.latest.map((row) => (row.id === id ? { ...row, status: "READ" } : row)),
        unread: wasUnread ? Math.max(0, state.unread - 1) : state.unread,
      }
    }),
  markAllReadLocally: () =>
    set((state) => ({ unread: 0, latest: state.latest.map((row) => ({ ...row, status: "READ" as const })) })),
  dropPriceRequest: (id) => set((state) => ({ pricePending: state.pricePending.filter((row) => row.id !== id) })),
}))
