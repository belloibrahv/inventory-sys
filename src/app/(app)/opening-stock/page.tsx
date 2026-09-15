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
        <PageHeader title="Opening Balance Reconciliation & Finalization" />
        <EmptyState title="No accessible locations found" hint="You only have access to view opening balances for authorized branch locations." />
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
        title="Opening Balance Reconciliation & Finalization"
        description="Reconcile physical inventory counts against staged migration loads. Validate quantities, serialized IMEIs, and unit costs prior to balance sheet lock. Finalized opening balances serve as the immutable historical baseline."
      />

      <nav className="flex flex-wrap gap-2" aria-label="Locations">
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
              {shop.status === "CLOSED" ? "Finalized" : shop.status === "OPEN" ? "In Review" : "Uninitialized"}
            </TonePill>
          </Link>
        ))}
      </nav>

      {book?.record ? (
        <OpeningStockBook key={`${selected.id}-${book.record.status}`} branchId={selected.id} book={book} />
      ) : (
        <EmptyState
          title={`${selected.name} has no staged opening balances`}
          hint="Import an initial inventory schedule via Batch Data Import. Once staged, initial inventory lines will appear here for audit verification."
        />
      )}
    </div>
  )
}
