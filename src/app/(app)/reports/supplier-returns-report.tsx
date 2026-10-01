"use client"

import { useMemo } from "react"
import { Undo2 } from "lucide-react"
import type { SupplierReturnRow } from "@/app/actions/supplier-returns"
import { EmptyNote, ShopTag, StatCard, StatGrid, TableShell, TonePill } from "@/components/shared"
import { TableDownload } from "@/components/table-download"
import { formatShopWhen } from "@/lib/lagos-day"
import { formatCurrency } from "@/lib/utils"

/**
 * Returns to suppliers (returns outward) for the report period: what went
 * back, how many, to which supplier, from which shop, and the value, so
 * managers can follow up with each supplier.
 */
export function SupplierReturnsReport({ rows, periodLabel }: { rows: SupplierReturnRow[]; periodLabel: string }) {
  const bySupplier = useMemo(() => {
    const map = new Map<string, { supplier: string; units: number; value: number; sendBacks: Set<string>; shops: Set<string> }>()
    for (const row of rows) {
      const entry = map.get(row.supplier) ?? { supplier: row.supplier, units: 0, value: 0, sendBacks: new Set(), shops: new Set() }
      entry.units += 1
      entry.value += row.value
      entry.sendBacks.add(row.reference)
      entry.shops.add(row.shopCode)
      map.set(row.supplier, entry)
    }
    return [...map.values()].sort((a, b) => b.value - a.value)
  }, [rows])
  const totalValue = rows.reduce((sum, row) => sum + row.value, 0)
  const sendBacks = new Set(rows.map((row) => row.reference)).size

  return (
    <section className="space-y-4" aria-labelledby="supplier-returns-title">
      <div>
        <h2 id="supplier-returns-title" className="text-lg font-semibold tracking-tight">
          Returns to suppliers
        </h2>
        <p className="text-sm text-muted-foreground">Goods sent back to suppliers for {periodLabel}.</p>
      </div>

      <StatGrid className="xl:grid-cols-3">
        <StatCard lead label="Value sent back" value={formatCurrency(totalValue)} hint={`${rows.length} unit${rows.length === 1 ? "" : "s"}`} />
        <StatCard label="Send-backs" value={String(sendBacks)} hint="Separate trips back to a supplier" />
        <StatCard label="Suppliers" value={String(bySupplier.length)} hint="Received goods back from us" />
      </StatGrid>

      {rows.length === 0 ? (
        <div className="surface-card">
          <EmptyNote icon={Undo2} title="Nothing was sent back to a supplier in this period." hint="Sent-back phones appear here from Goods from supplier, Send back to supplier, and from returns sent on to the supplier." />
        </div>
      ) : (
        <>
          <TableShell
            caption={
              <>
                <h3 className="text-sm font-semibold tracking-tight">By supplier</h3>
                <TableDownload
                  filename={`returns-to-suppliers-by-supplier`}
                  rows={() => [
                    ["Supplier", "Send-backs", "Units", "Value", "Shops"],
                    ...bySupplier.map((row) => [row.supplier, row.sendBacks.size, row.units, row.value, [...row.shops].join(" ")]),
                    [],
                    ["Total", sendBacks, rows.length, totalValue, ""],
                  ]}
                />
              </>
            }
            columns={[
              { label: "Supplier" },
              { label: "Send-backs", align: "right" },
              { label: "Units", align: "right" },
              { label: "Value", align: "right" },
              { label: "Shops", className: "hidden sm:table-cell" },
            ]}
          >
            {bySupplier.map((row) => (
              <tr key={row.supplier}>
                <td className="font-medium">{row.supplier}</td>
                <td className="text-right num">{row.sendBacks.size}</td>
                <td className="text-right num">{row.units}</td>
                <td className="text-right num font-semibold">{formatCurrency(row.value)}</td>
                <td className="hidden sm:table-cell">
                  <span className="flex flex-wrap gap-1">
                    {[...row.shops].map((code) => (
                      <ShopTag key={code}>{code}</ShopTag>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
            <tr className="bg-muted/40 font-semibold">
              <td>Total</td>
              <td className="text-right num">{sendBacks}</td>
              <td className="text-right num">{rows.length}</td>
              <td className="text-right num">{formatCurrency(totalValue)}</td>
              <td className="hidden sm:table-cell" />
            </tr>
          </TableShell>

          <TableShell
            caption={
              <>
                <h3 className="text-sm font-semibold tracking-tight">Every unit sent back</h3>
                <TableDownload
                  filename={`returns-to-suppliers`}
                  rows={() => [
                    ["Date", "Send-back", "Supplier", "Shop", "Item", "IMEI / serial", "Supplier bill", "Value", "Money", "Came from", "By"],
                    ...rows.map((row) => [
                      formatShopWhen(row.sentAt),
                      row.reference,
                      row.supplier,
                      row.shop,
                      row.item,
                      row.imei,
                      row.bill ?? "",
                      row.value,
                      row.effect,
                      row.source === "CUSTOMER_RETURN" ? "A customer return" : "Send back to supplier",
                      row.by,
                    ]),
                  ]}
                />
              </>
            }
            columns={[
              { label: "Date" },
              { label: "Send-back" },
              { label: "Supplier" },
              { label: "Item" },
              { label: "Shop", className: "hidden md:table-cell" },
              { label: "Supplier bill", className: "hidden lg:table-cell" },
              { label: "Value", align: "right" },
              { label: "Money", className: "hidden lg:table-cell" },
            ]}
          >
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap">{formatShopWhen(row.sentAt)}</td>
                <td className="whitespace-nowrap">
                  <span className="font-mono text-xs">{row.reference}</span>
                  {row.source === "CUSTOMER_RETURN" ? (
                    <span className="mt-0.5 block">
                      <TonePill tone="info">From a customer return</TonePill>
                    </span>
                  ) : null}
                </td>
                <td className="font-medium">{row.supplier}</td>
                <td className="min-w-40">
                  <p>{row.item}</p>
                  <p className="font-mono text-xs text-muted-foreground">{row.imei}</p>
                </td>
                <td className="hidden md:table-cell">
                  <ShopTag>{row.shopCode}</ShopTag>
                </td>
                <td className="hidden lg:table-cell font-mono text-xs">{row.bill ?? "—"}</td>
                <td className="text-right num font-semibold">{formatCurrency(row.value)}</td>
                <td className="hidden lg:table-cell text-xs text-muted-foreground">{row.effect}</td>
              </tr>
            ))}
          </TableShell>
        </>
      )}
    </section>
  )
}
