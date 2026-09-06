"use client"

import { useState } from "react"
import { StatusBadge } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
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
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing matches these filters.</p>
  }

  return (
    <div className="divide-y divide-border">
      {logs.map((log) => {
        const expanded = open === log.id
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
                <p className="text-xs text-muted-foreground">
                  {log.entityType} · {log.entityId}
                  {log.path ? ` · ${log.path}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <StatusBadge value={log.action} />
                <Badge variant={log.risk === "HIGH" ? "danger" : log.risk === "MEDIUM" ? "warning" : "muted"}>{log.risk}</Badge>
                {!log.success ? <Badge variant="danger">Failed</Badge> : null}
                {log.afterHours ? <Badge variant="warning">Night</Badge> : null}
              </div>
            </div>
            {expanded ? (
              <div className="mt-3 space-y-1 rounded-xl bg-muted px-3 py-3 text-xs">
                <p>Email: {log.email}</p>
                <p>Device: {log.ip ?? "Not recorded"}</p>
                {log.change ? <p className="break-all font-mono">{log.change}</p> : <p>No extra detail on this row.</p>}
                <p className="text-muted-foreground">This row cannot be edited or deleted.</p>
              </div>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
