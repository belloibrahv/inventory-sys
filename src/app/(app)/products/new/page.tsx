import { createProduct, getProductLookups } from "@/app/actions/catalog"
import { ActionForm } from "@/components/action-form"
import { PageHeader, SectionCard } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { SHOP_CONDITION_OPTIONS } from "@/lib/conditions"
import { canManageCatalog } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { CatalogLocked } from "../catalog-locked"
import { ShopScopeFields } from "../shop-scope-fields"

/** Register one product name, with a brand, onto the list. */
export default async function NewProductPage() {
  const me = await requireUser()
  const canEdit = await canManageCatalog(me.role)
  if (!canEdit) return <CatalogLocked title="Add one item" />

  const lookups = await getProductLookups()

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/products"
        title="Add one item"
        description="Register a product name and brand. Pick All shops or one shop. Prices can wait until you add stock."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <SectionCard title="The item">
          <ActionForm action={createProduct} submit="Save this product name" className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Product name</span>
              <Input name="name" placeholder="Product name, for example Tecno Camon 30" required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Brand name</span>
              <Input
                name="brandName"
                list="brand-names"
                placeholder="Brand name, for example Tecno"
                required
              />
              <datalist id="brand-names">
                {lookups.brands.map((brand) => (
                  <option key={brand.id} value={brand.name} />
                ))}
              </datalist>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Category</span>
              <Select name="categoryId" emptyLabel="Phones will be created if the list is empty">
                {lookups.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </label>
            <Select name="tracking" defaultValue="IMEI">
              <option value="IMEI">Phone, IMEI</option>
              <option value="SERIAL">Accessory with serial</option>
              <option value="NONE">No number. Use this for cords and chargers</option>
            </Select>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">How the phone looks</span>
              <Select name="condition" defaultValue="BRAND_NEW">
                {SHOP_CONDITION_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </label>
            <ShopScopeFields shops={lookups.branches} />
            <div className="grid grid-cols-3 gap-2">
              <Input name="color" placeholder="Color" />
              <Input name="storage" placeholder="Storage size (GB)" />
              <Input name="ram" placeholder="Memory (RAM)" />
            </div>
            <Input name="sku" placeholder="Item code (leave empty and the system will make one)" />
            <div className="grid grid-cols-3 gap-2">
              <Input name="costPrice" type="number" placeholder="Cost price" />
              <Input name="minimumPrice" type="number" placeholder="Lowest price" />
              <Input name="sellingPrice" type="number" placeholder="Sell price" />
            </div>
            <Input name="warrantyDays" type="number" defaultValue={0} placeholder="Warranty days (0 = no warranty)" />
            <Textarea name="description" placeholder="Short note about this item" />
          </ActionForm>
        </SectionCard>

        <SectionCard title="What this does">
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Product name and brand</span> are what staff pick later on
              Upload stock, One phone at a time, and Sell now. Type a new brand if it is not on the list yet.
            </li>
            <li>
              <span className="font-medium text-foreground">All shops or one shop</span> decides where the name first
              appears. All shops is the usual choice so Iwo Road, Bodija, and Challenge can all pick it.
            </li>
            <li>
              <span className="font-medium text-foreground">This is not stock.</span> Saving a name does not put a phone
              on the shelf. Use Upload stock or One phone at a time for units.
            </li>
            <li>
              <span className="font-medium text-foreground">Sell price</span> can stay empty for now. Set it before a
              cashier sells the item. Lowest price is the floor at the till.
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  )
}
