"use client"

import { useState } from "react"
import { createIncomingLot } from "@/app/actions/incoming"
import { ActionForm } from "@/components/action-form"
import { FormField } from "@/components/form-field"
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
  successHref,
}: {
  products: Product[]
  branches: Branch[]
  suppliers: Supplier[]
  purchases?: Purchase[]
  defaultBranchId?: string | null
  successHref?: string
}) {
  const [rows, setRows] = useState([{ key: 1, productId: products[0]?.id ?? "", identity: products[0]?.tracking ?? "IMEI" }])
  const [branchId, setBranchId] = useState(defaultBranchId ?? branches[0]?.id ?? "")
  const [supplierId, setSupplierId] = useState("")

  function updateRow(key: number, productId: string) {
    const tracking = products.find((item) => item.id === productId)?.tracking ?? "IMEI"
    setRows((current) => current.map((row) => (row.key === key ? { ...row, productId, identity: tracking } : row)))
  }

  return (
    <ActionForm
      action={createIncomingLot}
      submit="Book goods on the way"
      successMessage="Goods booked as on the way."
      successHref={successHref}
      enterDoesNotSubmit
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Shop receiving it">
          <Select name="branchId" value={branchId} onChange={(event) => setBranchId(event.target.value)} required>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}{branch.isHq ? " · HQ" : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Supplier (optional)">
          <Select name="supplierId" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">No supplier named</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </Select>
        </FormField>
        {purchases.length ? (
          <FormField label="Supplier bill (optional)">
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
          </FormField>
        ) : null}
        <FormField label="Expected on (optional)">
          <Input name="expectedDate" type="date" />
        </FormField>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">What is coming</p>
        {rows.map((row, index) => (
          <div key={row.key} className="space-y-3 rounded-xl border border-border p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item {index + 1}</span>
              {rows.length > 1 ? (
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground hover:text-danger"
                  onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <Select name="productId" value={row.productId} onChange={(event) => updateRow(row.key, event.target.value)} aria-label={`Item ${index + 1}`}>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                  {product.tracking === "SERIAL" ? " (serial)" : product.tracking === "NONE" ? " (no number)" : " (IMEI)"}
                </option>
              ))}
            </Select>
            <input type="hidden" name="identity" value={row.identity} />
            {row.identity === "NONE" ? (
              <FormField label="How many pieces" className="sm:max-w-xs">
                <Input name="quantity" type="number" inputMode="numeric" min={1} defaultValue={1} required />
              </FormField>
            ) : (
              <>
                <input type="hidden" name="quantity" value="0" />
                <ScanList name="identifiers" kind={row.identity === "SERIAL" ? "SERIAL" : "IMEI"} />
              </>
            )}
            <p className="text-xs text-muted-foreground">
              {row.identity === "IMEI" && "Phone. Scan every IMEI."}
              {row.identity === "SERIAL" && "Item with a serial number. Scan every serial."}
              {row.identity === "NONE" && "No IMEI and no serial, like charger cords. Type how many."}
            </p>
          </div>
        ))}
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline"
          onClick={() => setRows((current) => [...current, { key: Date.now(), productId: products[0]?.id ?? "", identity: products[0]?.tracking ?? "IMEI" }])}
        >
          + Add another item
        </button>
      </div>

      <FormField label="Notes (optional)">
        <Textarea name="notes" placeholder="Carton marks, waybill, rider" />
      </FormField>
    </ActionForm>
  )
}
