import { prisma } from "@/lib/prisma"
import { getTransfers } from "@/app/actions/ops"
import { getPosLookups } from "@/app/actions/sales"
import { PageHeader } from "@/components/shared"
import { money } from "@/lib/utils"
import { TransferForm } from "./transfer-form"
import { TransfersList } from "./transfers-list"

export default async function TransfersPage() {
  const [transfers, lookups, catalog] = await Promise.all([
    getTransfers(),
    getPosLookups(),
    prisma.product.findMany({
      where: { isActive: true },
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true } },
        inventory: { select: { branchId: true, quantity: true } },
      },
      orderBy: { name: "asc" },
    }),
  ])

  const products = catalog.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    serialized: product.tracking !== "NONE",
    costPrice: money(product.costPrice),
    brand: { name: product.brand.name },
    category: { name: product.category.name },
    stock: product.inventory.map((row) => ({ branchId: row.branchId, quantity: row.quantity })),
  }))

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
    <div className="space-y-8">
      <PageHeader
        title="Shop to shop (Stock Transfer)"
        description="From one Abu Twins branch to another. Search items, set qty to send, see cost value, extract a sheet if you need it, then submit. Stock stays In shop at the sending branch until the receiving branch accepts."
      />

      <div className="surface-card p-5">
        <h3 className="mb-1 font-semibold">Start a stock transfer</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          From branch, To branch, find items, type qty to send, check the cost value, extract if you need a packing sheet, then submit. Accept and Reject stay the same.
        </p>
        <TransferForm
          branches={lookups.branches}
          products={products}
          defaultFromId={lookups.branchId}
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold tracking-tight">Transfers for this shop</h3>
        <TransfersList transfers={listRows} />
      </div>
    </div>
  )
}
