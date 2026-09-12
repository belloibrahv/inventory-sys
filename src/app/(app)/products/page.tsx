import { getProducts } from "@/app/actions/catalog"
import { ProductPriceList, type PriceRow } from "@/app/(app)/products/price-list"
import { PageHeader } from "@/components/shared"
import { canManageCatalog } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { toPriceRow } from "./to-price-row"

/**
 * The price list, and nothing else.
 *
 * Adding an item, pasting a sheet of items and setting warranty days used to be
 * three forms stacked in a narrow column beside this table, which squeezed the
 * table that everybody actually opens this screen for. Each form is its own
 * screen now, under the Phones & items fold.
 */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const me = await requireUser()
  const [products, canEdit] = await Promise.all([getProducts(), canManageCatalog(me.role)])
  const rows: PriceRow[] = products.map(toPriceRow)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phones & items"
        description="Add phones, accessories, and sell prices. The lowest price is the line staff must not go under."
      />
      {!canEdit ? (
        <div className="surface-card p-5 text-sm text-muted-foreground">
          You can see the list. The main admin must allow you to add items or change prices.
        </div>
      ) : null}
      <ProductPriceList products={rows} canEdit={canEdit} initialQuery={q} />
    </div>
  )
}
