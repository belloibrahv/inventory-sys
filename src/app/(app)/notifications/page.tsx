import { getNotifications, markNotificationsRead } from "@/app/actions/finance"
import { PageHeader } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/utils"

async function markAllRead() {
  "use server"
  await markNotificationsRead()
}

export default async function NotificationsPage() {
  const rows = await getNotifications()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        description="Low stock, things waiting for approval, money due, goods moving between shops, and returns."
        actions={
          <form action={markAllRead}>
            <Button>Mark all read</Button>
          </form>
        }
      />
      <div className="space-y-3">
        {rows.map((row) => (
          <a key={row.id} href={row.actionUrl ?? "#"} className="surface-card block p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{row.title}</p>
                <p className="text-sm text-muted-foreground">{row.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</p>
              </div>
              <Badge variant={row.status === "UNREAD" ? "warning" : "muted"}>{row.status}</Badge>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
