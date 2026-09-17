import { BackupButton } from "@/app/(app)/settings/backup-button"
import { PageHeader, SectionCard } from "@/components/shared"
import { isShopOwner } from "@/lib/permissions"
import { requireUser } from "@/lib/session"

/** The whole shop in one file. Main admin or CEO. */
export default async function SettingsBackupPage() {
  const me = await requireUser()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shop backup"
        description="One file copy of what the system knows."
      />

      {isShopOwner(me.role) ? (
        <SectionCard title="Shop backup" description="Keep the file off this computer.">
          <BackupButton />
        </SectionCard>
      ) : (
        <div className="surface-card p-5 text-sm text-muted-foreground">
          Only the main admin or the CEO can download a backup.
        </div>
      )}
    </div>
  )
}
