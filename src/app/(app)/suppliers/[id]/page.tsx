import Link from "next/link"
import { notFound } from "next/navigation"
import { getSupplier } from "@/app/actions/parties"
import { PageHeader, StatusBadge } from "@/components/shared"
import { formatCurrency, formatDate, money } from "@/lib/utils"

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supplier = await getSupplier(id)
  if (!supplier) notFound()
  const owed = supplier.purchases.reduce((sum, row) => sum + money(row.totalAmount) - money(row.paidAmount), 0)

  return (
    <div className="space-y-6">
      <PageHeader title={supplier.name} description={`${supplier.kind === "NEIGHBOR" ? "Neighboring shop" : "Supplier"} · ${[supplier.city, supplier.country].filter(Boolean).join(", ") || "Origin not set"} · ${supplier.phone}${supplier.contactPerson ? ` · ${supplier.contactPerson}` : ""}`} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Still owed</p>
          <p className="text-2xl font-semibold">{formatCurrency(owed)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Purchase orders</p>
          <p className="text-2xl font-semibold">{supplier.purchases.length}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">IMEIs from this house</p>
          <p className="text-2xl font-semibold">{supplier.imeiRecords.length}</p>
        </div>
      </div>
      <div className="surface-card overflow-hidden">
        <h3 className="border-b border-border px-5 py-4 font-semibold">Purchase orders</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-5 py-3">PO</th>
              <th className="px-3 py-3">Branch</th>
              <th className="px-3 py-3">Value / Paid</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {supplier.purchases.map((row) => (
              <tr key={row.id} className="border-b border-border/70">
                <td className="px-5 py-3">
                  <Link href={`/purchases/${row.id}`} className="font-medium text-primary">{row.invoiceNumber}</Link>
                  <p className="text-xs text-muted-foreground">{formatDate(row.createdAt)}</p>
                </td>
                <td className="px-3 py-3">{row.branch.code}</td>
                <td className="px-3 py-3">
                  {formatCurrency(money(row.totalAmount))} / {formatCurrency(money(row.paidAmount))}
                </td>
                <td className="px-5 py-3"><StatusBadge value={row.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
