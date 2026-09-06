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
  await toggleBranch(String(formData.get("id")))
}

function ShopCard({
  branch,
  canToggle,
}: {
  branch: Awaited<ReturnType<typeof getBranches>>[number]
  canToggle: boolean
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{branch.name}{branch.isHq ? " · HQ" : ""}</p>
          <p className="text-sm text-muted-foreground">{branch.code} · {branch.address}</p>
        </div>
        <Badge variant={!branch.isActive ? "danger" : branch.isHq ? "info" : "success"}>
          {!branch.isActive ? "Closed" : branch.isHq ? "HQ" : "Open"}
        </Badge>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {branch._count.users} staff · {branch._count.sales} sales · {branch._count.imeiRecords} IMEIs
      </p>
      {canToggle ? (
        <form action={toggle} className="mt-3">
          <input type="hidden" name="id" value={branch.id} />
          <Button size="sm" variant="outline">{branch.isActive ? "Close shop" : "Open again"}</Button>
        </form>
      ) : null}
    </div>
  )
}

export default async function BranchesPage() {
  const [me, branches] = await Promise.all([requireUser(), getBranches()])
  const open = branches.filter((branch) => branch.isActive)
  const closed = branches.filter((branch) => !branch.isActive)
  const admin = isSuperAdmin(me.role)
  return (
    <div className="page-split">
      <div>
        <PageHeader title="Shops" description="Iwo Road is HQ. Challenge is the second Ibadan shop. Super Admin can open more shops anywhere in Nigeria when Abu Twins expands." />
        <div className="grid gap-3 md:grid-cols-2">
          {open.map((branch) => (
            <ShopCard key={branch.id} branch={branch} canToggle={admin} />
          ))}
        </div>
        {admin && closed.length ? (
          <div className="mt-8">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Closed. Not used in Ibadan now</h3>
            <p className="mb-3 text-sm text-muted-foreground">Old Lagos, Abuja, and Port Harcourt records stay here so past sales are not lost. They do not appear on intake or POS.</p>
            <div className="grid gap-3 md:grid-cols-2">
              {closed.map((branch) => (
                <ShopCard key={branch.id} branch={branch} canToggle />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {isSuperAdmin(me.role) ? (
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Open a new shop</h3>
        <p className="mb-3 text-sm text-muted-foreground">Use this when Abu Twins expands to another city in Nigeria.</p>
        <ActionForm action={createBranch} className="space-y-3">
          <Input name="name" placeholder="Shop name e.g. Bodija, Ibadan" required />
          <Input name="code" placeholder="Code e.g. BDJ" required />
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
