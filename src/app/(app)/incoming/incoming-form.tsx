"use client"

import { useState } from "react"
import { createIncomingLot } from "@/app/actions/incoming"
import { ActionForm } from "@/components/action-form"
import { ScanList } from "@/components/scan-field"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type Purchase = {
  id: string
  invoiceNumber: string
  branchId: string
  supplierId: string
  originCountry?: string | null
  originCity?: string | null
}

type Product = { id: string; name: string; tracking: "IMEI" | "SERIAL" | "NONE" }
type Branch = { id: string; name: string; isHq?: boolean }
type Supplier = { id: string; name: string }

export function IncomingForm({
  products,
  branches,
  suppliers,
  purchases = [],
  defaultBranchId,
}: {
  products: Product[]
  branches: Branch[]
  suppliers: Supplier[]
  purchases?: Purchase[]
  defaultBranchId?: string | null
}) {
  const [rows, setRows] = useState([{ key: 1, productId: products[0]?.id ?? "", identity: products[0]?.tracking ?? "IMEI" }])
  const [branchId, setBranchId] = useState(defaultBranchId ?? branches[0]?.id ?? "")
  const [supplierId, setSupplierId] = useState("")

  function updateRow(key: number, productId: string) {
    const tracking = products.find((item) => item.id === productId)?.tracking ?? "IMEI"
    setRows((current) => current.map((row) => (row.key === key ? { ...row, productId, identity: tracking } : row)))
  }

  return (
    <ActionForm action={createIncomingLot} submit="Book goods on the way" className="space-y-3">
      <Select name="branchId" value={branchId} onChange={(event) => setBranchId(event.target.value)} required>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}{branch.isHq ? " · HQ" : ""}
          </option>
        ))}
      </Select>
      <Select name="supplierId" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
        <option value="">Supplier (optional)</option>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
        ))}
      </Select>
      {purchases.length ? (
        <Select
          name="purchaseId"
          defaultValue=""
          onChange={(event) => {
            const purchase = purchases.find((row) => row.id === event.target.value)
            if (purchase) {
              setBranchId(purchase.branchId)
              setSupplierId(purchase.supplierId)
            }
          }}
        >
          <option value="">Not tied to any supplier bill</option>
          {purchases.map((purchase) => (
            <option key={purchase.id} value={purchase.id}>
              {purchase.invoiceNumber}
              {purchase.originCity || purchase.originCountry
                ? ` · ${[purchase.originCity, purchase.originCountry].filter(Boolean).join(", ")}`
                : ""}
            </option>
          ))}
        </Select>
      ) : null}
      <Input name="expectedDate" type="date" />
      {rows.map((row) => (
        <div key={row.key} className="space-y-2 rounded-xl border border-border p-3">
          <Select name="productId" value={row.productId} onChange={(event) => updateRow(row.key, event.target.value)}>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
                {product.tracking === "SERIAL" ? " (serial)" : product.tracking === "NONE" ? " (no number)" : " (IMEI)"}
              </option>
            ))}
          </Select>
          <input type="hidden" name="identity" value={row.identity} />
          {row.identity === "NONE" ? (
            <Input name="quantity" type="number" min={1} defaultValue={1} placeholder="How many pieces" required />
          ) : (
            <>
              <input type="hidden" name="quantity" value="0" />
              <ScanList name="identifiers" kind={row.identity === "SERIAL" ? "SERIAL" : "IMEI"} />
            </>
          )}
          <p className="text-xs text-muted-foreground">
            {row.identity === "IMEI" && "Phone. IMEI required"}
            {row.identity === "SERIAL" && "Accessory with serial"}
            {row.identity === "NONE" && "No IMEI and no serial. Use this for charger cords and the like"}
          </p>
        </div>
      ))}
      <button
        type="button"
        className="text-sm text-primary"
        onClick={() => setRows((current) => [...current, { key: Date.now(), productId: products[0]?.id ?? "", identity: products[0]?.tracking ?? "IMEI" }])}
      >
        Add another item
      </button>
      <Textarea name="notes" placeholder="Note: carton marks, waybill, rider" />
    </ActionForm>
  )
}
