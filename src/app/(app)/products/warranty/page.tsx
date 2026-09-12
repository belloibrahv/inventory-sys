import { getProducts, updateProductWarranty } from "@/app/actions/catalog"
import { ActionForm } from "@/components/action-form"
import { PageHeader, SectionCard } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { canManageCatalog } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { CatalogLocked } from "../catalog-locked"

/** How long each item is covered after it is sold. */
export default async function WarrantyPage() {
  const me = await requireUser()
  const canEdit = await canManageCatalog(me.role)
  if (!canEdit) return <CatalogLocked title="Warranty days" />

  const products = await getProducts()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warranty days"
        description="How many days an item is covered after it is sold. Returns and repairs read this number, so keep it honest."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <SectionCard title="Change one item">
          <ActionForm action={updateProductWarranty} submit="Save warranty days" className="space-y-3">
            <Select name="id" required>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name} · {product.warrantyDays} days</option>
              ))}
            </Select>
            <Input name="warrantyDays" type="number" defaultValue={365} required />
          </ActionForm>
        </SectionCard>

        <SectionCard title="What each item is covered for now" flush>
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Item</th>
                  <th className="px-5 py-2 font-medium">Item code</th>
                  <th className="px-5 py-2 text-right font-medium">Days</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-t border-border">
                    <td className="px-5 py-2">{product.name}</td>
                    <td className="px-5 py-2 font-mono text-xs text-muted-foreground">{product.sku}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{product.warrantyDays}</td>
                  </tr>
                ))}
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">
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
