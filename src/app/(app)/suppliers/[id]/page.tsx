import Link from "next/link"
import { notFound } from "next/navigation"
import { getSupplier } from "@/app/actions/parties"
import { PageHeader, StatCard, StatGrid, StatusBadge } from "@/components/shared"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import {
  formatPurchaseBalanceCell,
  formatValueOwingMinus,
  formatValueOwingPlus,
  purchaseBalance,
} from "@/lib/purchase-money"

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supplier = await getSupplier(id)
  if (!supplier) notFound()

  const totalPurchased = supplier.purchases.reduce((sum, row) => sum + money(row.totalAmount), 0)
  const totalPaid = supplier.purchases.reduce((sum, row) => sum + money(row.paidAmount), 0)
  let net = 0
  for (const row of supplier.purchases) {
    const bal = purchaseBalance(row.totalAmount, row.paidAmount, row.returnedAmount)
    net += bal.remaining - bal.paid
  }
  net -= money(supplier.creditBalance)
  const totalOwed = Math.max(0, net)
  const totalSurplus = Math.max(0, -net)

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/suppliers"
        title={supplier.name}
        description={`${supplier.kind === "NEIGHBOR" ? "Neighboring shop" : "Supplier"} · ${[supplier.city, supplier.country].filter(Boolean).join(", ") || "Where they are is not set"} · ${supplier.phone}${supplier.contactPerson ? ` · ${supplier.contactPerson}` : ""}`}
      />

      <StatGrid>
        <StatCard
          label="Everything they billed us"
          value={formatCurrency(totalPurchased)}
          hint={`${supplier.purchases.length} supplier bill${supplier.purchases.length === 1 ? "" : "s"}`}
          href="#supplier-bills"
        />
        <StatCard
          label="Payment"
          value={formatCurrency(totalPaid)}
          tone="success"
          href="#supplier-bills"
        />
        <StatCard
          label="Value owing"
          value={formatValueOwingMinus(totalOwed)}
          tone={totalOwed > 0 ? "warning" : "neutral"}
          href="#supplier-bills"
        />
        <StatCard
          label="Value owing"
          value={formatValueOwingPlus(totalSurplus)}
          tone={totalSurplus > 0 ? "success" : "neutral"}
          href="#supplier-bills"
        />
        <StatCard
          label="Phones we collected"
          value={String(supplier.imeiRecords.length)}
          href="#supplier-bills"
        />
      </StatGrid>

      <div id="supplier-bills" className="surface-card scroll-mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-semibold">Every bill from this supplier</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground bg-muted/40 text-xs uppercase tracking-wider">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Bill number</th>
                <th className="px-3 py-3">Shop</th>
                <th className="px-3 py-3 text-right">Invoice value</th>
                <th className="px-3 py-3 text-right">Payment</th>
                <th className="px-3 py-3 text-right">Stock return</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {supplier.purchases.map((row) => {
                const poVal = money(row.totalAmount)
                const poPaid = money(row.paidAmount)
                const bal = purchaseBalance(row.totalAmount, row.paidAmount, row.returnedAmount)

                return (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/purchases/${row.id}`} className="font-semibold text-primary hover:underline">
                        {row.invoiceNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground">{formatDate(row.createdAt)}</p>
                    </td>

                    <td className="px-3 py-3 font-medium">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">{row.branch.code}</span>
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums font-mono font-medium">
                      {formatCurrency(poVal)}
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums font-mono font-semibold text-success">
                      {formatCurrency(poPaid)}
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums font-mono">
                      {formatCurrency(bal.sentBack)}
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums font-mono font-bold text-foreground">
                      {formatPurchaseBalanceCell(bal.owed, bal.surplus)}
                    </td>

                    <td className="px-5 py-3 text-center">
                      <StatusBadge value={row.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
