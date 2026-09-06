"use client"

import { useState } from "react"
import { intakeImei } from "@/app/actions/imei"
import { ActionForm } from "@/components/action-form"
import { PhotoField } from "@/components/photo-field"
import { ScanField } from "@/components/scan-field"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

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

  return (
    <ActionForm action={intakeImei} submit="Add phone to shop" className="space-y-3">
      <ScanField onScan={setImei1} placeholder="Scan IMEI 1, then Enter" />
      <input type="hidden" name="imei1" value={imei1} />
      {imei1 ? <p className="font-mono text-xs">{imei1}</p> : null}
      <Input name="imei2" placeholder="IMEI 2" />
      <Input name="serialNumber" placeholder="Serial" />
      <Select name="productId" required>
        {products.map((product) => (
          <option key={product.id} value={product.id}>{product.name}</option>
        ))}
      </Select>
      <Select name="branchId" required>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </Select>
      <Select name="supplierId">
        <option value="">Supplier</option>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
        ))}
      </Select>
      <Select name="cosmeticGrade" defaultValue="">
        <option value="">Cosmetic grade</option>
        <option value="A">A. Like new</option>
        <option value="B">B. Light marks</option>
        <option value="C">C. Visible wear</option>
        <option value="D">D. Heavy wear / crack</option>
      </Select>
      <Input name="batteryHealth" type="number" min={1} max={100} placeholder="Battery health %" />
      <Input name="conditionNotes" placeholder="Condition notes" />
      <PhotoField />
      <Input name="notes" placeholder="Notes" />
    </ActionForm>
  )
}
