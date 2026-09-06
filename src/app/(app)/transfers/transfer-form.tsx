"use client"

import { useMemo, useState } from "react"
import { createTransfer } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

type Branch = { id: string; name: string }
type Product = { id: string; name: string; serialized: boolean }
type Imei = { id: string; imei1: string; productId: string; branchId: string; product: { name: string } }

export function TransferForm({
  branches,
  products,
  imeis,
  defaultFromId,
}: {
  branches: Branch[]
  products: Product[]
  imeis: Imei[]
  defaultFromId?: string | null
}) {
  const [fromId, setFromId] = useState(defaultFromId || branches[0]?.id || "")
  const [productId, setProductId] = useState(products[0]?.id || "")
  const stock = useMemo(
    () => imeis.filter((item) => item.branchId === fromId && item.productId === productId),
    [imeis, fromId, productId]
  )
  const product = products.find((row) => row.id === productId)

  return (
    <ActionForm action={createTransfer} submit="Dispatch" className="space-y-3">
      <Select name="fromBranchId" value={fromId} onChange={(event) => setFromId(event.target.value)} required>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </Select>
      <Select name="toBranchId" required>
        {branches.filter((branch) => branch.id !== fromId).map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </Select>
      <Select name="productId" value={productId} onChange={(event) => setProductId(event.target.value)} required>
        {products.map((row) => (
          <option key={row.id} value={row.id}>{row.name}</option>
        ))}
      </Select>
      {stock.length ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Tick the IMEIs leaving this shop.</p>
          {stock.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="imei" value={item.imei1} />
              <span>{item.imei1}</span>
            </label>
          ))}
        </div>
      ) : product?.serialized ? (
        <p className="text-xs text-rose-600">No IMEIs for this item in the sending shop.</p>
      ) : (
        <Input name="quantity" type="number" placeholder="Accessory quantity" />
      )}
    </ActionForm>
  )
}
