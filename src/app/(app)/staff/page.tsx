import { setStaffActive } from "@/app/actions/access"
import { createStaff, getStaff, updateStaff } from "@/app/actions/finance"
import { getBranches } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Select } from "@/components/ui/select"
import { canManageStaff, isSuperAdmin, ROLE_LABELS } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { UserRole } from "@prisma/client"

export default async function StaffPage() {
  const me = await requireUser()
  const [staff, branches] = await Promise.all([getStaff(), getBranches()])
  const canAdd = await canManageStaff(me.role)
  const admin = isSuperAdmin(me.role)
  const roles = (Object.keys(ROLE_LABELS) as UserRole[]).filter((role) => admin || role !== "SUPER_ADMIN")
  const activeShops = branches.filter((branch) => branch.isActive)

  return (
    <div className="page-split">
      <div className="min-w-0">
        <PageHeader
          title="Staff"
          description="The main admin decides what each person can see. You can also move someone to another shop or change their job without creating a new login."
        />
        <div className="space-y-3">
          {staff.map((user) => {
            const canEditThis =
              canAdd &&
              user.id !== me.id &&
              (admin || (user.branchId && me.branchId && user.branchId === me.branchId)) &&
              (admin || user.role !== "SUPER_ADMIN")

            return (
              <div key={user.id} className="surface-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge>{ROLE_LABELS[user.role]}</Badge>
                      <span className="text-sm text-muted-foreground">{user.branch?.name ?? "All shops"}</span>
                      <span className="text-xs text-muted-foreground">{user.isActive ? "Active" : "Disabled"}</span>
                    </div>
                  </div>
                  {admin && user.id !== me.id ? (
                    <ActionForm
                      action={setStaffActive}
                      submit={user.isActive ? "Disable" : "Restore"}
                      size="sm"
                      variant="outline"
                      buttonClassName=""
                      successMessage={user.isActive ? "Login disabled" : "Login restored"}
                      resetOnSuccess={false}
                    >
                      <input type="hidden" name="id" value={user.id} />
                      <input type="hidden" name="active" value={user.isActive ? "false" : "true"} />
                    </ActionForm>
                  ) : null}
                </div>

                {canEditThis ? (
                  <details className="mt-3 rounded-lg border border-border px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium">Edit job or move shop</summary>
                    <ActionForm
                      action={updateStaff}
                      className="mt-3 grid gap-3 sm:grid-cols-2"
                      submit="Save staff"
                      successMessage="Staff updated"
                      resetOnSuccess={false}
                      buttonClassName="mt-1 sm:col-span-2"
                    >
                      <input type="hidden" name="id" value={user.id} />
                      <label className="block text-xs text-muted-foreground sm:col-span-2">
                        Full name
                        <Input name="name" defaultValue={user.name ?? ""} required className="mt-1" />
                      </label>
                      <label className="block text-xs text-muted-foreground">
                        Job
                        <Select name="role" defaultValue={user.role} className="mt-1">
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="block text-xs text-muted-foreground">
                        Shop
                        <Select name="branchId" defaultValue={user.branchId ?? ""} className="mt-1">
                          {admin ? <option value="">Head office / all shops</option> : null}
                          {(admin ? activeShops : activeShops.filter((branch) => branch.id === me.branchId)).map(
                            (branch) => (
                              <option key={branch.id} value={branch.id}>
                                {branch.name}
                              </option>
                            )
                          )}
                        </Select>
                      </label>
                    </ActionForm>
                  </details>
                ) : null}
              </div>
            )
          })}
          {staff.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
              No staff to show.
            </p>
          ) : null}
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
              <span className="mb-1 block text-muted-foreground">First password</span>
              <PasswordInput name="password" placeholder="They must change this after they sign in" required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Job</span>
              <Select name="role" defaultValue="SALES_EXECUTIVE">
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Shop</span>
              <Select name="branchId">
                {admin ? <option value="">Head office / all shops</option> : null}
                {(admin ? activeShops : activeShops.filter((branch) => branch.id === me.branchId)).map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </label>
          </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">
            You can see staff, but the main admin must allow you before you can add a new login.
          </p>
        )}
      </div>
    </div>
  )
}
