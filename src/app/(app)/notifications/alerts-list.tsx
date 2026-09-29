"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCheck } from "lucide-react"
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications"
import { deviceAlertsState, turnOnDeviceAlerts } from "@/components/notifications/alert-signals"
import { whenLabel } from "@/components/notifications/notification-bell"
import { Button } from "@/components/ui/button"
import { useNotifications } from "@/store/notifications"
import { cn } from "@/lib/utils"
import { watDayKey } from "@/lib/lagos-day"

type Row = {
  id: string
  title: string
  message: string
  actionUrl: string | null
  status: string
  createdAt: string
}

/**
 * Today, Yesterday or the date, all in Lagos time. The device clock gave UTC
 * on the server and Lagos in the browser, so around midnight the same alert
 * sat under different days and the page failed to hydrate.
 */
function dayLabel(iso: string) {
  const day = new Date(iso)
  const key = watDayKey(day)
  if (key === watDayKey()) return "Today"
  if (key === watDayKey(new Date(Date.now() - 86_400_000))) return "Yesterday"
  return day.toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long" })
}

export function AlertsList({ rows: initial }: { rows: Row[] }) {
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [filter, setFilter] = useState<"UNREAD" | "ALL">(initial.some((row) => row.status === "UNREAD") ? "UNREAD" : "ALL")
  const [device, setDevice] = useState<ReturnType<typeof deviceAlertsState>>("unsupported")
  const markReadLocally = useNotifications((state) => state.markReadLocally)
  const markAllReadLocally = useNotifications((state) => state.markAllReadLocally)
  useEffect(() => setDevice(deviceAlertsState()), [])
  useEffect(() => setRows(initial), [initial])

  const unread = rows.filter((row) => row.status === "UNREAD").length
  const shown = filter === "UNREAD" ? rows.filter((row) => row.status === "UNREAD") : rows
  const groups = useMemo(() => {
    const out: Array<{ label: string; rows: Row[] }> = []
    for (const row of shown) {
      const label = dayLabel(row.createdAt)
      const last = out[out.length - 1]
      if (last && last.label === label) last.rows.push(row)
      else out.push({ label, rows: [row] })
    }
    return out
  }, [shown])

  function open(row: Row) {
    if (row.status === "UNREAD") {
      setRows((current) => current.map((item) => (item.id === row.id ? { ...item, status: "READ" } : item)))
      markReadLocally(row.id)
      void markNotificationRead(row.id)
    }
    if (row.actionUrl) router.push(row.actionUrl)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-muted p-1 text-sm font-medium">
          {(
            [
              ["UNREAD", `Unread (${unread})`],
              ["ALL", `All (${rows.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn("rounded-md px-3 py-1.5", filter === key ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {device === "off" ? (
            <Button type="button" variant="outline" size="sm" onClick={async () => setDevice(await turnOnDeviceAlerts())}>
              Turn on alerts on this device
            </Button>
          ) : device === "blocked" ? (
            <span className="text-xs text-muted-foreground">Alerts are blocked for this site in the browser settings.</span>
          ) : device === "on" ? (
            <span className="text-xs text-muted-foreground">This device shows alerts when the app is in the background.</span>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={unread === 0}
            onClick={() => {
              setRows((current) => current.map((row) => ({ ...row, status: "READ" })))
              markAllReadLocally()
              void markAllNotificationsRead()
            }}
          >
            <CheckCheck className="mr-1.5 h-4 w-4" /> Mark all read
          </Button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="surface-card px-4 py-8 text-center text-sm text-muted-foreground">
          {filter === "UNREAD" ? "You are all caught up." : "No alerts yet."}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</h2>
            <ul className="surface-card divide-y divide-border overflow-hidden">
              {group.rows.map((row) => {
                const isUnread = row.status === "UNREAD"
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => open(row)}
                      className={cn("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50", isUnread && "bg-primary-soft/30")}
                    >
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", isUnread ? "bg-primary" : "bg-transparent")} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", isUnread ? "font-semibold" : "font-medium")}>{row.title}</span>
                        <span className="block text-sm text-muted-foreground">{row.message}</span>
                      </span>
                      {/* "5 min ago" can tick over between the server drawing it and
                          the browser taking over; that difference is expected. */}
                      <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                        {whenLabel(row.createdAt)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
