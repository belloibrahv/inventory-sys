import { createCategory, deleteCategory, getCatalogTaxonomy, updateCategory } from "@/app/actions/catalog"
import { ActionForm } from "@/components/action-form"
import { FormField } from "@/components/form-field"
import { EmptyState, PageHeader, SectionCard } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { canHardDelete, canManageCatalog } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { CatalogLocked } from "../catalog-locked"

export default async function CategoriesPage() {
  const me = await requireUser()
  const canEdit = await canManageCatalog(me.role)
  if (!canEdit) return <CatalogLocked title="Categories" />

  const canRemove = canHardDelete(me.role)
  const { categories } = await getCatalogTaxonomy()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Smartphones, Laptops, Power and the rest. A category also carries the reseller markup over cost."
      />

      <div className="max-w-3xl">
        <SectionCard title="Categories" description={`${categories.length} on the list`}>
          <ActionForm
            action={createCategory}
            submit="Add category"
            successMessage="Category added"
            className="mb-5 space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Category name">
                <Input name="name" placeholder="e.g. Smartphones" required />
              </FormField>
              <FormField
                label="Reseller markup over cost (%)"
                hint="12 means cost plus 12%. It follows cost, so an exchange-rate move changes nothing here."
              >
                <Input name="resellerMarkup" type="number" inputMode="decimal" min={0} step="0.01" placeholder="e.g. 12" />
              </FormField>
              <FormField label="Short note (optional)" className="sm:col-span-2">
                <Textarea name="description" placeholder="What belongs here" rows={2} />
              </FormField>
            </div>
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
                      <p className="text-xs text-muted-foreground">
                        {Number(category.resellerMarkup) > 0
                          ? `Resellers pay cost + ${Number(category.resellerMarkup)}%`
                          : "No reseller price set"}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {category._count.products} item{category._count.products === 1 ? "" : "s"}
                    </p>
                  </div>
                  <details className="rounded-md border border-border px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium">{canRemove ? "Edit or remove" : "Edit category"}</summary>
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
                        <label className="block text-xs text-muted-foreground">
                          Reseller markup over cost (%)
                          <Input
                            name="resellerMarkup"
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={Number(category.resellerMarkup) || ""}
                            placeholder="e.g. 12"
                            className="mt-1"
                          />
                        </label>
                      </ActionForm>
                      {canRemove ? (
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
