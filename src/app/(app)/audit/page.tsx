import { getAuditLogs } from "@/app/actions/finance"
import { PageHeader, StatusBadge } from "@/components/shared"
import { formatDateTime } from "@/lib/utils"

export default async function AuditPage() {
  const logs = await getAuditLogs()
  return (
    <div className="space-y-6">
      <PageHeader title="Who did what" description="Every important change is kept: who did it, when, in which shop, and what changed. Nothing is deleted." />
      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Who</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Change</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-border/70">
                <td className="px-4 py-3">{formatDateTime(log.createdAt)}</td>
                <td className="px-4 py-3">{log.user.name}</td>
                <td className="px-4 py-3"><StatusBadge value={log.action} /></td>
                <td className="px-4 py-3">{log.entityType} · {log.entityId}</td>
                <td className="max-w-xs truncate px-4 py-3 text-xs text-muted-foreground">{log.newValue ?? log.oldValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
