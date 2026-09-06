"use client"

import { useMemo, useState } from "react"
import { createSwap } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

type Product = { id: string; name: string }
type Customer = { id: string; name: string }
type Branch = { id: string; name: string }
type Imei = { id: string; imei1: string; branchId: string; product: { name: string } }

export function SwapForm({
  customers,
  products,
  imeis,
  branches,
  defaultBranchId,
}: {
  customers: Customer[]
  products: Product[]
  imeis: Imei[]
  branches: Branch[]
  defaultBranchId?: string | null
}) {
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || "")
  const stock = useMemo(
    () => imeis.filter((item) => item.branchId === branchId),
    [imeis, branchId]
  )

  return (
    <ActionForm action={createSwap} className="space-y-3">
      <Select name="customerId" required>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>{customer.name}</option>
        ))}
      </Select>
      <Input name="oldImei1" placeholder="Customer device IMEI" required />
      <Select name="oldProductId" required>
        {products.map((product) => (
          <option key={product.id} value={product.id}>{product.name}</option>
        ))}
      </Select>
      <Select name="oldDeviceCondition" defaultValue="UK_USED">
        {["UK_USED", "REFURBISHED", "OPEN_BOX", "FAULTY"].map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </Select>
      <Input name="tradeValue" type="number" placeholder="Trade-in value" required />
      <Select name="branchId" value={branchId} onChange={(event) => setBranchId(event.target.value)} required>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </Select>
      <Select name="newImeiId" required>
        {stock.map((imei) => (
          <option key={imei.id} value={imei.id}>{imei.product.name} · {imei.imei1}</option>
        ))}
      </Select>
      {stock.length === 0 ? (
        <p className="text-xs text-rose-600">No IMEIs in this shop for that phone.</p>
      ) : null}
    </ActionForm>
  )
}
