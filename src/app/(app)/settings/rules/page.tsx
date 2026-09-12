import { getSettings } from "@/app/actions/finance"
import { PageHeader } from "@/components/shared"
import { can } from "@/lib/permissions"
import { requireUser } from "@/lib/session"
import { SettingCards, isCompanySetting } from "../setting-cards"

/** The rules the shop runs on: price floor, low stock warning, warranty. */
export default async function SettingsRulesPage() {
  const [me, settings] = await Promise.all([requireUser(), getSettings()])
  const canEdit = await can(me.role, "action.settings")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Selling rules"
        description="These change what staff are allowed to do at the counter and when the system starts warning you about stock. They apply to every shop."
      />
      {!canEdit ? (
        <div className="surface-card p-5 text-sm text-muted-foreground">
          You can read these. Only staff allowed to change shop settings can edit them.
        </div>
      ) : null}
      <SettingCards settings={settings.filter((row) => !isCompanySetting(row.key))} canEdit={canEdit} />
    </div>
  )
}
