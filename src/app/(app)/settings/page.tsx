import { getSettings } from "@/app/actions/finance"
import { PageHeader } from "@/components/shared"
import { can } from "@/lib/permissions"
import { isLetterheadKey, letterheadFromSettings } from "@/lib/letterhead"
import { canEditLetterhead } from "@/lib/roles"
import { requireUser } from "@/lib/session"
import { LetterheadEditor } from "./letterhead-editor"
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
  const letterheadEdit = canEditLetterhead(me.role)
  const map = Object.fromEntries(settings.map((row) => [row.key, row.value]))
  const brand = letterheadFromSettings({
    companyName: map["company.name"],
    productName: map["company.product"],
    companyPhone: map["company.phone"],
    companyAddress: map["company.address"],
    companyEmail: map["company.email"],
    companyLogo: map["company.logo"],
    companyFooter: map["company.footer"],
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shop details"
        description="Logo, name, phone, and address on invoices."
      />
      <LetterheadEditor brand={brand} canEdit={letterheadEdit} />
      {!canEdit ? (
        <div className="surface-card p-5 text-sm text-muted-foreground">
          Currency stays with the main admin. The invoice header above can be changed by the main admin, the CEO, the accountant or the auditor.
        </div>
      ) : (
        <h2 className="text-sm font-semibold">Currency</h2>
      )}
      <SettingCards
        settings={settings.filter((row) => isCompanySetting(row.key) && !isLetterheadKey(row.key))}
        canEdit={canEdit}
      />
    </div>
  )
}
