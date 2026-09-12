"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { FilterChips } from "@/components/filter-chips"
import { EmptyState, StatusBadge } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { formatShopWhen } from "@/lib/lagos-day"
import { formatCurrency, money } from "@/lib/utils"

type PurchaseRow = {
  id: string
  invoiceNumber: string
  source: string | null
  status: string
  originCity: string | null
  originCountry: string | null
  expectedDate: Date | null
  receivedDate: Date | null
  createdAt: Date
  totalAmount: unknown
  paidAmount: unknown
  supplier: { name: string; city: string | null; country: string | null }
  branch: { name: string }
  items: Array<{ product: { name: string } }>
  incomingLots: Array<{ status: string }>
  trace: {
    expected: number
    recorded: number
    sold: number
    soldToday: number
    inShop: number
    shortVsBill: number
  }
}

const STATUS_CHIPS = [
  { key: "all", label: "All bills" },
  { key: "RECEIVED", label: "Received", tone: "success" as const },
  { key: "PARTIAL_RECEIVED", label: "Part received", tone: "warning" as const },
  { key: "PENDING", label: "Waiting", tone: "warning" as const },
  { key: "ORDERED", label: "Ordered", tone: "primary" as const },
  { key: "CANCELLED", label: "Cancelled", tone: "danger" as const },
]

export function PurchasesList({
  purchases,
  search,
}: {
  purchases: PurchaseRow[]
  search?: string
}) {
  const [status, setStatus] = useState("all")

  const filtered = useMemo(
    () => purchases.filter((purchase) => (status === "all" ? true : purchase.status === status)),
    [purchases, status]
  )

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { all: purchases.length }
    for (const purchase of purchases) {
      byStatus[purchase.status] = (byStatus[purchase.status] ?? 0) + 1
    }
    return byStatus
  }, [purchases])

  const pager = usePagedRows(filtered, `${search ?? ""}|${status}`)

  if (purchases.length === 0) {
    return (
      <EmptyState
        title={search?.trim() ? "No supplier bill matches that search" : "No supplier goods booked yet"}
        hint={
          search?.trim()
            ? "Try an IMEI, a bill number, a supplier name, or an item name."
            : "Use the form on the right to book goods from China, Dubai, Lagos, or any supplier you have named."
        }
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="surface-card p-4">
        <FilterChips
          label="Bill status"
          activeKey={status}
          onSelect={setStatus}
          chips={STATUS_CHIPS.filter((chip) => chip.key === "all" || (counts[chip.key] ?? 0) > 0).map((chip) => ({
            ...chip,
            count: counts[chip.key] ?? 0,
          }))}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No bill matches this filter" hint="Tap another status chip above." />
      ) : (
        pager.pageRows.map((purchase) => {
          const item = purchase.items[0]
          const origin = [purchase.originCity || purchase.supplier.city, purchase.originCountry || purchase.supplier.country]
            .filter(Boolean)
            .join(", ")
          const comingLots = purchase.incomingLots.filter((lot) => lot.status === "COMING").length
          const { trace } = purchase
          const totalVal = money(purchase.totalAmount)
          const paidVal = money(purchase.paidAmount)
          const owedVal = Math.max(0, totalVal - paidVal)
          const when = purchase.receivedDate ?? purchase.createdAt

          return (
            <Link key={purchase.id} href={`/purchases/${purchase.id}`} className="surface-card block p-5 hover:bg-muted/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{purchase.invoiceNumber}</p>
                  {purchase.source === "UPLOAD_STOCK" ? (
                    <p className="text-xs font-medium text-primary">Loaded on Upload stock</p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {purchase.supplier.name}
                    {origin ? ` · from ${origin}` : ""}
                    {" · "}
                    {purchase.branch.name}
                  </p>
                  <p className="mt-1 text-sm">
                    {item?.product.name}
                    {" · on bill "}
                    {trace.expected}
                    {" · scanned in "}
                    {trace.recorded}
                    {" · sold "}
                    {trace.sold}
                    {trace.soldToday ? ` · sold today ${trace.soldToday}` : ""}
                    {" · still on shelf "}
                    {trace.inShop}
                  </p>
                  {trace.shortVsBill > 0 ? (
                    <p className="mt-1 text-sm text-warning">
                      {trace.shortVsBill} unit{trace.shortVsBill === 1 ? "" : "s"} on this bill were never put into the
                      shop.
                    </p>
                  ) : null}
                  {purchase.expectedDate ? (
                    <p className="mt-1 text-sm text-muted-foreground">Due {formatShopWhen(purchase.expectedDate)}</p>
                  ) : null}
                  {comingLots ? (
                    <p className="mt-1 text-sm text-warning">
                      {comingLots} carton list booked as Coming. Not for sale yet.
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <StatusBadge value={purchase.status} />
                  <p className="mt-2 text-xs font-medium tabular-nums text-muted-foreground">
                    {purchase.receivedDate ? "Received" : "Booked"} {formatShopWhen(when)}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-3">
                <span>
                  <span className="eyebrow block">Bill value</span>
                  <strong className="num">{formatCurrency(totalVal)}</strong>
                </span>
                <span>
                  <span className="eyebrow block">We have paid</span>
                  <strong className="num text-success">{formatCurrency(paidVal)}</strong>
                </span>
                <span>
                  <span className="eyebrow block">Still owed</span>
                  <strong className={`num ${owedVal > 0 ? "text-warning" : "text-success"}`}>
                    {formatCurrency(owedVal)}
                  </strong>
                </span>
              </div>
            </Link>
          )
        })
      )}
      {filtered.length > 0 ? (
        <div className="surface-card overflow-hidden">
          <TablePager
            page={pager.page}
            pageCount={pager.pageCount}
            pageSize={pager.pageSize}
            total={pager.total}
            start={pager.start}
            end={pager.end}
            onPageChange={pager.setPage}
            onPageSizeChange={pager.setPageSize}
            noun="bills"
          />
        </div>
      ) : null}
    </div>
  )
}
