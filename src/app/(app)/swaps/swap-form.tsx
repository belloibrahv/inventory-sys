"use client"

import { useMemo, useState } from "react"
import { createSwap } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"

type Product = { id: string; name: string }
type Customer = { id: string; name: string; phone: string; branchId: string }
type Branch = { id: string; name: string }

const CONDITIONS = [
  { value: "UK_USED", label: "Uk" },
  { value: "BRAND_NEW", label: "Brand new" },
  { value: "OPEN_BOX", label: "OPENBOX" },
  { value: "REFURBISHED", label: "Refurbished" },
  { value: "FAULTY", label: "Damaged" },
  { value: "SWAP_DEVICE", label: "Swap device" },
] as const

export function SwapForm({
  customers,
  products,
  branches,
  defaultBranchId,
}: {
  customers: Customer[]
  products: Product[]
  branches: Branch[]
  defaultBranchId?: string | null
}) {
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || "")
  const [customerId, setCustomerId] = useState("")
  const [tradeValue, setTradeValue] = useState("")
  const [givenValue, setGivenValue] = useState("")

  const shopCustomers = customers.filter((row) => row.branchId === branchId)
  const pickedCustomer = shopCustomers.find((row) => row.id === customerId)
  const swapAmount = Number(tradeValue || 0)
  const givenAmount = Number(givenValue || 0)
  const balance = givenAmount - swapAmount
  const balanceLabel = useMemo(() => {
    if (!Number.isFinite(balance) || (!tradeValue && !givenValue)) return null
    if (balance > 0) return { kind: "receivable" as const, amount: balance }
    if (balance < 0) return { kind: "payable" as const, amount: Math.abs(balance) }
    return { kind: "even" as const, amount: 0 }
  }, [balance, tradeValue, givenValue])

  return (
    <ActionForm
      action={createSwap}
      submit="Save for approval"
      successMessage="Swap Deal saved. Waiting for approval."
      confirmModal={{
        title: "Send this Swap Deal for approval?",
        description:
          "A manager must say yes before stock moves. The shop item stays In shop and the swap-in item does not hit the shelf until approval.",
        confirmLabel: "Send for approval",
        tone: "warning",
        impactItems: [
          "No stock leaves the shop yet",
          "No swap-in item hits In shop yet",
          "Needs approval gets this request",
        ],
      }}
      className="space-y-3"
    >
      <Select
        name="branchId"
        value={branchId}
        onChange={(event) => {
          setBranchId(event.target.value)
          setCustomerId("")
        }}
        required
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </Select>

      <Select
        name="customerId"
        value={customerId}
        onChange={(event) => setCustomerId(event.target.value)}
      >
        <option value="">The customer is not on the list. Type the name below.</option>
        {shopCustomers.map((customer) => (
          <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>
        ))}
      </Select>
      <Input
        name="customerName"
        defaultValue={pickedCustomer?.name ?? ""}
        placeholder="Customer name"
        required
        key={`customer-name-${customerId}-${branchId}`}
      />
      <Input
        name="customerPhone"
        defaultValue={pickedCustomer?.phone ?? ""}
        placeholder="Customer phone"
        required
        key={`customer-phone-${customerId}-${branchId}`}
      />

      <Input
        name="oldDeviceId"
        placeholder="Customer device IMEI or serial number"
        required
      />
      <Select name="oldProductId" required emptyLabel="No item is on the list yet. Add them on Phones and items first.">
        {products.map((product) => (
          <option key={product.id} value={product.id}>{product.name}</option>
        ))}
      </Select>
      <Select name="oldDeviceCondition" defaultValue="UK_USED">
        {CONDITIONS.map((item) => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </Select>
      <Input
        name="tradeValue"
        type="number"
        min={0}
        value={tradeValue}
        onChange={(event) => setTradeValue(event.target.value)}
        placeholder="Value of the swap-in item"
        required
      />

      <Input
        name="newDeviceId"
        placeholder="Shop device IMEI or serial number going out"
        required
      />
      <p className="text-sm text-muted-foreground">
        Scan or type the In shop phone or laptop the buyer is taking.
      </p>
      <Input
        name="givenValue"
        type="number"
        min={0}
        value={givenValue}
        onChange={(event) => setGivenValue(event.target.value)}
        placeholder="Value of the shop item given out"
        required
      />

      {balanceLabel ? (
        <p className="text-sm font-medium">
          {balanceLabel.kind === "receivable"
            ? `Receivable (customer pays us): ${formatCurrency(balanceLabel.amount)}`
            : balanceLabel.kind === "payable"
              ? `Payable (we pay the customer): ${formatCurrency(balanceLabel.amount)}`
              : "Balance: even. No money either way."}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Balance shows Receivable if the shop item is worth more, or Payable if the swap-in item is worth more.
        </p>
      )}
    </ActionForm>
  )
}
