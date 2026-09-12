import Link from "next/link"
import { notFound } from "next/navigation"
import { getSupplier } from "@/app/actions/parties"
import { PageHeader, StatusBadge } from "@/components/shared"
import { formatCurrency, formatDate, money } from "@/lib/utils"

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supplier = await getSupplier(id)
  if (!supplier) notFound()

  const totalPurchased = supplier.purchases.reduce((sum, row) => sum + money(row.totalAmount), 0)
  const totalPaid = supplier.purchases.reduce((sum, row) => sum + money(row.paidAmount), 0)
  const totalOwed = Math.max(0, totalPurchased - totalPaid)

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.name}
        description={`${supplier.kind === "NEIGHBOR" ? "Neighboring shop" : "Supplier"} · ${[supplier.city, supplier.country].filter(Boolean).join(", ") || "Where they are is not set"} · ${supplier.phone}${supplier.contactPerson ? ` · ${supplier.contactPerson}` : ""}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Everything they billed us</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(totalPurchased)}</p>
          <p className="text-xs text-muted-foreground mt-1">{supplier.purchases.length} supplier bill(s)</p>
        </div>

        <div className="surface-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">We have paid them</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-success">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-muted-foreground mt-1">Money we have sent to them so far</p>
        </div>

        <div className="surface-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">We still owe them</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-warning">{formatCurrency(totalOwed)}</p>
          <p className="text-xs text-muted-foreground mt-1">{totalOwed === 0 ? "We owe them nothing" : "Money we have not paid yet"}</p>
        </div>

        <div className="surface-card p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Phones we collected</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{supplier.imeiRecords.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Phones and serial items booked in from them</p>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-semibold">Every bill from this supplier</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground bg-muted/40 text-xs uppercase tracking-wider">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Bill number</th>
                <th className="px-3 py-3">Shop</th>
                <th className="px-3 py-3 text-right">Bill value</th>
                <th className="px-3 py-3 text-right">We have paid</th>
                <th className="px-4 py-3 text-right">Still owed</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {supplier.purchases.map((row) => {
                const poVal = money(row.totalAmount)
                const poPaid = money(row.paidAmount)
                const poOwed = Math.max(0, poVal - poPaid)

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

                    <td className="px-4 py-3 text-right tabular-nums font-mono font-bold text-foreground">
                      {formatCurrency(poOwed)}
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
