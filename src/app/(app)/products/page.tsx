import { getProductLookups, getProducts } from "@/app/actions/catalog"
import { ProductPriceList, type PriceRow } from "@/app/(app)/products/price-list"
import { PageHeader } from "@/components/shared"
import { canHardDelete, canManageCatalog } from "@/lib/rbac"
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
  const [products, canEdit, lookups] = await Promise.all([
    getProducts(),
    canManageCatalog(me.role),
    getProductLookups(),
  ])
  const canRemove = canHardDelete(me.role)
  const rows: PriceRow[] = products.map(toPriceRow)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Price list"
        description={
          canRemove
            ? "Names, cost, lowest price, and selling price. Use Change or remove on a line to edit any detail (brand, category, IMEI or serial, prices, warranty), reduce stock, or take an item off the active list."
            : "Names, cost, lowest price, and selling price. Use Change on a line to edit any detail (brand, category, IMEI or serial, prices, warranty) or reduce stock. Only the Managing Director can remove an item."
        }
      />
      {!canEdit ? (
        <div className="surface-card p-5 text-sm text-muted-foreground">
          This list is read-only for your job. Super Admin or the stock uploader can add names and change prices.
        </div>
      ) : null}
      <ProductPriceList
        products={rows}
        canEdit={canEdit}
        canRemove={canRemove}
        initialQuery={q}
        brandNames={lookups.brands.map((row) => row.name)}
        categoryNames={lookups.categories.map((row) => row.name)}
      />
    </div>
  )
}
