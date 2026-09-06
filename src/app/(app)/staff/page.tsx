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
    <div className="page-split">
      <div className="min-w-0">
        <PageHeader
          title="Staff"
          description="Super Admin decides what each person can see. Open Who can see what to tick the pages for each role."
        />
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
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
      </div>
      <div className="surface-card p-5 sm:p-6">
        <h3 className="mb-4 font-semibold">Add staff</h3>
        {canAdd ? (
        <ActionForm action={createStaff} submit="Create staff login" className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Full name</span>
            <Input name="name" placeholder="e.g. Blessing Adeyemi" required />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Work email</span>
            <Input name="email" type="email" placeholder="name@abutwins.com" required />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Temporary password</span>
            <Input name="password" type="password" placeholder="They must change this" required />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Job</span>
            <Select name="role" defaultValue="SALES_EXECUTIVE">
              {roles.map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Shop</span>
            <Select name="branchId">
              <option value="">Head office / all shops</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </label>
        </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">You can see staff. Super Admin must allow you to add a new login.</p>
        )}
      </div>
    </div>
  )
}
