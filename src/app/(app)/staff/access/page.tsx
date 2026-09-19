import { redirect } from "next/navigation"
import { getRoleMatrix, saveRoleAccess } from "@/app/actions/access"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { ACTION_PERMS, VIEW_PERMS } from "@/lib/permissions"
import { ROLE_LABELS, isShopOwner } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { UserRole } from "@prisma/client"

const editableRoles = (Object.keys(ROLE_LABELS) as UserRole[]).filter(
  (role) => role !== "SUPER_ADMIN" && role !== "CEO"
)

function RoleAccessCard({
  role,
  allowed,
  note,
}: {
  role: UserRole
  allowed: Map<string, boolean>
  note?: string
}) {
  return (
    <div className="surface-card p-5">
      <h3 className="mb-1 font-semibold">{ROLE_LABELS[role]}</h3>
      {note ? <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{note}</p> : <div className="mb-4" />}
      <ActionForm action={saveRoleAccess} submit={`Save ${ROLE_LABELS[role]} pages`} className="space-y-4">
        <input type="hidden" name="role" value={role} />
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Pages they can open
          </p>
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
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            What they can do
          </p>
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
  )
}

export default async function AccessPage() {
  const user = await requireUser()
  if (!isShopOwner(user.role)) redirect("/staff")
  const matrix = await getRoleMatrix()
  if ("error" in matrix) redirect("/staff")
  const allowed = new Map(matrix.rows.map((row) => [`${row.role}:${row.permKey}`, row.allowed]))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Who can see what"
        description="Tick the pages each job may open. The left menu only shows what is ticked for that job. Super Admin and the CEO always keep every page."
      />

      <div className="space-y-6">
        <RoleAccessCard
          role="AUDITOR"
          allowed={allowed}
          note="Internal Auditor: full shop oversight on the left menu. Post money. Cannot sell, load stock, or change this list."
        />
        <RoleAccessCard
          role="ACCOUNTANT"
          allowed={allowed}
          note="Financial Accountant: money and books pages only. Keep Sell now, Upload stock, repairs, and other floor jobs off unless you mean to give them."
        />
        {editableRoles
          .filter((role) => role !== "AUDITOR" && role !== "ACCOUNTANT")
          .map((role) => (
            <RoleAccessCard key={role} role={role} allowed={allowed} />
          ))}
      </div>
    </div>
  )
}
