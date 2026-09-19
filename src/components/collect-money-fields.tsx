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

/**
 * Money collected on a credit balance. Staff can take cash only, bank only,
 * or cash and bank together in one save.
 */
export function CollectMoneyFields({
  banks,
  defaultAmount,
  amountName = "amount",
  allowSplit = false,
}: {
  banks: ShopBankOption[]
  defaultAmount?: number
  amountName?: string
  /** When true, show Cash and Bank boxes so one collection can use both. */
  allowSplit?: boolean
}) {
  const [method, setMethod] = useState<"CASH" | "TRANSFER">(banks.length ? "TRANSFER" : "CASH")
  const [bankAccountId, setBankAccountId] = useState(banks[0]?.id ?? "")
  const [cashAmount, setCashAmount] = useState("")
  const [bankAmount, setBankAmount] = useState(
    allowSplit && defaultAmount != null && banks.length ? String(defaultAmount) : ""
  )

  if (allowSplit) {
    const bankTyped = Math.max(0, Number(bankAmount) || 0)
    return (
      <>
        <label className="block text-sm md:col-span-full">
          <span className="mb-1 block text-muted-foreground">Cash received now</span>
          <Input
            name="cashAmount"
            type="number"
            min={0}
            step="0.01"
            placeholder="0"
            value={cashAmount}
            onChange={(event) => setCashAmount(event.target.value)}
          />
        </label>
        <label className="block text-sm md:col-span-full">
          <span className="mb-1 block text-muted-foreground">Bank received now</span>
          <Input
            name="bankAmount"
            type="number"
            min={0}
            step="0.01"
            placeholder="0"
            value={bankAmount}
            onChange={(event) => setBankAmount(event.target.value)}
          />
        </label>
        {bankTyped > 0 ? (
          banks.length ? (
            <label className="block text-sm md:col-span-full">
              <span className="mb-1 block text-muted-foreground">Bank account that received it</span>
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
            </label>
          ) : (
            <p className="text-xs text-muted-foreground md:col-span-full">
              No bank account is on the books for this shop. Add one under Money in and out before recording a bank payment.
            </p>
          )
        ) : (
          <input type="hidden" name="bankAccountId" value="" />
        )}
        <p className="text-xs text-muted-foreground md:col-span-full">
          Type cash, bank, or both. The sale stays Credit sales until the full bill is paid. Check the books counts each channel.
        </p>
      </>
    )
  }

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
