import { ReceiptBatchButton } from "@/components/receipt-batch-button"
import Link from "next/link"
import { getSales } from "@/app/actions/sales"
import { PageHeader } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { SalesList } from "./sales-list"
import { CachePageData } from "@/components/cache-page-data"

export default async function SalesPage() {
  const sales = await getSales()
  return (
    <div className="space-y-6">
      <CachePageData pageKey="sales" title="Sales" data={sales} />
      <PageHeader
        title="Sales"
        description="Branch, customer, sales value, paid, balance, and payment method for each bill. Totals follow the days you pick."
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
