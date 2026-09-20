import { createProduct, getProductLookups } from "@/app/actions/catalog"
import { ActionForm } from "@/components/action-form"
import { PageHeader, SectionCard } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { canManageCatalog } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { CatalogLocked } from "../catalog-locked"

const conditions = [
  { value: "BRAND_NEW", label: "Brand new" },
  { value: "UK_USED", label: "Uk" },
  { value: "OPEN_BOX", label: "OPENBOX" },
  { value: "FAULTY", label: "Faulty" },
  { value: "SWAP_DEVICE", label: "Swap Deal" },
  { value: "REPAIR_DEVICE", label: "Repair device" },
]

/** One new model onto the price list. */
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
        description="A new model. Set the lowest price with care."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <SectionCard title="The item">
          <ActionForm action={createProduct} submit="Save this item" className="space-y-3">
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
              <option value="NONE">No number. Use this for cords and chargers</option>
            </Select>
            <Select name="condition" defaultValue="BRAND_NEW">
              {conditions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </Select>
            <div className="grid grid-cols-3 gap-2">
              <Input name="color" placeholder="Color" />
              <Input name="storage" placeholder="Storage size (GB)" />
              <Input name="ram" placeholder="Memory (RAM)" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input name="costPrice" type="number" placeholder="Cost price" required />
              <Input name="minimumPrice" type="number" placeholder="Lowest price" required />
              <Input name="sellingPrice" type="number" placeholder="Sell price" required />
            </div>
            <Input name="warrantyDays" type="number" defaultValue={0} placeholder="Warranty days (0 = no warranty)" />
            <Textarea name="description" placeholder="Short note about this item" />
          </ActionForm>
        </SectionCard>

        <SectionCard title="What the three prices mean">
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Cost price</span> is what you paid the supplier. Profit is
              worked out from it, so a wrong cost makes every profit figure wrong. It is copied onto each
              sale on the day it happens, so a later batch at a new rate never changes an old profit.
            </li>
            <li>
              <span className="font-medium text-foreground">Lowest price</span> is the real floor at the till.
              A seller may price a deal anywhere from this figure up — that is where a reseller price or a
              bulk discount comes from. Going under it needs the CEO or Super Admin, and a reason.
            </li>
            <li>
              <span className="font-medium text-foreground">Sell price</span> is only what the till offers first.
              It is a starting point, not a fixed price.
            </li>
            <li>
              <span className="font-medium text-foreground">How we count it</span> cannot be changed easily later. Pick
              IMEI for phones, serial for accessories that carry one, and no number for cords and chargers.
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  )
}
