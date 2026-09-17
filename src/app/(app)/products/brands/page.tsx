import {
  createBrand,
  createCategory,
  deleteBrand,
  deleteCategory,
  getCatalogTaxonomy,
  updateBrand,
  updateCategory,
} from "@/app/actions/catalog"
import { ActionForm } from "@/components/action-form"
import { EmptyState, PageHeader, SectionCard } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { canManageCatalog } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { CatalogLocked } from "../catalog-locked"

export default async function BrandsCategoriesPage() {
  const me = await requireUser()
  const canEdit = await canManageCatalog(me.role)
  if (!canEdit) return <CatalogLocked title="Brands & categories" />

  const { brands, categories } = await getCatalogTaxonomy()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Brands & categories"
        description="Add Samsung, Tecno, and the rest once. New items pick from this list."
      />

      <div className="grid gap-4 lg:grid-cols-2">
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
                    <summary className="cursor-pointer text-xs font-medium">Edit or remove</summary>
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
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Categories" description={`${categories.length} on the list`}>
          <ActionForm
            action={createCategory}
            submit="Add category"
            successMessage="Category added"
            className="mb-4 space-y-2"
            buttonClassName="mt-2"
          >
            <label className="block text-xs text-muted-foreground">
              Category name
              <Input name="name" placeholder="e.g. Smartphones" required className="mt-1" />
            </label>
            <label className="block text-xs text-muted-foreground">
              Short note (optional)
              <Textarea name="description" placeholder="What belongs here" className="mt-1" rows={2} />
            </label>
          </ActionForm>

          {categories.length === 0 ? (
            <EmptyState title="No categories yet" hint="Add Smartphones, Laptops, Power, Accessories, and the rest here." />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {categories.map((category) => (
                <li key={category.id} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{category.name}</p>
                      {category.description ? (
                        <p className="text-xs text-muted-foreground">{category.description}</p>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {category._count.products} item{category._count.products === 1 ? "" : "s"}
                    </p>
                  </div>
                  <details className="rounded-md border border-border px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium">Edit or remove</summary>
                    <div className="mt-2 space-y-2">
                      <ActionForm
                        action={updateCategory}
                        submit="Save category"
                        successMessage="Category saved"
                        resetOnSuccess={false}
                        className="space-y-2"
                        buttonClassName="mt-1"
                        size="sm"
                      >
                        <input type="hidden" name="id" value={category.id} />
                        <Input name="name" defaultValue={category.name} required />
                        <Textarea
                          name="description"
                          defaultValue={category.description ?? ""}
                          rows={2}
                          placeholder="Short note"
                        />
                      </ActionForm>
                      <ActionForm
                        action={deleteCategory}
                        submit="Remove category"
                        successMessage="Category removed"
                        variant="outline"
                        size="sm"
                        buttonClassName="mt-0"
                        resetOnSuccess={false}
                      >
                        <input type="hidden" name="id" value={category.id} />
                      </ActionForm>
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
