import { ReceiptBatchButton } from "@/components/receipt-batch-button"
import Link from "next/link"
import { getSales } from "@/app/actions/sales"
import { PageHeader, StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import { statusLabel } from "@/lib/status"

export default async function SalesPage() {
  const sales = await getSales()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        description="Every sale stays as it was. Open the bill to collect the rest of the money. Never change an old sale."
        actions={<Button asChild><Link href="/pos">Sell now</Link></Button>}
      />
      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Total / Paid</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id} className="border-b border-border/70">
                <td className="px-4 py-3">
                  <Link href={`/sales/${sale.id}`} className="font-medium text-primary">{sale.invoiceNumber}</Link>
                  <p className="text-xs text-muted-foreground">{formatDate(sale.saleDate)}</p>
                </td>
                <td className="px-4 py-3">
                  {sale.customer ? (
                    sale.customer.name
                  ) : (
                    <span>
                      Walk-in
                      <span className="block text-xs text-warning">This one needs a buyer name before anybody can return it</span>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{sale.branch.code}</td>
                <td className="px-4 py-3">{formatCurrency(money(sale.totalAmount))} / {formatCurrency(money(sale.paidAmount))}</td>
                <td className="px-4 py-3">{statusLabel(sale.paymentMethod)}</td>
                <td className="px-4 py-3"><StatusBadge value={sale.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ReceiptBatchButton />
    </div>
  )
}
