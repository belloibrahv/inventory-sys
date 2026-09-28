import { getNotifications } from "@/app/actions/finance"
import { PageHeader } from "@/components/shared"
import { AlertsList } from "./alerts-list"

export default async function NotificationsPage() {
  const rows = await getNotifications()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        description="Price approvals, work waiting, low stock, money due, and returns. Open one to mark it read."
      />
      <AlertsList
        rows={rows.map((row) => ({
          id: row.id,
          title: row.title,
          message: row.message,
          actionUrl: row.actionUrl,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        }))}
      />
    </div>
  )
}
