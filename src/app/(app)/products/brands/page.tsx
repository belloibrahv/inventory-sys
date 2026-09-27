import {
  createBrand,
  deleteBrand,
  getCatalogTaxonomy,
  updateBrand,
} from "@/app/actions/catalog"
import { ActionForm } from "@/components/action-form"
import { EmptyState, PageHeader, SectionCard } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { canHardDelete, canManageCatalog } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { CatalogLocked } from "../catalog-locked"

export default async function BrandsPage() {
  const me = await requireUser()
  const canEdit = await canManageCatalog(me.role)
  if (!canEdit) return <CatalogLocked title="Brands" />

  const canRemove = canHardDelete(me.role)
  const { brands } = await getCatalogTaxonomy()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Brands"
        description="Add Samsung, Tecno, and the rest once. New items pick from this list."
      />

      <div className="max-w-3xl">
        <SectionCard title="Brands" description={`${brands.length} on the list`}>
          <ActionForm
            action={createBrand}
            submit="Add brand"
            successMessage="Brand added"
            className="mb-4 flex flex-wrap items-end gap-2"
            buttonClassName="mt-0"
          >
            <label className="min-w-[12rem] flex-1 text-xs text-muted-foreground">
              Brand name
              <Input name="name" placeholder="e.g. Samsung" required className="mt-1" />
            </label>
          </ActionForm>

          {brands.length === 0 ? (
            <EmptyState title="No brands yet" hint="Add Samsung, Apple, Tecno, Infinix, and the rest here." />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {brands.map((brand) => (
                <li key={brand.id} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{brand.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {brand._count.products} item{brand._count.products === 1 ? "" : "s"}
                    </p>
                  </div>
                  <details className="rounded-md border border-border px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium">{canRemove ? "Edit or remove" : "Edit name"}</summary>
                    <div className="mt-2 space-y-2">
                      <ActionForm
                        action={updateBrand}
                        submit="Save name"
                        successMessage="Brand renamed"
                        resetOnSuccess={false}
                        className="flex flex-wrap items-end gap-2"
                        buttonClassName="mt-0"
                        size="sm"
                      >
                        <input type="hidden" name="id" value={brand.id} />
                        <Input name="name" defaultValue={brand.name} required className="min-w-[10rem] flex-1" />
                      </ActionForm>
                      {canRemove ? (
                      <ActionForm
                        action={deleteBrand}
                        submit="Remove brand"
                        successMessage="Brand removed"
                        variant="outline"
                        size="sm"
                        buttonClassName="mt-0"
                        resetOnSuccess={false}
                      >
                        <input type="hidden" name="id" value={brand.id} />
                      </ActionForm>
                      ) : null}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

      </div>
    </div>
  )
}
