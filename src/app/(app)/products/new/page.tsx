import { createProduct, getProductLookups } from "@/app/actions/catalog"
import { ActionForm } from "@/components/action-form"
import { PageHeader, SectionCard } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { SHOP_CONDITION_OPTIONS } from "@/lib/conditions"
import { TRACKING_OPTIONS } from "@/lib/unit-identity"
import { canManageCatalog } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { CatalogLocked } from "../catalog-locked"
import { ShopScopeFields } from "../shop-scope-fields"

const SUGGESTED_CATEGORIES = ["Phones", "Laptops", "Accessories", "Screen"]

/** Register one product name, with a brand, onto the list. */
export default async function NewProductPage() {
  const me = await requireUser()
  const canEdit = await canManageCatalog(me.role)
  if (!canEdit) return <CatalogLocked title="Add one item" />

  const lookups = await getProductLookups()
  const categoryChoices = [
    ...SUGGESTED_CATEGORIES,
    ...lookups.categories.map((row) => row.name).filter((name) => !SUGGESTED_CATEGORIES.includes(name)),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/products"
        title="Add one item"
        description="Type the real product name, the same way you say it in the shop: iPhone 13, MacBook Pro M3, Type-C charger cord. Then pick the category that name belongs to."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <SectionCard title="The item">
          <ActionForm action={createProduct} submit="Save this product name" className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Product name</span>
              <Input name="name" placeholder="iPhone 13, MacBook Pro M3, or Type-C charger cord" required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Brand name</span>
              <Input
                name="brandName"
                list="brand-names"
                placeholder="Apple, Tecno, or Generic"
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
              <Input
                name="categoryName"
                list="category-names"
                placeholder="Phones, Laptops, Accessories, or Screen"
                required
              />
              <datalist id="category-names">
                {categoryChoices.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">How we count it</span>
              <Select name="tracking" defaultValue="IMEI">
                {TRACKING_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
              <span className="mt-1 block text-xs text-muted-foreground">
                Tablets often have a serial number and no IMEI. You can still pick IMEI or serial on each unit when it is received, and change this later on the price list.
              </span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">How it looks</span>
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
              <span className="font-medium text-foreground">Product name</span> is the name staff pick later. Use the
              real model: iPhone 13, MacBook Pro M3, Galaxy S24, Type-C charger cord. Do not glue brand, storage, or
              How it looks into that name unless that is how the shop already says it.
            </li>
            <li>
              <span className="font-medium text-foreground">Category</span> groups those names: Phones, Laptops,
              Accessories, Screen. Type a new one if you need it. Brand is Apple, Tecno, and the rest.
            </li>
            <li>
              <span className="font-medium text-foreground">All shops or one shop</span> decides where the name first
              appears. All shops is the usual choice so every branch can pick it.
            </li>
            <li>
              <span className="font-medium text-foreground">This is not stock.</span> Saving a name does not put a unit
              on the shelf. Use Upload stock or One phone at a time for units.
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  )
}
