import { bulkAdjustPrices, createProduct, getProductLookups, getProducts, updateProductPrice, updateProductWarranty } from "@/app/actions/catalog"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { canManageCatalog } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { formatCurrency, money } from "@/lib/utils"

const conditions = ["BRAND_NEW", "OPEN_BOX", "UK_USED", "REFURBISHED", "SWAP_DEVICE", "FAULTY", "REPAIR_DEVICE"]

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const me = await requireUser()
  const [products, lookups, canEdit] = await Promise.all([
    getProducts(q),
    getProductLookups(),
    canManageCatalog(me.role),
  ])

  return (
    <div className="space-y-6">
      <PageHeader title="Phones & items" description="Add phones, accessories, and selling prices. Lowest price is the floor staff cannot go below." />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="surface-card overflow-hidden">
          <form className="border-b border-border p-4">
            <Input name="q" defaultValue={q} placeholder="Search item code or model" />
          </form>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Condition</th>
                  <th className="px-4 py-3">Cost / Min / Sell</th>
                  <th className="px-4 py-3">Warranty</th>
                  <th className="px-4 py-3">Units</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-border/70">
                    <td className="px-4 py-3">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.sku} · {product.brand.name} · {product.color} {product.storage}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={product.condition} />
                    </td>
                    <td className="px-4 py-3">
                      {formatCurrency(money(product.costPrice))} / {formatCurrency(money(product.minimumPrice))} /{" "}
                      {formatCurrency(money(product.sellingPrice))}
                    </td>
                    <td className="px-4 py-3">{product.warrantyDays} days</td>
                    <td className="px-4 py-3">{product.inventory.reduce((sum, row) => sum + row.quantity, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-4">
          {!canEdit ? (
            <div className="surface-card p-5 text-sm text-muted-foreground">
              You can see the list. Super Admin must allow you to add items or change prices.
            </div>
          ) : null}
          {canEdit ? (
          <>
          <div className="surface-card p-5">
            <h3 className="mb-4 font-semibold">Add product</h3>
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
            <h3 className="mb-4 font-semibold">Single price update</h3>
            <ActionForm action={updateProductPrice} submit="Update price" className="space-y-3">
              <Select name="id" required>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </Select>
              <Input name="sellingPrice" type="number" placeholder="New selling price" required />
              <Input name="reason" placeholder="Reason" />
            </ActionForm>
          </div>
          <div className="surface-card p-5">
            <h3 className="mb-4 font-semibold">Warranty days</h3>
            <ActionForm action={updateProductWarranty} submit="Update warranty" className="space-y-3">
              <Select name="id" required>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} · {product.warrantyDays}d</option>
                ))}
              </Select>
              <Input name="warrantyDays" type="number" defaultValue={365} required />
            </ActionForm>
          </div>
          <div className="surface-card p-5">
            <h3 className="mb-4 font-semibold">Bulk / category pricing</h3>
            <ActionForm action={bulkAdjustPrices} submit="Apply" className="space-y-3">
              <Select name="mode" defaultValue="amount">
                <option value="amount">Increase / decrease ₦</option>
                <option value="percent">Percentage</option>
              </Select>
              <Input name="amount" type="number" placeholder="5000 or 5" required />
              <Select name="brandId">
                <option value="">All brands</option>
                {lookups.brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </Select>
              <Select name="condition">
                <option value="">All conditions</option>
                {conditions.map((item) => (
                  <option key={item} value={item}>{item.replaceAll("_", " ")}</option>
                ))}
              </Select>
            </ActionForm>
          </div>
          </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
