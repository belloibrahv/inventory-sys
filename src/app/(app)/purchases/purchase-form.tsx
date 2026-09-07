"use client"

import { useMemo, useState } from "react"
import { createPurchase } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

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
    return <p className="text-sm text-muted-foreground">Add a supplier first. Neighbor shops do not belong on this list.</p>
  }

  return (
    <ActionForm action={createPurchase} submit="Save expected goods" className="space-y-3">
      <Select name="supplierId" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required>
        {suppliers.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
            {row.city || row.country ? ` · ${[row.city, row.country].filter(Boolean).join(", ")}` : ""}
          </option>
        ))}
      </Select>
      <Select name="branchId" defaultValue={defaultBranchId ?? branches[0]?.id} required>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </Select>
      <Select name="productId" required>
        {products.map((product) => (
          <option key={product.id} value={product.id}>{product.name}</option>
        ))}
      </Select>
      <Input name="originCountry" defaultValue={supplier?.country ?? ""} placeholder="Country the goods are coming from" key={`country-${supplierId}`} />
      <Input name="originCity" defaultValue={supplier?.city ?? ""} placeholder="City or market, such as Dubai or Computer Village" key={`city-${supplierId}`} />
      <Input name="expectedDate" type="date" />
      <Input name="quantity" type="number" min={1} placeholder="How many units are expected" required />
      <Input name="costPrice" type="number" min={0} placeholder="Cost each unit from this supplier" required />
      <Textarea name="notes" placeholder="Waybill, carton mark, or what the supplier said" />
    </ActionForm>
  )
}
