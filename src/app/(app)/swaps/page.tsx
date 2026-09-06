import Link from "next/link"
import { completeSwap, getSwaps } from "@/app/actions/ops"
import { getProducts } from "@/app/actions/catalog"
import { getPosLookups } from "@/app/actions/sales"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency, money } from "@/lib/utils"
import { SwapForm } from "./swap-form"

export default async function SwapsPage() {
  const [swaps, lookups, products] = await Promise.all([getSwaps(), getPosLookups(), getProducts()])
  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <div>
        <PageHeader title="Swaps" description="Customer brings an old phone. You give a value, wait for approval, give a new phone, collect or pay the difference, then print the invoice." />
        <WorkflowSteps current={0} steps={["Old phone in", "Agree value", "Boss approves", "New phone out", "Balance", "Invoice"]} />
        <div className="space-y-3">
          {swaps.map((swap) => (
            <div key={swap.id} className="surface-card p-5">
              <div className="flex justify-between">
                <p className="font-semibold">{swap.swapNumber}</p>
                <StatusBadge value={swap.status} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {swap.customer.name} trades {swap.oldImei.imei1} ({swap.oldImei.product.name}) for {swap.newProduct.name}
              </p>
              <p className="mt-1 text-sm">
                Trade {formatCurrency(money(swap.tradeValue))} · customer pays {formatCurrency(money(swap.balanceAmount))}
              </p>
              {swap.invoice ? (
                <p className="mt-2 text-sm">
                  Closed on <Link href={`/sales/${swap.invoice.id}`} className="text-primary">{swap.invoice.invoiceNumber}</Link>
                </p>
              ) : null}
              {swap.status === "PENDING" ? (
                <p className="mt-3 text-xs text-amber-700">Waiting on CEO / manager approval. Collecting now is only for approvers.</p>
              ) : null}
              {swap.status === "APPROVED" || swap.status === "PENDING" ? (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-2 text-sm font-medium">Collect difference and close</p>
                  <ActionForm action={completeSwap} submit="Collect & invoice" className="grid gap-2 md:grid-cols-3">
                    <input type="hidden" name="id" value={swap.id} />
                    <Input name="paidAmount" type="number" defaultValue={money(swap.balanceAmount)} />
                    <Select name="method" defaultValue="TRANSFER">
                      <option value="CASH">Cash</option>
                      <option value="TRANSFER">Transfer</option>
                      <option value="POS">POS</option>
                    </Select>
                  </ActionForm>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Start swap</h3>
        <SwapForm
          customers={lookups.customers.map((customer) => ({ id: customer.id, name: customer.name }))}
          products={products.map((product) => ({ id: product.id, name: product.name }))}
          imeis={lookups.imeis.map((item) => ({
            id: item.id,
            imei1: item.imei1,
            branchId: item.branchId,
            product: { name: item.product.name },
          }))}
          branches={lookups.branches.map((branch) => ({ id: branch.id, name: branch.name }))}
          defaultBranchId={lookups.branchId}
        />
      </div>
    </div>
  )
}
