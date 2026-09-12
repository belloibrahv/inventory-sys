import { redirect } from "next/navigation"
import { getRoleMatrix, saveRoleAccess } from "@/app/actions/access"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { ACTION_PERMS, BOOKS_DESK_KEYS, VIEW_PERMS } from "@/lib/permissions"
import { ROLE_LABELS, isSuperAdmin } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { UserRole } from "@prisma/client"

const otherRoles = (Object.keys(ROLE_LABELS) as UserRole[]).filter(
  (role) => role !== "SUPER_ADMIN" && role !== "AUDITOR" && role !== "ACCOUNTANT"
)

export default async function AccessPage() {
  const user = await requireUser()
  if (!isSuperAdmin(user.role)) redirect("/staff")
  const matrix = await getRoleMatrix()
  if ("error" in matrix) redirect("/staff")
  const allowed = new Map(matrix.rows.map((row) => [`${row.role}:${row.permKey}`, row.allowed]))

  const booksConfigured = matrix.rows.some((row) => row.role === "AUDITOR" || row.role === "ACCOUNTANT")
  function booksOn(key: string) {
    if (!booksConfigured) return BOOKS_DESK_KEYS.includes(key)
    return allowed.get(`AUDITOR:${key}`) === true || allowed.get(`ACCOUNTANT:${key}`) === true
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Who can see what"
        description="Only the main admin can tick what each job can see and do. Only the main admin can undo money or lock a staff login."
      />

      <div className="space-y-6">
        <div className="surface-card border-primary/30 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-primary">Books desk</p>
              <h3 className="font-semibold">Records checker + Accountant</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                These two jobs share one set of pages. Tick once here and both logins can check the books, see Who did
                what, record expenses, pay suppliers, and collect money. No need to swap accounts.
              </p>
            </div>
            <div className="rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary">One key ring · two badges</div>
          </div>
          <ActionForm action={saveRoleAccess} submit="Save books desk" className="space-y-4">
            <input type="hidden" name="role" value="AUDITOR" />
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pages the books desk can open
              </p>
              <div className="grid gap-2 md:grid-cols-3">
                {VIEW_PERMS.filter((row) => row.key !== "view.access").map((row) => (
                  <label key={row.key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={row.key} defaultChecked={booksOn(row.key)} />
                    {row.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Work the books desk can do
              </p>
              <div className="grid gap-2 md:grid-cols-3">
                {ACTION_PERMS.map((row) => (
                  <label key={row.key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={row.key} defaultChecked={booksOn(row.key)} />
                    {row.label}
                  </label>
                ))}
              </div>
            </div>
          </ActionForm>
        </div>

        {otherRoles.map((role) => (
          <div key={role} className="surface-card p-5">
            <h3 className="mb-4 font-semibold">{ROLE_LABELS[role]}</h3>
            <ActionForm action={saveRoleAccess} submit={`Save ${ROLE_LABELS[role]}`} className="space-y-4">
              <input type="hidden" name="role" value={role} />
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Pages this job can open
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
                  Work this job can do
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
        ))}
      </div>
    </div>
  )
}
