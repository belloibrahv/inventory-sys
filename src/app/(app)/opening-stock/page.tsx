import Link from "next/link"
import { getOpeningBook, getOpeningShops } from "@/app/actions/opening-stock"
import { EmptyState, PageHeader, TonePill } from "@/components/shared"
import { OpeningStockBook } from "./opening-stock-book"

export const dynamic = "force-dynamic"

/**
 * Correct & close opening stock.
 *
 * Load the shop (Opening stock sheet) → download the count sheet → count the
 * shelf → correct on screen or by re-uploading the sheet → the CEO or main admin
 * closes it. Closed is final, and the shop can sell from then on.
 */
export default async function OpeningStockBookPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>
}) {
  const params = await searchParams
  const shops = await getOpeningShops()
  if (!shops.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="Correct & close opening stock" />
        <EmptyState title="No shop to show" hint="You can only see opening stock for shops you can reach." />
      </div>
    )
  }

  const selected =
    shops.find((shop) => shop.id === params.branchId) ??
    shops.find((shop) => shop.status === "OPEN") ??
    shops.find((shop) => shop.status) ??
    shops[0]
  const book = await getOpeningBook(selected.id)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Correct & close opening stock"
        description="Count the shelf against what was loaded, fix the quantities, IMEIs and prices, then close it. Closed opening stock never changes again, and it is the figure Reports uses for what each shop opened with."
      />

      <nav className="flex flex-wrap gap-2" aria-label="Shops">
        {shops.map((shop) => (
          <Link
            key={shop.id}
            href={`/opening-stock?branchId=${shop.id}`}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
              shop.id === selected.id ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border bg-card"
            }`}
          >
            {shop.name}
            <TonePill tone={shop.status === "CLOSED" ? "success" : shop.status === "OPEN" ? "warning" : "neutral"}>
              {shop.status === "CLOSED" ? "Closed" : shop.status === "OPEN" ? "Open" : "Not loaded"}
            </TonePill>
          </Link>
        ))}
      </nav>

      {book?.record ? (
        <OpeningStockBook key={`${selected.id}-${book.record.status}`} branchId={selected.id} book={book} />
      ) : (
        <EmptyState
          title={`${selected.name} has no opening stock yet`}
          hint="The person who loads stock puts it on the system from Upload stock → Opening stock sheet. It then shows here, open for counting."
        />
      )}
    </div>
  )
}
