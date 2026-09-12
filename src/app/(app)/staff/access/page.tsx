import { redirect } from "next/navigation"
import { getRoleMatrix, saveRoleAccess } from "@/app/actions/access"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { ACTION_PERMS, VIEW_PERMS } from "@/lib/permissions"
import { ROLE_LABELS, isSuperAdmin } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { UserRole } from "@prisma/client"

const editableRoles = (Object.keys(ROLE_LABELS) as UserRole[]).filter((role) => role !== "SUPER_ADMIN")

export default async function AccessPage() {
  const user = await requireUser()
  if (!isSuperAdmin(user.role)) redirect("/staff")
  const matrix = await getRoleMatrix()
  if ("error" in matrix) redirect("/staff")
  const allowed = new Map(matrix.rows.map((row) => [`${row.role}:${row.permKey}`, row.allowed]))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Who can see what"
        description="Only the main admin can tick what each job can see and do. Only the main admin can undo money or lock a staff login."
      />
      <div className="space-y-6">
        {editableRoles.map((role) => (
          <div key={role} className="surface-card p-5">
            <h3 className="mb-4 font-semibold">{ROLE_LABELS[role]}</h3>
            <ActionForm action={saveRoleAccess} submit={`Save ${ROLE_LABELS[role]}`} className="space-y-4">
              <input type="hidden" name="role" value={role} />
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Pages this job can open</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {VIEW_PERMS.filter((row) => row.key !== "view.access").map((row) => (
                    <label key={row.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name={row.key} defaultChecked={allowed.get(`${role}:${row.key}`) === true} />
                      {row.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Work this job can do</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {ACTION_PERMS.map((row) => (
                    <label key={row.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name={row.key} defaultChecked={allowed.get(`${role}:${row.key}`) === true} />
                      {row.label}
                    </label>
                  ))}
                </div>
              </div>
            </ActionForm>
          </div>
        ))}
      </div>
    </div>
  )
}
