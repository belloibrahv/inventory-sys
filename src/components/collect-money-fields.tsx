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
  const [paymentRef, setPaymentRef] = useState("")

  // Whole naira only. A box that took kobo let ₦100,000.03 through on a
  // ₦100,000 payment, and the stray kobo then showed on the till and the books.
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
            step="1"
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
            step="1"
            placeholder="0"
            value={bankAmount}
            onChange={(event) => setBankAmount(event.target.value)}
          />
        </label>
        {bankTyped > 0 ? (
          banks.length ? (
            <>
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
              <label className="block text-sm md:col-span-full">
                <span className="mb-1 block text-muted-foreground">
                  Payment reference
                  <span className="ml-1.5 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-semibold text-danger">Required</span>
                </span>
                <Input
                  name="paymentReference"
                  value={paymentRef}
                  onChange={(event) => setPaymentRef(event.target.value)}
                  placeholder="Transfer description, POS approval code, or last 4 digits"
                  autoComplete="off"
                  className="font-mono"
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  This is how the admin checks this collection against the bank or POS terminal.
                </p>
              </label>
            </>
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

  const wantsBank = method === "TRANSFER"
  return (
    <>
      <Input
        name={amountName}
        type="number"
        min={0}
        step="1"
        placeholder="Amount"
        defaultValue={defaultAmount != null ? defaultAmount : undefined}
        required
      />
      <Select
        name="method"
        value={method}
        onChange={(event) => { setMethod(event.target.value as "CASH" | "TRANSFER"); setPaymentRef("") }}
      >
        <option value="CASH">Cash</option>
        <option value="TRANSFER">Bank</option>
      </Select>
      {wantsBank ? (
        banks.length ? (
          <>
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
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">
                Payment reference
                <span className="ml-1.5 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-semibold text-danger">Required</span>
              </span>
              <Input
                name="paymentReference"
                value={paymentRef}
                onChange={(event) => setPaymentRef(event.target.value)}
                placeholder="Transfer description, POS approval code, or last 4 digits"
                autoComplete="off"
                className="font-mono"
                required
              />
            </label>
          </>
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
