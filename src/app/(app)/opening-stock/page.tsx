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
        <EmptyState title="No shop is open to you" hint="You can only correct opening stock for shops you are allowed to see." />
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
        description="Count the shelf. Fill missing cost or sell prices and piece counts here before Close."
      />

      {selected.status === "OPEN" ? (
        <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          Opening stock is still open. You can type cost, lowest sell, and selling price on each line, and fix accessory piece counts. Rows skipped on the Excel (blank quantity) can be added with Add a missing item. Close only when the shelf and the prices are right.
        </p>
      ) : null}
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
              {shop.status === "CLOSED" ? "Closed" : shop.status === "OPEN" ? "Still open" : "Not loaded"}
            </TonePill>
          </Link>
        ))}
      </nav>

      {book?.record ? (
        <OpeningStockBook key={`${selected.id}-${book.record.status}`} branchId={selected.id} book={book} />
      ) : (
        <EmptyState
          title={`${selected.name} has no opening stock yet`}
          hint="Load the shop first from Upload stock → Many at once (Excel). Then come back here to count and close."
        />
      )}
    </div>
  )
}
