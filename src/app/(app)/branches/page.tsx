import { createBranch, getBranches, toggleBranch, updateBranch } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { isShopOwner } from "@/lib/rbac"
import { requireUser } from "@/lib/session"

async function toggle(formData: FormData) {
  "use server"
  await toggleBranch(String(formData.get("id")))
}

function ShopCard({
  branch,
  canEdit,
}: {
  branch: Awaited<ReturnType<typeof getBranches>>[number]
  canEdit: boolean
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {branch.name}
            {branch.isHq ? " · HQ" : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            {branch.code} · {branch.address}
          </p>
          {(branch.phone || branch.email) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {[branch.phone, branch.email].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <Badge variant={!branch.isActive ? "danger" : branch.isHq ? "info" : "success"}>
          {!branch.isActive ? "Inactive" : branch.isHq ? "Headquarters (HQ)" : "Active"}
        </Badge>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {branch._count.users} staff · {branch._count.sales} transactions · {branch._count.imeiRecords} serialized units
      </p>
      {canEdit ? (
        <div className="mt-3 space-y-3">
          <form action={toggle}>
            <input type="hidden" name="id" value={branch.id} />
            <Button size="sm" variant="outline">
              {branch.isActive ? "Deactivate Location" : "Activate Location"}
            </Button>
          </form>
          <details className="rounded-lg border border-border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">Configure Branch Metadata</summary>
            <ActionForm
              action={updateBranch}
              className="mt-3 space-y-2"
              submit="Save Changes"
              successMessage="Branch details updated"
              resetOnSuccess={false}
              buttonClassName="mt-2"
            >
              <input type="hidden" name="id" value={branch.id} />
              <label className="block text-xs text-muted-foreground">
                Shop name
                <Input name="name" defaultValue={branch.name} required className="mt-1" />
              </label>
              <label className="block text-xs text-muted-foreground">
                Short code
                <Input name="code" defaultValue={branch.code} required className="mt-1" />
              </label>
              <label className="block text-xs text-muted-foreground">
                Address
                <Input name="address" defaultValue={branch.address} required className="mt-1" />
              </label>
              <label className="block text-xs text-muted-foreground">
                Phone
                <Input name="phone" defaultValue={branch.phone ?? ""} className="mt-1" />
              </label>
              <label className="block text-xs text-muted-foreground">
                Email
                <Input name="email" defaultValue={branch.email ?? ""} className="mt-1" />
              </label>
            </ActionForm>
          </details>
        </div>
      ) : null}
    </div>
  )
}

export default async function BranchesPage() {
  const [me, branches] = await Promise.all([requireUser(), getBranches()])
  const open = branches.filter((branch) => branch.isActive)
  const closed = branches.filter((branch) => !branch.isActive)
  const admin = isShopOwner(me.role)
  return (
    <div className="page-split">
      <div>
        <PageHeader
          title="Shops"
          description="Open or close a shop. Each shop keeps its own records."
        />
        <div className="grid gap-3 md:grid-cols-2">
          {open.map((branch) => (
            <ShopCard key={branch.id} branch={branch} canEdit={admin} />
          ))}
        </div>
        {admin && closed.length ? (
          <div className="mt-8">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Closed shops</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Closed shops keep their old sales and stock for the books. They do not appear on Sell now or goods intake.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {closed.map((branch) => (
                <ShopCard key={branch.id} branch={branch} canEdit />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {isShopOwner(me.role) ? (
        <div className="surface-card p-5">
          <h3 className="mb-4 font-semibold">Open a shop</h3>
          <ActionForm action={createBranch} submit="Save this shop" className="space-y-3">
            <Input name="name" placeholder="Shop name, such as Bodija" required />
            <Input name="code" placeholder="Short shop code, such as BDJ" required />
            <Input name="address" placeholder="Address" required />
            <Input name="phone" placeholder="Phone" />
            <Input name="email" placeholder="Email" />
          </ActionForm>
        </div>
      ) : (
        <div className="surface-card p-5 text-sm text-muted-foreground">Only the main admin or the CEO can open or close a shop.</div>
      )}
    </div>
  )
}
