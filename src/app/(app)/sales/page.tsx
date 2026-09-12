import { ReceiptBatchButton } from "@/components/receipt-batch-button"
import Link from "next/link"
import { getSales } from "@/app/actions/sales"
import { PageHeader } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { SalesList } from "./sales-list"

export default async function SalesPage() {
  const sales = await getSales()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        description="Every sale stays as it was. Open the bill to collect the rest of the money. Never change an old sale."
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
