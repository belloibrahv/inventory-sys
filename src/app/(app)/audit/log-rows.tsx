"use client"

import { useState } from "react"
import { StatusBadge } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { formatRecordChange, pageNameFromPath, recordKindLabel } from "@/lib/shop-speak"
import { statusLabel } from "@/lib/status"
import { formatDateTime } from "@/lib/utils"

type Log = {
  id: string
  when: Date
  who: string
  email: string
  action: string
  entityType: string
  entityId: string
  change: string | null
  ip: string | null
  path: string | null
  success: boolean
  risk: string
  afterHours: boolean
}

export function AuditLogRows({ logs }: { logs: Log[] }) {
  const [open, setOpen] = useState<string | null>(null)

  if (!logs.length) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing matches what you picked.</p>
  }

  return (
    <div className="divide-y divide-border">
      {logs.map((log) => {
        const expanded = open === log.id
        const page = pageNameFromPath(log.path)
        const kind = recordKindLabel(log.entityType)
        const change = formatRecordChange(log.change)
        return (
          <button
            key={log.id}
            type="button"
            onClick={() => setOpen(expanded ? null : log.id)}
            className="block w-full px-4 py-3 text-left hover:bg-muted/60"
          >
            <div className="grid gap-2 md:grid-cols-[160px_1fr_auto] md:items-center">
              <p className="text-xs text-muted-foreground">{formatDateTime(log.when)}</p>
              <div>
                <p className="text-sm font-medium">{log.who}</p>
                <p className="text-sm text-muted-foreground">
                  {kind}
                  {log.entityId && !log.entityId.startsWith("c") ? ` · ${log.entityId}` : ""}
                  {page ? ` · ${page}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <StatusBadge value={log.action} />
                <Badge variant={log.risk === "HIGH" ? "danger" : log.risk === "MEDIUM" ? "warning" : "muted"}>
                  {statusLabel(log.risk)}
                </Badge>
                {!log.success ? <Badge variant="danger">Failed</Badge> : null}
                {log.afterHours ? <Badge variant="warning">Night</Badge> : null}
              </div>
            </div>
            {expanded ? (
              <div className="mt-3 space-y-1 rounded-xl bg-muted px-3 py-3 text-sm">
                <p>Work email: {log.email}</p>
                <p>Device: {log.ip ?? "Not recorded"}</p>
                {page ? <p>Page: {page}</p> : null}
                {change ? <p>{change}</p> : <p>There is nothing more to show on this row.</p>}
                <p className="text-muted-foreground">Nobody can change or delete this row.</p>
              </div>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
