import { ReceiptBatchButton } from "@/components/receipt-batch-button"
import Link from "next/link"
import { getSales } from "@/app/actions/sales"
import { PageHeader } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { money } from "@/lib/utils"
import { SalesList, type SaleRow } from "./sales-list"
import { CachePageData } from "@/components/cache-page-data"

export default async function SalesPage() {
  const raw = await getSales()
  // Plain numbers and strings only. Database money values are not plain
  // objects, and handing them to the browser raised a warning per figure.
  const sales: SaleRow[] = raw.map((sale) => ({
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    saleDate: sale.saleDate.toISOString(),
    totalAmount: money(sale.totalAmount),
    paidAmount: money(sale.paidAmount),
    discount: money(sale.discount),
    paymentMethod: sale.paymentMethod,
    status: sale.status,
    isWholesale: sale.isWholesale,
    customer: sale.customer ? { name: sale.customer.name, phone: sale.customer.phone } : null,
    branch: { code: sale.branch.code, name: sale.branch.name },
    soldBy: sale.user?.name ?? null,
    items: sale.items.map((item) => ({
      id: item.id,
      name: item.product.name,
      imei: item.imei?.imei1 ?? null,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      totalPrice: money(item.totalPrice),
    })),
  }))
  return (
    <div className="space-y-6">
      <CachePageData pageKey="sales" title="Sales" data={sales} />
      <PageHeader
        title="Sales"
        description="Every bill, what was paid and what is still owed."
        actions={
          <Button asChild>
            <Link href="/pos">Sell now</Link>
          </Button>
        }
      />
      <SalesList sales={sales} />
      <ReceiptBatchButton />
    </div>
  )
}
