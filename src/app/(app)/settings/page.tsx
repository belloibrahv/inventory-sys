import { getSettings, saveSetting } from "@/app/actions/finance"
import { BackupButton } from "@/app/(app)/settings/backup-button"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { can, isSuperAdmin } from "@/lib/permissions"
import { requireUser } from "@/lib/session"

const labels: Record<string, string> = {
  "company.name": "Shop name on invoices",
  "company.product": "System name",
  "company.phone": "Phone on invoices",
  "company.address": "Address on invoices",
  "company.email": "Email on invoices",
  "company.currency": "Currency",
  "sales.allow_below_minimum": "Can cashiers sell below the lowest price?",
  "inventory.low_stock_threshold": "Alert when stock is this low",
  "sales.warranty_days": "Default warranty (days)",
}

export default async function SettingsPage() {
  const [me, settings] = await Promise.all([requireUser(), getSettings()])
  const canEdit = await can(me.role, "action.settings")
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="These settings change receipts, selling rules, and stock alerts for every shop."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {settings.map((setting) => (
          <div key={setting.id} className="surface-card p-5">
            <p className="text-sm font-medium">{labels[setting.key] ?? setting.key}</p>
            <p className="mb-3 text-xs text-muted-foreground">{setting.description}</p>
            {canEdit ? (
            <ActionForm action={saveSetting} submit="Update" className="space-y-3">
              <input type="hidden" name="key" value={setting.key} />
              {setting.key === "sales.allow_below_minimum" ? (
                <Select name="value" defaultValue={setting.value}>
                  <option value="false">No. Only Super Admin can go below the lowest price</option>
                  <option value="true">Yes. Cashiers may go below the lowest price</option>
                </Select>
              ) : (
                <Input name="value" defaultValue={setting.value} />
              )}
            </ActionForm>
            ) : (
              <p className="text-sm font-medium">{setting.value}</p>
            )}
          </div>
        ))}
      </div>
      {isSuperAdmin(me.role) ? (
        <div className="surface-card p-5">
          <h3 className="mb-2 font-semibold">Shop backup</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Downloads a JSON copy of shops, staff emails (not passwords), stock, IMEIs, sales, and purchases. Keep it off this computer.
          </p>
          <BackupButton />
        </div>
      ) : null}
    </div>
  )
}
