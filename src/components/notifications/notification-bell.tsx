"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, BellRing, CheckCheck, CircleDollarSign, Package, RotateCcw, Truck, Wallet } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useNotifications, type LiveNotification } from "@/store/notifications"
import { cn } from "@/lib/utils"
import { deviceAlertsState, turnOnDeviceAlerts } from "./alert-signals"

const ICON: Record<string, LucideIcon> = {
  PRICE_REQUEST: CircleDollarSign,
  PRICE_UPDATE: CircleDollarSign,
  APPROVAL_REQUEST: BellRing,
  LOW_STOCK: Package,
  DUE_PAYMENT: Wallet,
  TRANSFER: Truck,
  RETURN: RotateCcw,
}

/** "just now", "5 min ago", "2 h ago", then the date. */
export function whenLabel(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" })
}

/**
 * The bell in the top bar. The count is live; opening it shows the newest
 * alerts, each one read the moment it is opened.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter()
  const loaded = useNotifications((state) => state.loaded)
  const unread = useNotifications((state) => (state.loaded ? state.unread : initialUnread))
  const latest = useNotifications((state) => state.latest)
  const pending = useNotifications((state) => state.pricePending.length)
  const markReadLocally = useNotifications((state) => state.markReadLocally)
  const markAllReadLocally = useNotifications((state) => state.markAllReadLocally)
  const [device, setDevice] = useState<ReturnType<typeof deviceAlertsState>>("unsupported")
  useEffect(() => setDevice(deviceAlertsState()), [])

  function open(row: LiveNotification) {
    if (row.status === "UNREAD") {
      markReadLocally(row.id)
      void markNotificationRead(row.id)
    }
    router.push(row.actionUrl || "/notifications")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground hover:bg-muted"
          aria-label={unread > 0 ? `Alerts, ${unread} unread` : "Alerts"}
        >
          {pending > 0 ? <BellRing className="h-5 w-5 text-primary" /> : <Bell className="h-5 w-5" />}
          {unread > 0 ? (
            <span className="absolute right-1 top-1 min-w-[1.1rem] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[1.1rem] text-white ring-2 ring-background tabular-nums">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <DropdownMenuLabel className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="text-sm font-semibold">Alerts</span>
          {unread > 0 ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={() => {
                markAllReadLocally()
                void markAllNotificationsRead()
              }}
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />
        {pending > 0 ? (
          <button
            type="button"
            onClick={() => router.push("/approvals")}
            className="flex w-full items-center gap-2 bg-primary-soft px-3 py-2.5 text-left text-sm font-medium text-primary"
          >
            <BellRing className="h-4 w-4" />
            {pending} price approval{pending === 1 ? "" : "s"} waiting on you
          </button>
        ) : null}
        <div className="max-h-[60vh] overflow-y-auto">
          {!loaded ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading alerts…</p>
          ) : latest.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No alerts yet.</p>
          ) : (
            latest.slice(0, 8).map((row) => {
              const Icon = ICON[row.type] ?? Bell
              const isUnread = row.status === "UNREAD"
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => open(row)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-muted/60",
                    isUnread ? "bg-primary-soft/40" : ""
                  )}
                >
                  <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", isUnread ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", isUnread ? "font-semibold" : "font-medium")}>{row.title}</span>
                    <span className="line-clamp-2 block text-xs text-muted-foreground">{row.message}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{whenLabel(row.createdAt)}</span>
                  </span>
                  {isUnread ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                </button>
              )
            })
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <button type="button" onClick={() => router.push("/notifications")} className="text-xs font-medium text-primary hover:underline">
            See all alerts
          </button>
          {device === "off" ? (
            <button
              type="button"
              onClick={async () => setDevice(await turnOnDeviceAlerts())}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Turn on alerts on this device
            </button>
          ) : device === "on" ? (
            <span className="text-[11px] text-muted-foreground">Device alerts on</span>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
