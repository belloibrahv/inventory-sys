import { getProducts, resetAllProductWarrantiesToZero, updateProductWarranty } from "@/app/actions/catalog"
import { ActionForm } from "@/components/action-form"
import { PageHeader, SectionCard } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { canManageCatalog } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { CatalogLocked } from "../catalog-locked"

/** How long each item is covered after it is sold. Defaults stay at 0; cashiers type days on Sell now. */
export default async function WarrantyPage() {
  const me = await requireUser()
  const canEdit = await canManageCatalog(me.role)
  if (!canEdit) return <CatalogLocked title="Warranty days" />

  const products = await getProducts()
  const aboveZero = products.filter((product) => product.warrantyDays > 0).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warranty days"
        description="Default days after a sale. Keep these at 0. The cashier types warranty days on Sell now when the buyer needs cover."
        actions={
          <ActionForm
            action={resetAllProductWarrantiesToZero}
            submit="Set every item to 0 days"
            successMessage="Every item now defaults to 0 warranty days"
            confirmModal={{
              title: "Set every item to 0 days?",
              description: "Cashiers can still type warranty days on Sell now when a buyer needs cover.",
              confirmLabel: "Set every item to 0 days",
              tone: "warning",
            }}
          >
            <span className="sr-only">Reset every item warranty to zero days</span>
          </ActionForm>
        }
      />

      {aboveZero > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {aboveZero === 1
            ? "1 item still has a default above 0 days. Click Set every item to 0 days, or change that line below."
            : `${aboveZero} items still have a default above 0 days. Click Set every item to 0 days, or change each line below.`}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Every item defaults to 0 days. Cashiers type cover on Sell now when needed.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <SectionCard title="Change one item">
          <ActionForm action={updateProductWarranty} submit="Save warranty days" className="space-y-3">
            <Select name="id" required>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {product.warrantyDays} days
                </option>
              ))}
            </Select>
            <Input name="warrantyDays" type="number" min={0} defaultValue={0} required />
            <p className="text-xs text-muted-foreground">
              Use 0 unless this model must always start with cover. Cashiers can still raise the days on the till.
            </p>
          </ActionForm>
        </SectionCard>

        <SectionCard title="What each item starts with" flush>
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Item</th>
                  <th className="px-5 py-2 font-medium">Item code</th>
                  <th className="px-5 py-2 text-right font-medium">Days</th>
                  <th className="px-5 py-2 font-medium">Save</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-t border-border">
                    <td className="px-5 py-2">{product.name}</td>
                    <td className="px-5 py-2 font-mono text-xs text-muted-foreground">{product.sku}</td>
                    <td className="px-5 py-2" colSpan={2}>
                      <ActionForm
                        action={updateProductWarranty}
                        submit="Save"
                        className="flex items-center justify-end gap-2"
                      >
                        <input type="hidden" name="id" value={product.id} />
                        <Input
                          name="warrantyDays"
                          type="number"
                          min={0}
                          defaultValue={product.warrantyDays}
                          required
                          className="h-8 w-24 text-right tabular-nums"
                          aria-label={`Warranty days for ${product.name}`}
                        />
                      </ActionForm>
                    </td>
                  </tr>
                ))}
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                      No item is on the list yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
