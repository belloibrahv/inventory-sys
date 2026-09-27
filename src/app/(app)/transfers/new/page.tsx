import { prisma } from "@/lib/prisma"
import { getPosLookups } from "@/app/actions/sales"
import { FormScreen } from "@/components/shared"
import { canSeeCost } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { money } from "@/lib/utils"
import { TransferForm } from "../transfer-form"

export default async function StartTransferPage() {
  // Transfers are valued at cost for the CEO and at sell price for everyone else.
  const atCost = canSeeCost((await requireUser()).role)
  const [lookups, catalog] = await Promise.all([
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

  // How many phone records each shop really holds per item. A phone can only be
  // sent by its own number, so when the shelf count is higher than this the
  // extra units cannot be picked — and the packing table looks empty for no
  // visible reason. The form says so instead of leaving staff guessing.
  const unitRows = await prisma.imeiRecord.groupBy({
    by: ["productId", "branchId"],
    where: { status: "IN_STOCK" },
    _count: { _all: true },
  })
  const unitsByKey = new Map(
    unitRows.map((row) => [`${row.productId}:${row.branchId}`, row._count._all])
  )

  const products = catalog.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    serialized: product.tracking !== "NONE",
    costPrice: money(atCost ? product.costPrice : product.sellingPrice),
    brand: { name: product.brand.name },
    category: { name: product.category.name },
    stock: product.inventory.map((row) => ({
      branchId: row.branchId,
      quantity: row.quantity,
      // Phone records In shop for this item at this shop.
      units: unitsByKey.get(`${product.id}:${row.branchId}`) ?? 0,
    })),
  }))

  return (
    <FormScreen
      title="Start a transfer"
      description={`From branch, to branch, find items, type how many to send, check the ${atCost ? "cost value" : "value"}, then submit. Stock leaves only when the other shop accepts.`}
      backHref="/transfers"
      wide
    >
      <TransferForm branches={lookups.branches} products={products} defaultFromId={lookups.branchId} successHref="/transfers" atCost={atCost} />
    </FormScreen>
  )
}
