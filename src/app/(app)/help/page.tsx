import { ManualDocument } from "@/components/manual-document"
import { ManualLookup } from "@/components/manual-lookup"
import { PageHeader } from "@/components/shared"
import { PrintButton } from "@/components/print-button"
import { watDayKey } from "@/lib/lagos-day"
import { buildRoleManual } from "@/lib/manual"
import { getAllowedKeys, hrefsForKeys } from "@/lib/permissions"
import { getAppSettings } from "@/lib/settings"
import { requireUser } from "@/lib/session"

export default async function HelpPage() {
  const [user, settings] = await Promise.all([requireUser(), getAppSettings()])
  const keys = await getAllowedKeys(user.role)
  const allowedHrefs = hrefsForKeys(keys)
  const data = buildRoleManual(user.role, keys, allowedHrefs)
  const statementRef = `HB-${data.role}-${watDayKey().replaceAll("-", "")}`

  return (
    <div className="space-y-6">
      <div className="manual-chrome print:hidden space-y-4">
        <PageHeader
          title="How to use this"
          description={`A small book for ${data.roleLabel} only. It shows the pages and the work this login can do. Print it and keep it at the till.`}
          actions={<PrintButton label="Print / Save PDF" />}
        />
        <ManualLookup data={data} />
      </div>
      <ManualDocument
        data={data}
        company={{
          name: settings.companyName,
          phone: settings.companyPhone,
          address: settings.companyAddress,
          email: settings.companyEmail,
        }}
        preparedBy={user.name || user.email}
        statementRef={statementRef}
        preparedAt={new Date().toISOString()}
      />
    </div>
  )
}
