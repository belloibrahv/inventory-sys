import Link from "next/link"
import { Plus } from "lucide-react"
import { getTransfers } from "@/app/actions/ops"
import { PageHeader } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { money } from "@/lib/utils"
import { TransfersList } from "./transfers-list"

export default async function TransfersPage() {
  const transfers = await getTransfers()

  const listRows = transfers.map((transfer) => ({
    id: transfer.id,
    transferNumber: transfer.transferNumber,
    status: transfer.status,
    createdAt: transfer.createdAt,
    sentAt: transfer.sentAt,
    receivedAt: transfer.receivedAt,
    fromBranch: { code: transfer.fromBranch.code, name: transfer.fromBranch.name },
    toBranch: { code: transfer.toBranch.code, name: transfer.toBranch.name },
    items: transfer.items.map((item) => ({
      productId: item.productId,
      product: {
        name: item.product.name,
        sku: item.product.sku,
        costPrice: money(item.product.costPrice),
      },
      quantity: item.quantity,
    })),
    imeis: transfer.imeis.map((imei) => ({
      id: imei.id,
      imei1: imei.imei1,
      productId: imei.productId,
      name: imei.product.name,
      costPrice: money(imei.product.costPrice),
    })),
  }))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Shop to shop (Stock Transfer)"
        description="Stock stays in shop at the sending branch until the receiving branch accepts."
        actions={
          <Button asChild>
            <Link href="/transfers/new">
              <Plus className="mr-1.5 h-4 w-4" /> Start a transfer
            </Link>
          </Button>
        }
      />
      <TransfersList transfers={listRows} />
    </div>
  )
}
