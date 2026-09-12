"use client"

import Link from "next/link"
import { TableEmpty, TableShell, TonePill } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { formatCurrency, money } from "@/lib/utils"

type SupplierRow = {
  id: string
  name: string
  kind: string
  phone: string
  city: string | null
  country: string | null
  purchases: Array<{ totalAmount: unknown; paidAmount: unknown }>
}

export function SuppliersList({ suppliers }: { suppliers: SupplierRow[] }) {
  const pager = usePagedRows(suppliers, suppliers.length)

  return (
    <TableShell
      columns={[
        { label: "Supplier" },
        { label: "From" },
        { label: "Bought from them", align: "right" },
        { label: "We have paid", align: "right" },
        { label: "Still owed", align: "right" },
        { label: "", align: "center" },
      ]}
      footer={
        <TablePager
          page={pager.page}
          pageCount={pager.pageCount}
          pageSize={pager.pageSize}
          total={pager.total}
          start={pager.start}
          end={pager.end}
          onPageChange={pager.setPage}
          onPageSizeChange={pager.setPageSize}
          noun="suppliers"
        />
      }
    >
      {pager.pageRows.map((supplier) => {
        const purchased = supplier.purchases.reduce((sum, row) => sum + money(row.totalAmount), 0)
        const paid = supplier.purchases.reduce((sum, row) => sum + money(row.paidAmount), 0)
        const owed = Math.max(0, purchased - paid)

        return (
          <tr key={supplier.id}>
            <td>
              <Link href={`/suppliers/${supplier.id}`} className="font-medium text-primary hover:underline">
                {supplier.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                {supplier.kind === "NEIGHBOR" ? "Neighbouring shop" : "Carton supplier"} · {supplier.phone}
              </p>
            </td>
            <td className="text-xs text-muted-foreground">
              {[supplier.city, supplier.country].filter(Boolean).join(", ") || "Not recorded"}
            </td>
            <td className="text-right num font-medium">{formatCurrency(purchased)}</td>
            {/*
              The client's point: "this is only showing me the amount of stock
              that I purchased from a particular vendor, and if I am owing or
              not owing. This is not showing me how much I have paid."
            */}
            <td className="text-right num text-success">{formatCurrency(paid)}</td>
            <td className="text-right num font-semibold">{formatCurrency(owed)}</td>
            <td className="text-center">
              {owed === 0 ? <TonePill tone="success">Settled</TonePill> : <TonePill tone="warning">Owing</TonePill>}
            </td>
          </tr>
        )
      })}
      {suppliers.length === 0 ? (
        <TableEmpty colSpan={6}>No suppliers on the books yet. Add one on the right.</TableEmpty>
      ) : null}
    </TableShell>
  )
}
