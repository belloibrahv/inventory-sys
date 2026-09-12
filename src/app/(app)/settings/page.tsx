import { getSettings } from "@/app/actions/finance"
import { PageHeader } from "@/components/shared"
import { can } from "@/lib/permissions"
import { requireUser } from "@/lib/session"
import { SettingCards, isCompanySetting } from "./setting-cards"

/**
 * Settings, section one: the details that get printed.
 *
 * Company details, selling rules and the backup download used to be one long
 * scroll. Changing the shop phone number and deciding whether cashiers may go
 * under the lowest price are not the same kind of decision, and the second one
 * should not be two screens down from the first by accident.
 */
export default async function SettingsPage() {
  const [me, settings] = await Promise.all([requireUser(), getSettings()])
  const canEdit = await can(me.role, "action.settings")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shop details"
        description="The name, phone, address and currency printed on every receipt and invoice, in every shop."
      />
      {!canEdit ? (
        <div className="surface-card p-5 text-sm text-muted-foreground">
          You can read these. Only staff allowed to change shop settings can edit them.
        </div>
      ) : null}
      <SettingCards settings={settings.filter((row) => isCompanySetting(row.key))} canEdit={canEdit} />
    </div>
  )
}
