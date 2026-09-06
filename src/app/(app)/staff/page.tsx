import { setStaffActive } from "@/app/actions/access"
import { createStaff, getStaff } from "@/app/actions/finance"
import { getBranches } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { canManageStaff, isSuperAdmin, ROLE_LABELS } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { UserRole } from "@prisma/client"

export default async function StaffPage() {
  const me = await requireUser()
  const [staff, branches] = await Promise.all([getStaff(), getBranches()])
  const canAdd = await canManageStaff(me.role)
  const roles = (Object.keys(ROLE_LABELS) as UserRole[]).filter((role) => isSuperAdmin(me.role) || role !== "SUPER_ADMIN")
  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <div>
        <PageHeader
          title="Staff"
          description="Super Admin decides what each person can see. Open Who can see what to tick the pages for each role."
        />
        <div className="surface-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((user) => (
                <tr key={user.id} className="border-b border-border/70">
                  <td className="px-4 py-3 font-medium">{user.name}</td>
                  <td className="px-4 py-3"><Badge>{ROLE_LABELS[user.role]}</Badge></td>
                  <td className="px-4 py-3">{user.branch?.name ?? "All branches"}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>{user.isActive ? "Active" : "Disabled"}</span>
                      {isSuperAdmin(me.role) && user.id !== me.id ? (
                        <ActionForm
                          action={setStaffActive}
                          submit={user.isActive ? "Disable" : "Restore"}
                          size="sm"
                          variant="outline"
                          buttonClassName=""
                        >
                          <input type="hidden" name="id" value={user.id} />
                          <input type="hidden" name="active" value={user.isActive ? "false" : "true"} />
                        </ActionForm>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Add staff</h3>
        {canAdd ? (
        <ActionForm action={createStaff} submit="Create staff login" className="space-y-3">
          <Input name="name" placeholder="Full name" required />
          <Input name="email" type="email" placeholder="work email" required />
          <Input name="password" type="password" placeholder="Temporary password" required />
          <Select name="role" defaultValue="SALES_EXECUTIVE">
            {roles.map((role) => (
              <option key={role} value={role}>{ROLE_LABELS[role]}</option>
            ))}
          </Select>
          <Select name="branchId">
            <option value="">Head office / all shops</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </Select>
        </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">You can see staff. Super Admin must allow you to add a new login.</p>
        )}
      </div>
    </div>
  )
}
