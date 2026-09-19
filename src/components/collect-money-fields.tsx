"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

export type ShopBankOption = {
  id: string
  bankName: string
  accountNumber: string
  accountName?: string | null
}

export function CollectMoneyFields({
  banks,
  defaultAmount,
  amountName = "amount",
}: {
  banks: ShopBankOption[]
  defaultAmount?: number
  amountName?: string
}) {
  const [method, setMethod] = useState<"CASH" | "TRANSFER">(banks.length ? "TRANSFER" : "CASH")
  const [bankAccountId, setBankAccountId] = useState(banks[0]?.id ?? "")

  return (
    <>
      <Input
        name={amountName}
        type="number"
        placeholder="Amount"
        defaultValue={defaultAmount != null ? defaultAmount : undefined}
        required
      />
      <Select
        name="method"
        value={method}
        onChange={(event) => setMethod(event.target.value as "CASH" | "TRANSFER")}
      >
        <option value="CASH">Cash</option>
        <option value="TRANSFER">Bank</option>
      </Select>
      {method === "TRANSFER" ? (
        banks.length ? (
          <Select
            name="bankAccountId"
            value={bankAccountId}
            onChange={(event) => setBankAccountId(event.target.value)}
            required
          >
            {banks.map((row) => (
              <option key={row.id} value={row.id}>
                {row.bankName} · {row.accountNumber}
                {row.accountName ? ` · ${row.accountName}` : ""}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground md:col-span-full">
            No bank account is on the books for this shop. Add one under Money in and out before recording a bank payment.
          </p>
        )
      ) : (
        <input type="hidden" name="bankAccountId" value="" />
      )}
    </>
  )
}
