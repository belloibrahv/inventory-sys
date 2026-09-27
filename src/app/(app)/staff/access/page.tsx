import Link from "next/link"
import { redirect } from "next/navigation"
import { getRoleMatrix, saveRoleAccess } from "@/app/actions/access"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { ACTION_PERMS, CEO_ONLY_KEYS, VIEW_PERMS } from "@/lib/permissions"
import { ROLE_LABELS, isCEO, isShopOwner } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { cn } from "@/lib/utils"
import { UserRole } from "@prisma/client"

/** Everyone but the CEO. The main admin's own row is the CEO's to set. */
const editableRoles = (Object.keys(ROLE_LABELS) as UserRole[]).filter((role) => role !== "CEO")

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
      <ActionForm action={saveRoleAccess} submit="Save these pages"
        successMessage={`${ROLE_LABELS[role]} pages saved.`} className="space-y-4">
        <input type="hidden" name="role" value={role} />
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Pages they can open
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {VIEW_PERMS.filter((row) => row.key !== "view.access" && !CEO_ONLY_KEYS.includes(row.key)).map((row) => (
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
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ACTION_PERMS.filter((row) => !CEO_ONLY_KEYS.includes(row.key)).map((row) => (
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

const ROLE_NOTES: Partial<Record<UserRole, string>> = {
  SUPER_ADMIN:
    "System Administrator: keeps the system running (staff logins, shops, settings, backups, Who did what). Tick business pages only if the main admin truly needs them.",
  AUDITOR: "Internal Auditor: full shop oversight on the left menu. Post money. Cannot sell, load stock, or change this list.",
  ACCOUNTANT:
    "Financial Accountant: money and books pages only. Keep Sell now, Upload stock, repairs, and other floor jobs off unless you mean to give them.",
}

/** Auditor and Accountant first: they are the jobs owners adjust most. */
const FIRST: UserRole[] = ["SUPER_ADMIN", "AUDITOR", "ACCOUNTANT"]
const roleOrder = [...FIRST, ...editableRoles.filter((role) => !FIRST.includes(role))]

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const user = await requireUser()
  if (!isShopOwner(user.role)) redirect("/staff")
  const matrix = await getRoleMatrix()
  if ("error" in matrix) redirect("/staff")
  const allowed = new Map(matrix.rows.map((row) => [`${row.role}:${row.permKey}`, row.allowed]))
  const { role: asked } = await searchParams
  // Only the CEO sets the main admin's job.
  const roles = isCEO(user.role) ? roleOrder : roleOrder.filter((row) => row !== "SUPER_ADMIN")
  const role = roles.find((row) => row === asked) ?? roles[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Who can see what"
        description="Pick a job, then tick the pages it may open. The left menu only shows what is ticked for that job. The CEO keeps every page, and alone sees profit and cost prices and changes prices."
      />

      <nav aria-label="Pick a job" className="flex flex-wrap gap-2">
        {roles.map((row) => (
          <Link
            key={row}
            href={`/staff/access?role=${row}`}
            aria-current={row === role ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              row === role
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {ROLE_LABELS[row]}
          </Link>
        ))}
      </nav>

      <RoleAccessCard key={role} role={role} allowed={allowed} note={ROLE_NOTES[role]} />
    </div>
  )
}
