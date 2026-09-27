"use client"

import { useMemo, useState } from "react"
import { createPurchase } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/form-field"

type Supplier = { id: string; name: string; country: string | null; city: string | null }
type Branch = { id: string; name: string }
type Product = { id: string; name: string }

export function PurchaseForm({
  suppliers,
  branches,
  products,
  defaultBranchId,
}: {
  suppliers: Supplier[]
  branches: Branch[]
  products: Product[]
  defaultBranchId?: string | null
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "")
  const supplier = useMemo(
    () => suppliers.find((row) => row.id === supplierId),
    [suppliers, supplierId]
  )

  if (!suppliers.length) {
    return <p className="text-sm text-muted-foreground">Add a supplier first. A neighboring shop does not belong on this list.</p>
  }

  return (
    <ActionForm action={createPurchase} submit="Save expected goods" successMessage="Expected goods booked. Scan the IMEIs on the bill." className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Supplier">
          <Select name="supplierId" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required emptyLabel="No supplier is on the list yet. Add one on Suppliers first.">
            {suppliers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
                {row.city || row.country ? ` · ${[row.city, row.country].filter(Boolean).join(", ")}` : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Shop receiving it">
          <Select name="branchId" defaultValue={defaultBranchId ?? branches[0]?.id} required>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Item" className="sm:col-span-2">
          <Select name="productId" required emptyLabel="No item is on the list yet. Add them on Phones and items first.">
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="How many units">
          <Input name="quantity" type="number" inputMode="numeric" min={1} required />
        </FormField>
        <FormField label="Cost of one unit (₦)">
          <Input name="costPrice" type="number" inputMode="decimal" min={0} required />
        </FormField>
        <FormField label="Coming from (country)">
          <Input name="originCountry" defaultValue={supplier?.country ?? ""} placeholder="China, UAE" key={`country-${supplierId}`} />
        </FormField>
        <FormField label="City or market">
          <Input name="originCity" defaultValue={supplier?.city ?? ""} placeholder="Dubai, Computer Village" key={`city-${supplierId}`} />
        </FormField>
        <FormField label="Expected on (optional)">
          <Input name="expectedDate" type="date" />
        </FormField>
        <FormField label="Notes (optional)" className="sm:col-span-2">
          <Textarea name="notes" placeholder="Waybill, carton mark, or anything the supplier told you" />
        </FormField>
      </div>
    </ActionForm>
  )
}
