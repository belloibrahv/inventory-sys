import { redirect } from "next/navigation"
import { createBranch } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { FormField } from "@/components/form-field"
import { FormScreen } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { isShopOwner } from "@/lib/rbac"
import { requireUser } from "@/lib/session"

export default async function OpenShopPage() {
  const me = await requireUser()
  if (!isShopOwner(me.role)) redirect("/branches")
  return (
    <FormScreen title="Open a shop" description="Only the main admin or the CEO can open a shop. It keeps its own stock, sales and money." backHref="/branches">
      <ActionForm action={createBranch} submit="Save this shop" successMessage="Shop opened." successHref="/branches" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Shop name">
            <Input name="name" placeholder="Bodija" required autoFocus />
          </FormField>
          <FormField label="Short code" hint="Three or four letters, shown on invoices and stock.">
            <Input name="code" placeholder="BDJ" required className="uppercase" />
          </FormField>
          <FormField label="Address" className="sm:col-span-2">
            <Input name="address" required />
          </FormField>
          <FormField label="Phone (optional)">
            <Input name="phone" type="tel" inputMode="tel" />
          </FormField>
          <FormField label="Email (optional)">
            <Input name="email" type="email" />
          </FormField>
        </div>
      </ActionForm>
    </FormScreen>
  )
}
