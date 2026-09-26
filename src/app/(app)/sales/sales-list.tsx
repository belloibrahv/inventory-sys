"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ExternalLink, FileSpreadsheet } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/data-table"
import { DayRangeFilter } from "@/components/day-range-filter"
import { FilterChips } from "@/components/filter-chips"
import { StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { downloadTable } from "@/lib/download-table"
import { formatShopWhen, matchesDayRange } from "@/lib/lagos-day"
import { statusLabel } from "@/lib/status"
import { cn, formatCurrency, formatCurrencyShort } from "@/lib/utils"

export type SaleRow = {
  id: string
  invoiceNumber: string
  saleDate: string
  totalAmount: number
  paidAmount: number
  discount: number
  paymentMethod: string
  status: string
  isWholesale: boolean
  customer: { name: string; phone: string | null } | null
  branch: { code: string; name: string }
  soldBy: string | null
  items: Array<{ id: string; name: string; imei: string | null; quantity: number; unitPrice: number; totalPrice: number }>
}

type PayFilter = "all" | "paid" | "part" | "unpaid"

function payKey(sale: SaleRow): Exclude<PayFilter, "all"> {
  if (sale.paidAmount <= 0) return "unpaid"
  if (sale.paidAmount + 0.001 >= sale.totalAmount) return "paid"
  return "part"
}

/** Paid minus sales. Zero when settled. Negative when the buyer still owes. */
function saleBalance(sale: SaleRow) {
  return sale.paidAmount - sale.totalAmount
}

function balanceTone(balance: number) {
  return balance < -0.005 ? "text-danger" : balance > 0.005 ? "text-success" : "text-muted-foreground"
}

function searchText(sale: SaleRow) {
  return [
    sale.invoiceNumber,
    sale.customer?.name,
    sale.customer?.phone,
    sale.branch.name,
    sale.branch.code,
    sale.soldBy,
    ...sale.items.flatMap((item) => [item.name, item.imei]),
  ]
    .filter(Boolean)
    .join(" ")
}

function exportRows(rows: SaleRow[]) {
  return [
    ["Invoice", "Date", "Shop", "Buyer", "Sold by", "Items", "Sales", "Paid", "Balance", "Payment", "Status"],
    ...rows.map((sale) => [
      sale.invoiceNumber,
      formatShopWhen(sale.saleDate),
      sale.branch.name,
      sale.customer?.name ?? "Walk-in",
      sale.soldBy ?? "",
      sale.items.map((item) => `${item.quantity} × ${item.name}${item.imei ? ` (${item.imei})` : ""}`).join("; "),
      sale.totalAmount,
      sale.paidAmount,
      saleBalance(sale),
      statusLabel(sale.paymentMethod),
      statusLabel(sale.status),
    ]),
  ]
}

export function SalesList({ sales }: { sales: SaleRow[] }) {
  const router = useRouter()
  const [pay, setPay] = useState<PayFilter>("all")
  const [range, setRange] = useState({ from: "", to: "" })
  const [open, setOpen] = useState<SaleRow | null>(null)
  const [query, setQuery] = useState("")

  const inRange = useMemo(
    () => sales.filter((sale) => matchesDayRange(sale.saleDate, range.from, range.to)),
    [sales, range]
  )
  const filtered = useMemo(
    () => (pay === "all" ? inRange : inRange.filter((sale) => payKey(sale) === pay)),
    [inRange, pay]
  )
  // The figures and the totals row follow the search box too, not only the chips.
  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return filtered
    return filtered.filter((sale) => {
      const hay = searchText(sale).toLowerCase()
      return words.every((word) => hay.includes(word))
    })
  }, [filtered, query])
  const counts = useMemo(
    () => ({
      all: inRange.length,
      paid: inRange.filter((sale) => payKey(sale) === "paid").length,
      part: inRange.filter((sale) => payKey(sale) === "part").length,
      unpaid: inRange.filter((sale) => payKey(sale) === "unpaid").length,
    }),
    [inRange]
  )
  const totals = useMemo(
    () =>
      visible.reduce(
        (acc, sale) => {
          acc.sales += sale.totalAmount
          acc.paid += sale.paidAmount
          acc.balance += saleBalance(sale)
          return acc
        },
        { sales: 0, paid: 0, balance: 0 }
      ),
    [visible]
  )

  const columns: DataColumn<SaleRow>[] = [
    {
      id: "invoice",
      header: "Invoice",
      sortValue: (sale) => sale.invoiceNumber,
      cell: (sale) => (
        <div className="flex items-center gap-2">
          <Link href={`/sales/${sale.id}`} className="whitespace-nowrap font-medium text-primary hover:underline">
            {sale.invoiceNumber}
          </Link>
          {sale.status !== "COMPLETED" ? <StatusBadge value={sale.status} /> : null}
        </div>
      ),
    },
    {
      id: "when",
      header: "When",
      sortValue: (sale) => sale.saleDate,
      cell: (sale) => <span className="whitespace-nowrap tabular-nums">{formatShopWhen(sale.saleDate)}</span>,
    },
    {
      id: "buyer",
      header: "Buyer",
      sortValue: (sale) => sale.customer?.name ?? "",
      cell: (sale) =>
        sale.customer ? (
          <span className="whitespace-nowrap font-medium">{sale.customer.name}</span>
        ) : (
          <span className="whitespace-nowrap text-muted-foreground">
            Walk-in <span className="ml-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">no name</span>
          </span>
        ),
    },
    {
      id: "shop",
      header: "Shop",
      hideBelow: "lg",
      sortValue: (sale) => sale.branch.name,
      cell: (sale) => (
        <span className="whitespace-nowrap" title={sale.branch.name}>
          {sale.branch.name}
        </span>
      ),
    },
    {
      id: "sales",
      header: "Sales",
      align: "right",
      sortValue: (sale) => sale.totalAmount,
      cell: (sale) => <span className="font-medium">{formatCurrency(sale.totalAmount)}</span>,
    },
    {
      id: "paid",
      header: "Paid",
      align: "right",
      hideBelow: "xl",
      sortValue: (sale) => sale.paidAmount,
      cell: (sale) => formatCurrency(sale.paidAmount),
    },
    {
      id: "balance",
      header: "Balance",
      align: "right",
      sortValue: (sale) => saleBalance(sale),
      cell: (sale) => {
        const balance = saleBalance(sale)
        return <span className={cn("font-semibold", balanceTone(balance))}>{formatCurrency(balance)}</span>
      },
    },
    {
      id: "method",
      header: "Payment",
      hideBelow: "lg",
      sortValue: (sale) => statusLabel(sale.paymentMethod),
      cell: (sale) => <span className="whitespace-nowrap">{statusLabel(sale.paymentMethod)}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Figure label="Sales value" value={totals.sales} hint={`${visible.length} sale${visible.length === 1 ? "" : "s"}`} />
        <Figure label="Received" value={totals.paid} hint="Money already taken" />
        <Figure
          label="Balance"
          value={totals.balance}
          hint={totals.balance < -0.005 ? "Buyers still owe" : "Nothing owed"}
          tone={balanceTone(totals.balance)}
        />
      </div>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(sale) => sale.id}
        noun="sales"
        filterKey={`${pay}|${range.from}|${range.to}`}
        initialSort={{ id: "when", dir: "desc" }}
        onRowClick={setOpen}
        searchText={searchText}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search invoice, buyer, phone, IMEI or item"
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10"
            onClick={() => downloadTable(exportRows(visible), "sales.xlsx", "xlsx")}
            aria-label="Download these sales as Excel"
          >
            <FileSpreadsheet className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Excel</span>
          </Button>
        }
        filters={
          <div className="grid gap-3 lg:grid-cols-2">
            <FilterChips
              label="Money on the bill"
              activeKey={pay}
              onSelect={(key) => setPay(key as PayFilter)}
              chips={[
                { key: "all", label: "All", count: counts.all },
                { key: "paid", label: "Paid up", count: counts.paid, tone: "success" },
                { key: "part", label: "Part paid", count: counts.part, tone: "warning" },
                { key: "unpaid", label: "Unpaid", count: counts.unpaid, tone: "danger" },
              ]}
            />
            <DayRangeFilter label="When it was sold" from={range.from} to={range.to} onChange={setRange} />
          </div>
        }
        card={(sale) => {
          const balance = saleBalance(sale)
          return {
            title: sale.customer?.name ?? "Walk-in",
            subtitle: `${sale.invoiceNumber} · ${formatShopWhen(sale.saleDate)}`,
            value: formatCurrency(sale.totalAmount),
            valueHint:
              balance < -0.005 ? <span className="text-danger">Owes {formatCurrency(-balance)}</span> : <span className="text-success">Paid</span>,
            meta: (
              <>
                <span>{sale.branch.name}</span>
                <span>· {statusLabel(sale.paymentMethod)}</span>
                <span>· {sale.items.length} item{sale.items.length === 1 ? "" : "s"}</span>
              </>
            ),
          }
        }}
        bulkActions={(picked) => (
          <button
            type="button"
            className="rounded-md bg-background/15 px-2.5 py-1 font-medium hover:bg-background/25"
            onClick={() => downloadTable(exportRows(picked), "sales-ticked.xlsx", "xlsx")}
          >
            Excel of ticked
          </button>
        )}
        footer={(rows) => (
          <tr>
            <td />
            <td colSpan={3} className="text-sm">Totals for {rows.length} sale{rows.length === 1 ? "" : "s"}</td>
            <td className="hidden lg:table-cell" />
            <td className="whitespace-nowrap text-right tabular-nums">{formatCurrency(totals.sales)}</td>
            <td className="hidden whitespace-nowrap text-right tabular-nums xl:table-cell">{formatCurrency(totals.paid)}</td>
            <td className={cn("whitespace-nowrap text-right tabular-nums", balanceTone(totals.balance))}>{formatCurrency(totals.balance)}</td>
            <td className="hidden lg:table-cell" />
          </tr>
        )}
        empty={sales.length === 0 ? "No sales on the books yet." : "No sale matches these filters."}
      />

      <Sheet open={Boolean(open)} onOpenChange={(value) => !value && setOpen(null)}>
        {open ? (
          <SheetContent
            title={open.invoiceNumber}
            description={`${formatShopWhen(open.saleDate)} · ${open.branch.name}${open.soldBy ? ` · sold by ${open.soldBy}` : ""}`}
            footer={
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => router.push(`/sales/${open.id}`)}>
                  <ExternalLink className="mr-1.5 h-4 w-4" /> Open invoice
                </Button>
                <Button variant="outline" onClick={() => router.push(`/sales/${open.id}?receipt=1`)}>
                  Print receipt
                </Button>
              </div>
            }
          >
            <SaleQuickLook sale={open} />
          </SheetContent>
        ) : null}
      </Sheet>
    </div>
  )
}

function Figure({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: string }) {
  return (
    <div className="surface-card min-w-0 p-3 sm:p-4" title={formatCurrency(value)}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">{label}</p>
      <p className={cn("mt-1 truncate text-base font-semibold tabular-nums sm:text-2xl", tone)}>
        <span className="sm:hidden">{formatCurrencyShort(value)}</span>
        <span className="hidden sm:inline">{formatCurrency(value)}</span>
      </p>
      <p className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">{hint}</p>
    </div>
  )
}

function SaleQuickLook({ sale }: { sale: SaleRow }) {
  const balance = saleBalance(sale)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sales</p>
          <p className="font-semibold tabular-nums">{formatCurrency(sale.totalAmount)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Paid</p>
          <p className="font-semibold tabular-nums">{formatCurrency(sale.paidAmount)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Balance</p>
          <p className={cn("font-semibold tabular-nums", balanceTone(balance))}>{formatCurrency(balance)}</p>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Buyer</dt>
        <dd className="font-medium">
          {sale.customer ? `${sale.customer.name}${sale.customer.phone ? ` · ${sale.customer.phone}` : ""}` : "Walk-in"}
        </dd>
        <dt className="text-muted-foreground">Payment</dt>
        <dd>{statusLabel(sale.paymentMethod)}{sale.isWholesale ? " · reseller" : ""}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd><StatusBadge value={sale.status} /></dd>
        {sale.discount > 0 ? (
          <>
            <dt className="text-muted-foreground">Discount</dt>
            <dd className="tabular-nums">{formatCurrency(sale.discount)}</dd>
          </>
        ) : null}
      </dl>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {sale.items.length} item{sale.items.length === 1 ? "" : "s"}
        </p>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {sale.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.imei ? <span className="font-mono">{item.imei}</span> : `${item.quantity} × ${formatCurrency(item.unitPrice)}`}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(item.totalPrice)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
