import { saveSetting } from "@/app/actions/finance"
import { ActionForm } from "@/components/action-form"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

export type SettingRow = { id: string; key: string; value: string; description: string | null }

export const settingLabels: Record<string, string> = {
  "company.name": "Shop name on invoices",
  "company.product": "System name",
  "company.phone": "Phone on invoices",
  "company.address": "Address on invoices",
  "company.email": "Email on invoices",
  "company.currency": "Currency",
  "sales.allow_below_minimum": "Can cashiers sell under the lowest price?",
  "inventory.low_stock_threshold": "Warn me when an item drops to this many",
  "sales.warranty_days": "Warranty days for a new item",
}

/**
 * One card per setting. Shared by Shop details and Selling rules, which are the
 * same grid over two different slices of the same table.
 */
export function SettingCards({ settings, canEdit }: { settings: SettingRow[]; canEdit: boolean }) {
  if (settings.length === 0) {
    return <div className="surface-card p-5 text-sm text-muted-foreground">Nothing to set here yet.</div>
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {settings.map((setting) => (
        <div key={setting.id} className="surface-card p-5">
          <p className="text-sm font-medium">{settingLabels[setting.key] ?? setting.key}</p>
          <p className="mb-3 text-xs text-muted-foreground">{setting.description}</p>
          {canEdit ? (
            <ActionForm action={saveSetting} submit="Update" className="space-y-3">
              <input type="hidden" name="key" value={setting.key} />
              {setting.key === "sales.allow_below_minimum" ? (
                <Select name="value" defaultValue={setting.value}>
                  <option value="false">No. Only the main admin can sell under the lowest price</option>
                  <option value="true">Yes. Cashiers can sell under the lowest price</option>
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
  )
}

/** Everything printed on a receipt belongs to Shop details; the rest are rules. */
export function isCompanySetting(key: string) {
  return key.startsWith("company.")
}
