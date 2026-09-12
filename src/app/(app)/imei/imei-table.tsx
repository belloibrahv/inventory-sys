"use client"

import Link from "next/link"
import { StatusBadge } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { formatShopWhen } from "@/lib/lagos-day"
import { warrantyState } from "@/lib/warranty"

type ImeiRow = {
  id: string
  imei1: string
  serialNumber: string | null
  status: string
  createdAt: Date
  updatedAt: Date
  product: { name: string; warrantyDays: number }
  branch: { code: string }
  customer: { name: string } | null
  supplier: { name: string } | null
  sale: { saleDate: Date } | null
}

export function ImeiTable({
  records,
  resetKey,
}: {
  records: ImeiRow[]
  resetKey: string
}) {
  const pager = usePagedRows(records, resetKey)

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3">IMEI</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Shop</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last change</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageRows.map((row) => (
              <tr key={row.id} className="border-b border-border/70">
                <td className="px-4 py-3">
                  <Link href={`/imei/${row.id}`} className="font-medium text-primary">
                    {row.imei1}
                  </Link>
                  {row.serialNumber ? <p className="text-xs text-muted-foreground">{row.serialNumber}</p> : null}
                </td>
                <td className="px-4 py-3">{row.product.name}</td>
                <td className="px-4 py-3">{row.branch.code}</td>
                <td className="px-4 py-3">{row.customer?.name ?? row.supplier?.name ?? "Vault"}</td>
                <td className="px-4 py-3">
                  <StatusBadge value={row.status} />
                  {row.status === "SOLD" && row.sale ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sold {formatShopWhen(row.sale.saleDate)} · {warrantyState(row.sale.saleDate, row.product.warrantyDays).label}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium tabular-nums">{formatShopWhen(row.updatedAt)}</p>
                  <p className="text-xs text-muted-foreground">First booked {formatShopWhen(row.createdAt)}</p>
                </td>
              </tr>
            ))}
            {records.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-sm text-muted-foreground" colSpan={6}>
                  No phone matches this filter. Tap another stage above, or clear the search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePager
        page={pager.page}
        pageCount={pager.pageCount}
        pageSize={pager.pageSize}
        total={pager.total}
        start={pager.start}
        end={pager.end}
        onPageChange={pager.setPage}
        onPageSizeChange={pager.setPageSize}
        noun="phone numbers"
      />
    </>
  )
}
