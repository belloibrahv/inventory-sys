"use client"

import { useState } from "react"
import { intakeImei } from "@/app/actions/imei"
import { ActionForm } from "@/components/action-form"
import { PhotoField } from "@/components/photo-field"
import { ScanField } from "@/components/scan-field"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { PHONE_LOOK_OPTIONS } from "@/lib/phone-look"

type Product = { id: string; name: string }
type Branch = { id: string; name: string }
type Supplier = { id: string; name: string }

export function ImeiIntakeForm({
  products,
  branches,
  suppliers,
}: {
  products: Product[]
  branches: Branch[]
  suppliers: Supplier[]
}) {
  const [imei1, setImei1] = useState("")
  const [supplierChoice, setSupplierChoice] = useState("")

  const addingNewSupplier = supplierChoice === "__new__"

  return (
    <ActionForm action={intakeImei} submit="Add phone to shop" className="space-y-3">
      <ScanField onScan={setImei1} placeholder="Scan IMEI 1, then Enter" />
      <input type="hidden" name="imei1" value={imei1} />
      {imei1 ? <p className="font-mono text-xs">{imei1}</p> : null}
      <Input name="imei2" placeholder="IMEI 2" />
      <Input name="serialNumber" placeholder="Serial" />
      <Select name="productId" required emptyLabel="No item is on the list yet. Add them on Phones and items first.">
        {products.map((product) => (
          <option key={product.id} value={product.id}>{product.name}</option>
        ))}
      </Select>
      <Select name="branchId" required>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </Select>
      <Select
        name="supplierId"
        value={supplierChoice}
        onChange={(event) => setSupplierChoice(event.target.value)}
      >
        <option value="">Supplier</option>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
        ))}
        <option value="__new__">Add new supplier</option>
      </Select>
      {addingNewSupplier ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs font-semibold text-foreground">New supplier</p>
          <Input name="newSupplierName" required placeholder="Supplier name" />
          <Input name="newSupplierPhone" required placeholder="Supplier phone number" />
          <Input name="newSupplierCity" placeholder="City (optional)" />
        </div>
      ) : null}
      <Select name="cosmeticGrade" defaultValue="">
        <option value="">How the phone looks</option>
        {PHONE_LOOK_OPTIONS.map((row) => (
          <option key={row.value} value={row.value}>{row.label}</option>
        ))}
      </Select>
      <Input name="conditionNotes" placeholder="Anything else about its condition" />
      <PhotoField />
      <Input name="notes" placeholder="Notes" />
    </ActionForm>
  )
}
