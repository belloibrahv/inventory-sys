"use client"

import { useMemo, useState } from "react"
import { startReconciliation } from "@/app/actions/finance"
import { ActionForm } from "@/components/action-form"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

type Branch = { id: string; name: string }
type Row = {
  id: string
  productId: string
  branchId: string
  quantity: number
  product: { name: string }
  branch: { code: string }
}

export function CountForm({
  branches,
  inventory,
  vault,
  defaultBranchId,
}: {
  branches: Branch[]
  inventory: Row[]
  vault: Array<{ productId: string; branchId: string; count: number }>
  defaultBranchId?: string | null
}) {
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || "")
  const rows = useMemo(
    () => inventory.filter((row) => row.branchId === branchId),
    [inventory, branchId]
  )

  return (
    <ActionForm action={startReconciliation} submit="Send this count" className="space-y-3">
      <Select name="branchId" value={branchId} onChange={(event) => setBranchId(event.target.value)} required>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </Select>
      <Input name="notes" placeholder="Who counted it, and any box you could not find" />
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {rows.map((row) => {
          const imeis = vault.find((item) => item.productId === row.productId && item.branchId === row.branchId)?.count ?? 0
          const mismatch = imeis > 0 && imeis !== row.quantity
          return (
            <label key={row.id} className="grid grid-cols-[1fr_80px] items-center gap-2 text-sm">
              <span>
                {row.product.name}
                <span className="block text-xs text-muted-foreground">
                  Shop count {row.quantity}
                  {imeis ? ` · IMEIs listed ${imeis}` : ""}
                  {mismatch ? " · the shop count and the IMEI count do not agree" : ""}
                </span>
              </span>
              <Input name={`count_${row.productId}`} type="number" defaultValue={row.quantity} />
            </label>
          )
        })}
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">This shop has nothing to count.</p> : null}
      </div>
    </ActionForm>
  )
}
