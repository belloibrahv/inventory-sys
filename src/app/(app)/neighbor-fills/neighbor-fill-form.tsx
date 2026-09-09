"use client"

import { useMemo, useState } from "react"
import { createNeighborFill } from "@/app/actions/neighbor"
import { ActionForm } from "@/components/action-form"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency } from "@/lib/utils"

type Customer = { id: string; name: string; phone: string; branchId: string }
type Product = { id: string; name: string; tracking: "IMEI" | "SERIAL" | "NONE"; sellingPrice: number; minimumPrice: number }
type Branch = { id: string; name: string; code: string }
type Neighbor = { id: string; name: string; phone: string }

export function NeighborFillForm({
  customers,
  products,
  branches,
  neighbors,
  defaultBranchId,
}: {
  customers: Customer[]
  products: Product[]
  branches: Branch[]
  neighbors: Neighbor[]
  defaultBranchId: string
}) {
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || "")
  const [supplierId, setSupplierId] = useState("")
  const [productId, setProductId] = useState(products[0]?.id || "")
  const [cost, setCost] = useState("")
  const [sell, setSell] = useState(String(products[0]?.sellingPrice || ""))
  const product = useMemo(() => products.find((row) => row.id === productId), [products, productId])
  const shopCustomers = customers.filter((row) => row.branchId === branchId)
  const profit = Number(sell || 0) - Number(cost || 0)
  const picked = neighbors.find((row) => row.id === supplierId)

  return (
    <ActionForm action={createNeighborFill} submit="Save this neighbor fill" className="space-y-3">
      <Select name="branchId" value={branchId} onChange={(event) => setBranchId(event.target.value)} required>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </Select>
      <Select
        name="supplierId"
        value={supplierId}
        onChange={(event) => {
          const next = event.target.value
          setSupplierId(next)
        }}
      >
        <option value="">Neighbor not on the list. Type the name below.</option>
        {neighbors.map((row) => (
          <option key={row.id} value={row.id}>{row.name}</option>
        ))}
      </Select>
      <Input
        name="neighborName"
        defaultValue={picked?.name ?? ""}
        placeholder="Neighboring shop name"
        required
        key={`name-${supplierId}`}
      />
      <Input
        name="neighborPhone"
        defaultValue={picked?.phone ?? ""}
        placeholder="Neighboring shop phone"
        key={`phone-${supplierId}`}
      />
      <Select name="customerId" required emptyLabel="No customer on this shop's books yet. Add one on Customers first.">
        <option value="">Named customer who wants this item</option>
        {shopCustomers.map((row) => (
          <option key={row.id} value={row.id}>{row.name} · {row.phone}</option>
        ))}
      </Select>
      {!shopCustomers.length ? (
        <p className="text-sm text-rose-600">Add the customer first. Do not invent a buyer on this page.</p>
      ) : null}
      <Select
        name="productId"
        value={productId}
        onChange={(event) => {
          const next = event.target.value
          setProductId(next)
          const hit = products.find((row) => row.id === next)
          if (hit) setSell(String(hit.sellingPrice))
        }}
        required
      >
        {products.map((row) => (
          <option key={row.id} value={row.id}>{row.name}</option>
        ))}
      </Select>
      {product?.tracking !== "NONE" ? (
        <Input name="imei1" placeholder="IMEI from the neighboring shop" />
      ) : (
        <p className="text-sm text-muted-foreground">This item has no unique number.</p>
      )}
      <Input
        name="neighborCost"
        type="number"
        min={0}
        value={cost}
        onChange={(event) => setCost(event.target.value)}
        placeholder="What we will return to the neighboring shop"
        required
      />
      <Input
        name="sellPrice"
        type="number"
        min={0}
        value={sell}
        onChange={(event) => setSell(event.target.value)}
        placeholder="What the customer will pay us"
        required
      />
      <p className="text-sm">
        Profit we keep: {formatCurrency(Number.isFinite(profit) ? profit : 0)}
        {product ? ` · lowest allowed ${formatCurrency(product.minimumPrice)}` : ""}
      </p>
      <Textarea name="notes" placeholder="What the neighboring shop agreed" />
    </ActionForm>
  )
}
