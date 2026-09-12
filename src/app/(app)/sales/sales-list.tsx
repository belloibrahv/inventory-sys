"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { FilterChips } from "@/components/filter-chips"
import { StatusBadge } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { formatShopWhen, matchesWhenFilter, type WhenFilter } from "@/lib/lagos-day"
import { formatCurrency, money } from "@/lib/utils"
import { statusLabel } from "@/lib/status"

type SaleRow = {
  id: string
  invoiceNumber: string
  saleDate: Date
  totalAmount: unknown
  paidAmount: unknown
  paymentMethod: string
  status: string
  customer: { name: string } | null
  branch: { code: string }
}

type PayFilter = "all" | "paid" | "part" | "unpaid"

function payKey(sale: SaleRow): Exclude<PayFilter, "all"> {
  const total = money(sale.totalAmount)
  const paid = money(sale.paidAmount)
  if (paid <= 0) return "unpaid"
  if (paid + 0.001 >= total) return "paid"
  return "part"
}

export function SalesList({ sales }: { sales: SaleRow[] }) {
  const [pay, setPay] = useState<PayFilter>("all")
  const [when, setWhen] = useState<WhenFilter>("all")

  const filtered = useMemo(
    () =>
      sales.filter((sale) => {
        if (pay !== "all" && payKey(sale) !== pay) return false
        return matchesWhenFilter(sale.saleDate, when)
      }),
    [sales, pay, when]
  )

  const counts = useMemo(() => {
    const base = when === "all" ? sales : sales.filter((sale) => matchesWhenFilter(sale.saleDate, when))
    return {
      all: base.length,
      paid: base.filter((sale) => payKey(sale) === "paid").length,
      part: base.filter((sale) => payKey(sale) === "part").length,
      unpaid: base.filter((sale) => payKey(sale) === "unpaid").length,
    }
  }, [sales, when])

  const pager = usePagedRows(filtered, `${pay}|${when}`)

  return (
    <div className="space-y-4">
      <div className="surface-card space-y-4 p-4">
        <FilterChips
          label="Money on the bill"
          activeKey={pay}
          onSelect={(key) => setPay(key as PayFilter)}
          chips={[
            { key: "all", label: "All sales", count: counts.all },
            { key: "paid", label: "Paid up", count: counts.paid, tone: "success" },
            { key: "part", label: "Part paid", count: counts.part, tone: "warning" },
            { key: "unpaid", label: "Unpaid", count: counts.unpaid, tone: "danger" },
          ]}
        />
        <FilterChips
          label="When it was sold"
          activeKey={when}
          onSelect={(key) => setWhen(key as WhenFilter)}
          chips={[
            { key: "all", label: "Any day" },
            { key: "today", label: "Today", tone: "primary" },
            { key: "week", label: "Last 7 days" },
            { key: "month", label: "Last 30 days" },
          ]}
        />
      </div>

      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Total / Paid</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageRows.map((sale) => (
              <tr key={sale.id} className="border-b border-border/70">
                <td className="px-4 py-3">
                  <Link href={`/sales/${sale.id}`} className="font-medium text-primary">
                    {sale.invoiceNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {sale.customer ? (
                    sale.customer.name
                  ) : (
                    <span>
                      Walk-in
                      <span className="block text-xs text-warning">
                        This one needs a buyer name before anybody can return it
                      </span>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{sale.branch.code}</td>
                <td className="px-4 py-3">
                  {formatCurrency(money(sale.totalAmount))} / {formatCurrency(money(sale.paidAmount))}
                </td>
                <td className="px-4 py-3">{statusLabel(sale.paymentMethod)}</td>
                <td className="px-4 py-3">
                  <StatusBadge value={sale.status} />
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium tabular-nums">{formatShopWhen(sale.saleDate)}</p>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-sm text-muted-foreground" colSpan={7}>
                  {sales.length === 0
                    ? "No sales on the books yet."
                    : "No sale matches this filter. Tap another chip above."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <TablePager
          page={pager.page}
          pageCount={pager.pageCount}
          pageSize={pager.pageSize}
          total={pager.total}
          start={pager.start}
          end={pager.end}
          onPageChange={pager.setPage}
          onPageSizeChange={pager.setPageSize}
          noun="sales"
        />
      </div>
    </div>
  )
}
