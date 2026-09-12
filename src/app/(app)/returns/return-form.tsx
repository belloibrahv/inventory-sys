"use client"

import { useMemo, useState } from "react"
import { createReturn } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency, money } from "@/lib/utils"
import { warrantyState } from "@/lib/warranty"

type Sold = {
  id: string
  imei1: string
  product: { name: string; sellingPrice: unknown; warrantyDays: number }
  customer: { name: string } | null
  sale: { invoiceNumber: string; saleDate: Date; items: Array<{ imeiId: string | null; totalPrice: unknown }> } | null
  branch: { code: string }
}

export function ReturnForm({ sold }: { sold: Sold[] }) {
  const [imei1, setImei1] = useState(sold[0]?.imei1 ?? "")
  const selected = useMemo(() => sold.find((row) => row.imei1 === imei1), [sold, imei1])
  const line = selected?.sale?.items.find((item) => item.imeiId === selected.id)
  const refund = money(line?.totalPrice) || money(selected?.product.sellingPrice)
  const warranty = selected?.sale
    ? warrantyState(selected.sale.saleDate, selected.product.warrantyDays)
    : null

  return (
    <ActionForm action={createReturn} className="space-y-3">
      <Select name="imei1" value={imei1} onChange={(event) => setImei1(event.target.value)} required emptyLabel="This shop has not sold any phone yet. A return needs a phone that this shop sold.">
        {sold.map((row) => (
          <option key={row.imei1} value={row.imei1}>
            {row.imei1} · {row.product.name} · {row.customer?.name ?? "Walk-in"}
          </option>
        ))}
      </Select>
      {selected ? (
        <p className="text-xs text-muted-foreground">
          {selected.sale?.invoiceNumber ?? "No invoice"} · {selected.branch.code} · old invoice stays as it is
          {warranty ? ` · ${warranty.label}` : ""}
        </p>
      ) : (
        <p className="text-xs text-danger">No IMEI has been sold here.</p>
      )}
      <Select name="reason" defaultValue="FAULTY">
        {["FAULTY", "WARRANTY", "CUSTOMER_DISSATISFACTION", "DAMAGED", "WRONG_PRODUCT", "SUPPLIER_RETURN"].map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </Select>
      <Select name="outcome" defaultValue="REPAIR">
        <option value="REPAIR">Repair</option>
        <option value="REPLACEMENT">Replace from our stock</option>
        <option value="REFUND">Refund</option>
        <option value="CREDIT_NOTE">Credit note</option>
        <option value="SEND_TO_SUPPLIER">Send back to the supplier</option>
      </Select>
      <Select name="faultClass" defaultValue="FAULTY_STOCK">
        {["GOOD_STOCK", "FAULTY_STOCK", "REPAIR_STOCK", "SCRAP_STOCK"].map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </Select>
      <Input name="refundAmount" type="number" defaultValue={refund || ""} key={`${imei1}-${refund}`} placeholder="Refund / credit if cash goes back" />
      <p className="text-xs text-muted-foreground">Suggested from the original sale: {formatCurrency(refund)}</p>
      <Textarea name="notes" placeholder="What the customer told you" />
    </ActionForm>
  )
}
