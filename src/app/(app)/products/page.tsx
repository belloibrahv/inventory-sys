import { createProduct, getProductLookups, getProducts, updateProductWarranty } from "@/app/actions/catalog"
import { BulkProductUpload } from "@/app/(app)/products/bulk-upload"
import { ProductPriceList, type PriceRow } from "@/app/(app)/products/price-list"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { canManageCatalog } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { money } from "@/lib/utils"

const conditions = ["BRAND_NEW", "OPEN_BOX", "UK_USED", "REFURBISHED", "SWAP_DEVICE", "FAULTY", "REPAIR_DEVICE"]

function toPriceRow(product: Awaited<ReturnType<typeof getProducts>>[number]): PriceRow {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    brand: product.brand.name,
    color: product.color,
    storage: product.storage,
    tracking: product.tracking,
    condition: product.condition,
    costPrice: money(product.costPrice),
    minimumPrice: money(product.minimumPrice),
    sellingPrice: money(product.sellingPrice),
    warrantyDays: product.warrantyDays,
    units: product.inventory.reduce((sum, row) => sum + row.quantity, 0),
  }
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const me = await requireUser()
  const [products, lookups, canEdit] = await Promise.all([
    getProducts(),
    getProductLookups(),
    canManageCatalog(me.role),
  ])
  const rows = products.map(toPriceRow)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phones & items"
        description="Add phones, accessories, and selling prices. Lowest price is the floor staff cannot go below. Tick several items to change many selling prices in one save. Sales stay by the unit."
      />
      <div className="page-split">
        <ProductPriceList products={rows} canEdit={canEdit} initialQuery={q} />
        <div className="space-y-4">
          {!canEdit ? (
            <div className="surface-card p-5 text-sm text-muted-foreground">
              You can see the list. Super Admin must allow you to add items or change prices.
            </div>
          ) : null}
          {canEdit ? (
          <>
          <BulkProductUpload />
          <div className="surface-card p-5">
            <h3 className="mb-4 font-semibold">Add one product</h3>
            <ActionForm action={createProduct} submit="Create product" className="space-y-3">
              <Input name="sku" placeholder="Item code" required />
              <Input name="name" placeholder="Name" required />
              <div className="grid grid-cols-2 gap-2">
                <Select name="brandId" required>
                  {lookups.brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                </Select>
                <Select name="categoryId" required>
                  {lookups.categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </Select>
              </div>
              <Select name="tracking" defaultValue="IMEI">
                <option value="IMEI">Phone, IMEI</option>
                <option value="SERIAL">Accessory with serial</option>
                <option value="NONE">No number (cords, chargers)</option>
              </Select>
              <Select name="condition" defaultValue="BRAND_NEW">
                {conditions.map((item) => (
                  <option key={item} value={item}>{item.replaceAll("_", " ")}</option>
                ))}
              </Select>
              <div className="grid grid-cols-3 gap-2">
                <Input name="color" placeholder="Color" />
                <Input name="storage" placeholder="Storage" />
                <Input name="ram" placeholder="RAM" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input name="costPrice" type="number" placeholder="Cost" required />
                <Input name="minimumPrice" type="number" placeholder="Minimum" required />
                <Input name="sellingPrice" type="number" placeholder="Selling" required />
              </div>
              <Input name="warrantyDays" type="number" defaultValue={365} placeholder="Warranty days" />
              <Textarea name="description" placeholder="Description" />
            </ActionForm>
          </div>
          <div className="surface-card p-5">
            <h3 className="mb-4 font-semibold">Warranty days</h3>
            <ActionForm action={updateProductWarranty} submit="Update warranty" className="space-y-3">
              <Select name="id" required>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} · {product.warrantyDays} days</option>
                ))}
              </Select>
              <Input name="warrantyDays" type="number" defaultValue={365} required />
            </ActionForm>
          </div>
          </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
