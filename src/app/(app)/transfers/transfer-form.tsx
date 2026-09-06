"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { createTransfer } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { ScanField } from "@/components/scan-field"
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
  const [selected, setSelected] = useState<string[]>([])
  const stock = useMemo(
    () => imeis.filter((item) => item.branchId === fromId && item.productId === productId),
    [imeis, fromId, productId]
  )
  const product = products.find((row) => row.id === productId)

  function takeScan(code: string) {
    const hit = stock.find((item) => item.imei1 === code || item.imei1.endsWith(code))
    if (!hit) {
      toast.error("That IMEI is not in this shop for this item.")
      return
    }
    setSelected((current) => (current.includes(hit.imei1) ? current : [...current, hit.imei1]))
    toast.success("Added to transfer")
  }

  function toggle(imei1: string, on: boolean) {
    setSelected((current) => (on ? [...new Set([...current, imei1])] : current.filter((row) => row !== imei1)))
  }

  return (
    <ActionForm action={createTransfer} submit="Dispatch" className="space-y-3">
      <Select
        name="fromBranchId"
        value={fromId}
        onChange={(event) => {
          setFromId(event.target.value)
          setSelected([])
        }}
        required
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </Select>
      <Select name="toBranchId" required>
        {branches.filter((branch) => branch.id !== fromId).map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </Select>
      <Select
        name="productId"
        value={productId}
        onChange={(event) => {
          setProductId(event.target.value)
          setSelected([])
        }}
        required
      >
        {products.map((row) => (
          <option key={row.id} value={row.id}>{row.name}</option>
        ))}
      </Select>
      {stock.length ? (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <ScanField onScan={takeScan} placeholder="Scan IMEI leaving this shop" />
          {selected.map((imei) => (
            <input key={imei} type="hidden" name="imei" value={imei} />
          ))}
          <p className="text-xs text-muted-foreground">Or tick the IMEIs leaving this shop.</p>
          {stock.map((item) => (
            <label key={item.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(item.imei1)}
                onChange={(event) => toggle(item.imei1, event.target.checked)}
              />
              <span className="font-mono text-xs">{item.imei1}</span>
            </label>
          ))}
        </div>
      ) : product?.serialized ? (
        <p className="text-xs text-rose-600">No IMEIs for this item in the sending shop.</p>
      ) : (
        <Input name="quantity" type="number" placeholder="Accessory quantity" className="min-h-12" />
      )}
    </ActionForm>
  )
}
