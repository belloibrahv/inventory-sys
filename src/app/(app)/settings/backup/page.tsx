import { BackupButton } from "@/app/(app)/settings/backup-button"
import { PageHeader, SectionCard } from "@/components/shared"
import { isSuperAdmin } from "@/lib/permissions"
import { requireUser } from "@/lib/session"

/** The whole shop in one file. Main admin only. */
export default async function SettingsBackupPage() {
  const me = await requireUser()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup"
        description="A copy of everything the system knows, in one file you keep yourself."
      />

      {isSuperAdmin(me.role) ? (
        <SectionCard title="Shop backup">
          <p className="mb-4 text-sm text-muted-foreground">
            Downloads a copy of shops, staff emails (not passwords), stock, IMEIs, sales, and purchases. Keep that file
            off this computer.
          </p>
          <BackupButton />
        </SectionCard>
      ) : (
        <div className="surface-card p-5 text-sm text-muted-foreground">
          Only the main admin can download a backup. The file holds every sale, every customer and every staff email in
          the business, so it is kept to one person.
        </div>
      )}
    </div>
  )
}
