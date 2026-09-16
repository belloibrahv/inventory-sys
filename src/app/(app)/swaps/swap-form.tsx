"use client"

import { useState } from "react"
import { createSwap } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

type Product = { id: string; name: string }
type Customer = { id: string; name: string }
type Branch = { id: string; name: string }

export function SwapForm({
  customers,
  products,
  branches,
  defaultBranchId,
}: {
  customers: Customer[]
  products: Product[]
  branches: Branch[]
  defaultBranchId?: string | null
}) {
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || "")

  return (
    <ActionForm action={createSwap} className="space-y-3">
      <Select name="customerId" emptyLabel="This shop has no customer yet. Add one on Customers first." required>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>{customer.name}</option>
        ))}
      </Select>
      <Input name="oldImei1" placeholder="Customer device IMEI" required />
      <Select name="oldProductId" required emptyLabel="No item is on the list yet. Add them on Phones and items first.">
        {products.map((product) => (
          <option key={product.id} value={product.id}>{product.name}</option>
        ))}
      </Select>
      <Select name="oldDeviceCondition" defaultValue="UK_USED">
        {["UK_USED", "REFURBISHED", "OPEN_BOX", "FAULTY"].map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </Select>
      <Input name="tradeValue" type="number" placeholder="Swap Deal value" required />
      <Select name="branchId" value={branchId} onChange={(event) => setBranchId(event.target.value)} required>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </Select>
      <Input name="newImei1" placeholder="Scan or type the shop phone IMEI going out" required />
      <p className="text-sm text-muted-foreground">
        Scan the In shop phone the buyer is taking. You do not pick from a long list, so a large shelf still works.
      </p>
    </ActionForm>
  )
}
