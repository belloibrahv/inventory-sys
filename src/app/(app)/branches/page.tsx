import { createBranch, getBranches, toggleBranch } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { isSuperAdmin } from "@/lib/rbac"
import { requireUser } from "@/lib/session"

async function toggle(formData: FormData) {
  "use server"
  return toggleBranch(String(formData.get("id")))
}

export default async function BranchesPage() {
  const [me, branches] = await Promise.all([requireUser(), getBranches()])
  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <div>
        <PageHeader title="Shops" description="Each shop keeps its own stock, cash, customers, and goods sent to other shops." />
        <div className="grid gap-3 md:grid-cols-2">
          {branches.map((branch) => (
            <div key={branch.id} className="surface-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{branch.name}</p>
                  <p className="text-sm text-muted-foreground">{branch.code} · {branch.address}</p>
                </div>
                <Badge variant={branch.isActive ? "success" : "danger"}>{branch.isActive ? "Active" : "Off"}</Badge>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {branch._count.users} staff · {branch._count.sales} sales · {branch._count.imeiRecords} IMEIs
              </p>
              {isSuperAdmin(me.role) ? (
                <form action={toggle} className="mt-3">
                  <input type="hidden" name="id" value={branch.id} />
                  <Button size="sm" variant="outline">{branch.isActive ? "Deactivate" : "Reactivate"}</Button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {isSuperAdmin(me.role) ? (
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Add a shop</h3>
        <ActionForm action={createBranch} className="space-y-3">
          <Input name="name" placeholder="Shop name" required />
          <Input name="code" placeholder="Code e.g. IBJ" required />
          <Input name="address" placeholder="Address" required />
          <Input name="phone" placeholder="Phone" />
          <Input name="email" placeholder="Email" />
        </ActionForm>
      </div>
      ) : (
        <div className="surface-card p-5 text-sm text-muted-foreground">
          Only Super Admin can open or close a shop.
        </div>
      )}
    </div>
  )
}
