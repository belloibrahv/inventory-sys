"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Banknote, ChevronDown, Lock, Package, PackagePlus, TrendingDown, TrendingUp } from "lucide-react"
import type { OpeningReport } from "@/app/actions/opening-stock"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { ReportsStatement } from "@/components/reports-statement"
import { ReportsPdfButton } from "@/components/reports-pdf-button"
import { PrintButton } from "@/components/print-button"
import { ExportCsv } from "@/components/export-csv"
import { DrilldownModal } from "@/components/drilldown-modal"
import { TableDownload } from "@/components/table-download"
import {
  ShopTag,
  StatCard,
  StatGrid,
  TableEmpty,
  TableShell,
  TonePill,
  Toolbar,
} from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import type { ReportsPack } from "@/lib/reports-pack"
import { formatWatLong } from "@/lib/lagos-day"
import { groupOwedHouses, type OwedHouse } from "@/lib/purchase-money"

type RawSale = {
  id: string
  invoiceNumber: string
  totalAmount: unknown
  paidAmount: unknown
  saleDate: Date
  customer: { name: string } | null
  branch: { name: string; code: string }
}

type RawExpense = {
  id: string
  expenseNumber: string
  category: string
  amount: unknown
  description: string
  date: Date
  branch: { name: string; code: string }
}

type RawInventory = {
  id: string
  quantity: number
  product: { name: string; costPrice: unknown; sellingPrice: unknown }
  branch: { name: string; code: string }
}

type RawSwap = {
  id: string
  swapNumber: string
  tradeValue: unknown
  balanceAmount: unknown
  newProductPrice: unknown
  createdAt: Date
  customer: { name: string } | null
  newProduct: { name: string } | null
  branch: { name: string; code: string }
}

type RawReturn = {
  id: string
  returnNumber: string
  reason: string
  outcome: string
  faultClass: string
  status: string
  refundAmount: unknown
  createdAt: Date
  customer: { name: string } | null
  branch: { name: string; code: string }
  imei?: { imei1: string; product: { name: string } } | null
}

type BranchOption = { id: string; name: string; code: string }

type Drilldown =
  | "REVENUE"
  | "RECEIVED"
  | "EXPENSES"
  | "STOCK"
  | "OPENING"
  | "BOUGHT"
  | "DEBTORS"
  | "CREDITORS"
  | "SWAPS"
  | "RETURNS"

const DRILLDOWN_TITLE: Record<Drilldown, string> = {
  REVENUE: "Sales",
  RECEIVED: "Payments received",
  EXPENSES: "Shop expenses",
  STOCK: "Shop stock value",
  OPENING: "Opening stock value",
  BOUGHT: "Goods from supplier",
  DEBTORS: "Customers who still owe us",
  CREDITORS: "Still owed to suppliers",
  SWAPS: "Swap Deal records",
  RETURNS: "Returns",
}

const day = (value: Date | string) => new Date(value).toISOString().slice(0, 10)

export function ReportsClientView({
  pack,
  sales,
  expenses,
  inventory,
  swaps = [],
  returns = [],
  opening,
  branches,
  selectedBranchId,
  range = "month",
  date,
}: {
  pack: ReportsPack
  sales: RawSale[]
  expenses: RawExpense[]
  inventory: RawInventory[]
  swaps?: RawSwap[]
  returns?: RawReturn[]
  opening: OpeningReport
  branches: BranchOption[]
  selectedBranchId?: string
  range?: "day" | "week" | "month"
  date: string
}) {
  const router = useRouter()
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null)
  const [openHouse, setOpenHouse] = useState<string | null>(null)
  const paidSales = sales.filter((sale) => money(sale.paidAmount) > 0)
  const supplierOwed = pack.creditors.reduce((sum, row) => sum + row.owed, 0)
  const owedHouses = useMemo(() => groupOwedHouses(pack.creditors), [pack.creditors])
  const scopeKey = `${selectedBranchId ?? "all"}:${range}:${date}`
  function reportsHref(next: { branchId?: string; range?: string; date?: string }) {
    const params = new URLSearchParams()
    const shop = next.branchId !== undefined ? next.branchId : selectedBranchId
    if (shop) params.set("branchId", shop)
    params.set("range", next.range ?? range)
    params.set("date", next.date ?? date)
    return `/reports?${params.toString()}`
  }
  const movement = (now: number, then: number) => {
    const change = now - then
    if (then === 0) return change === 0 ? "Same as last period" : "No last-period figure to compare"
    const percent = Math.round((change / then) * 100)
    if (change === 0) return "Same as last period"
    return `${change > 0 ? "Up" : "Down"} ${formatCurrency(Math.abs(change))} (${Math.abs(percent)} percent)`
  }
  const openingValue = opening.shops.reduce((sum, row) => sum + row.value, 0)
  const boughtValue = opening.boughtSince.reduce((sum, row) => sum + row.total, 0)
  const stillOpen = opening.shops.filter((row) => row.status === "OPEN")
  const fileScope = `${pack.statementRef}`

  const byShopPager = usePagedRows(pack.byShop, scopeKey)
  const debtorsPager = usePagedRows(pack.debtors, scopeKey)
  const creditorsPager = usePagedRows(owedHouses, scopeKey)
  const lowStockPager = usePagedRows(pack.lowStock, scopeKey)
  const revenuePager = usePagedRows(sales, drilldown === "REVENUE" ? "REVENUE" : "idle")
  const receivedPager = usePagedRows(paidSales, drilldown === "RECEIVED" ? "RECEIVED" : "idle")
  const expensesPager = usePagedRows(expenses, drilldown === "EXPENSES" ? "EXPENSES" : "idle")
  const stockPager = usePagedRows(inventory, drilldown === "STOCK" ? "STOCK" : "idle")
  const openingPager = usePagedRows(opening.lines, drilldown === "OPENING" ? "OPENING" : "idle")
  const boughtPager = usePagedRows(opening.boughtSince, drilldown === "BOUGHT" ? "BOUGHT" : "idle")
  const debtorsDrillPager = usePagedRows(pack.debtors, drilldown === "DEBTORS" ? "DEBTORS" : "idle")
  const creditorsDrillPager = usePagedRows(owedHouses, drilldown === "CREDITORS" ? "CREDITORS" : "idle")
  const swapsPager = usePagedRows(swaps, drilldown === "SWAPS" ? "SWAPS" : "idle")
  const returnsPager = usePagedRows(returns, drilldown === "RETURNS" ? "RETURNS" : "idle")

  /*
    "As much as it is clickable, let it be downloadable also ... the details
    thereat should be downloadable or exportable to an Excel file." Each figure's
    rows, every one of them, not only the page on screen.
  */
  const drillRows: Record<Drilldown, () => Array<Array<string | number>>> = {
    REVENUE: () => [
      ["Invoice", "Customer", "Shop", "Date", "Invoice total", "Paid", "Still owed"],
      ...sales.map((sale) => [
        sale.invoiceNumber,
        sale.customer?.name ?? "Walk-in",
        sale.branch.code,
        day(sale.saleDate),
        money(sale.totalAmount),
        money(sale.paidAmount),
        money(sale.totalAmount) - money(sale.paidAmount),
      ]),
      [],
      ["Total", "", "", "", pack.totals.revenue],
    ],
    RECEIVED: () => [
      ["Invoice", "Customer", "Shop", "Date", "Amount received"],
      ...paidSales.map((sale) => [
        sale.invoiceNumber,
        sale.customer?.name ?? "Walk-in",
        sale.branch.code,
        day(sale.saleDate),
        money(sale.paidAmount),
      ]),
      [],
      ["Total", "", "", "", pack.totals.collected],
    ],
    EXPENSES: () => [
      ["Voucher", "Category", "What it was for", "Shop", "Date", "Amount"],
      ...expenses.map((expense) => [
        expense.expenseNumber,
        expense.category.replace(/_/g, " ").toLowerCase(),
        expense.description,
        expense.branch.code,
        day(expense.date),
        money(expense.amount),
      ]),
      [],
      ["Total", "", "", "", "", pack.totals.expenses],
    ],
    STOCK: () => [
      ["Item", "Shop", "Quantity", "Cost price", "Selling price", "Value at cost"],
      ...inventory.map((row) => [
        row.product.name,
        row.branch.code,
        row.quantity,
        money(row.product.costPrice),
        money(row.product.sellingPrice),
        row.quantity * money(row.product.costPrice),
      ]),
      [],
      ["Total", "", "", "", "", pack.totals.stock],
    ],
    OPENING: () => [
      [
        "Shop",
        "Opening stock",
        "Item code",
        "Item",
        "Brand",
        "Category",
        "Tracking",
        "Quantity",
        "Unit cost",
        "Lowest selling price",
        "Standard selling price",
        "Value at cost",
        "IMEIs / serials",
      ],
      ...opening.lines.map((line) => [
        line.shop,
        line.status === "CLOSED" ? "Closed" : "Open",
        line.sku,
        line.name,
        line.brand,
        line.category,
        line.tracking === "NONE" ? "Pieces" : line.tracking,
        line.openingQty,
        line.costPrice,
        line.minimumPrice,
        line.sellingPrice,
        line.openingQty * line.costPrice,
        line.identities.join(", "),
      ]),
      [],
      ["Total", "", "", "", "", "", "", "", "", "", "", openingValue],
    ],
    BOUGHT: () => [
      ["Bill", "Supplier", "Shop", "Date", "Bill value", "Paid", "Still owed"],
      ...opening.boughtSince.map((bill) => [bill.invoiceNumber, bill.supplier, bill.shop, day(bill.date), bill.total, bill.paid, bill.owed]),
      [],
      ["Total", "", "", "", boughtValue],
    ],
    DEBTORS: () => [
      ["Customer", "Shop", "Amount Owed (NGN)"],
      ...pack.debtors.map((row) => [row.name, row.shop, row.amount]),
      [],
      ["Total Receivables", "", pack.totals.owing],
    ],
    CREDITORS: () => [
      ["Bill / Invoice", "Supplier", "Shop", "Amount Owed (NGN)"],
      ...pack.creditors.map((row) => [row.invoice, row.supplier, row.shop, row.owed]),
      [],
      ["Total Payables", "", "", supplierOwed],
    ],
    SWAPS: () => [
      ["Swap Number", "Customer", "Shop", "Item Swapped For", "Swap Deal Value", "Balance Paid", "Date"],
      ...swaps.map((row) => [
        row.swapNumber,
        row.customer?.name ?? "Customer",
        row.branch.code,
        row.newProduct?.name ?? "Phone",
        money(row.tradeValue),
        money(row.balanceAmount),
        day(row.createdAt),
      ]),
      [],
      ["Total Swap Balance", "", "", "", "", pack.totals.swaps],
    ],
    RETURNS: () => [
      ["Return Number", "Customer", "Shop", "Item / IMEI", "Reason", "Outcome", "Status", "Refund Amount", "Date"],
      ...returns.map((row) => [
        row.returnNumber,
        row.customer?.name ?? "Customer",
        row.branch.code,
        row.imei ? `${row.imei.product.name} (${row.imei.imei1})` : "Item",
        row.reason.replace(/_/g, " "),
        row.outcome.replace(/_/g, " "),
        row.status,
        money(row.refundAmount),
        day(row.createdAt),
      ]),
      [],
      ["Total Returns Count", "", "", "", "", "", "", returns.length],
    ],
  }

  return (
    <div className="space-y-5">
      <div className="reports-chrome space-y-5 print:hidden">
        {/*
          The client asked not to have every branch summed into one figure with no
          way back out: "there's a higher tendency we are using Paul to rob
          Barnabas". One shop at a time is a first-class choice here, and All is
          something you pick rather than something you are given.
        */}
        <Toolbar className="justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="eyebrow">Reporting on</span>
              <Select
                value={selectedBranchId ?? ""}
                onChange={(event) => {
                  router.push(reportsHref({ branchId: event.target.value }))
                }}
                className="h-9 w-56"
              >
                <option value="">All shops together</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="eyebrow">Period</span>
              <Select
                value={range}
                onChange={(event) => router.push(reportsHref({ range: event.target.value }))}
                className="h-9 w-40"
              >
                <option value="day">One day</option>
                <option value="week">Last 7 days</option>
                <option value="month">This month so far</option>
              </Select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="eyebrow">Ending on</span>
              <input
                type="date"
                value={date}
                onChange={(event) => router.push(reportsHref({ date: event.target.value }))}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <TonePill tone={selectedBranchId ? "primary" : "neutral"}>{pack.scope}</TonePill>
            <TonePill tone="neutral">{pack.periodLabel}</TonePill>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/audit/books">Check the books</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/finance">Money in &amp; out</Link>
            </Button>
            <ReportsPdfButton data={pack} />
            <PrintButton label="Print / Save PDF" />
            <ExportCsv
              filename={`${pack.statementRef}.csv`}
              label="Export sales CSV"
              rows={[
                ["Invoice", "Customer", "Shop", "Total", "Paid", "Still owed", "Date"],
                ...sales.map((sale) => [
                  sale.invoiceNumber,
                  sale.customer?.name ?? "Walk-in",
                  sale.branch.code,
                  String(money(sale.totalAmount)),
                  String(money(sale.paidAmount)),
                  String(money(sale.totalAmount) - money(sale.paidAmount)),
                  new Date(sale.saleDate).toISOString().slice(0, 10),
                ]),
              ]}
            />
          </div>
        </Toolbar>

        <div className="surface-card grid gap-3 p-4 md:grid-cols-3">
          <div>
            <p className="eyebrow">This period</p>
            <p className="mt-1 text-sm font-semibold">{pack.periodLabel}</p>
            <p className="mt-1 text-sm text-muted-foreground">Sales {formatCurrency(pack.totals.revenue)}</p>
          </div>
          <div>
            <p className="eyebrow">Compared with</p>
            <p className="mt-1 text-sm font-semibold">
              {pack.range === "day" ? formatWatLong(pack.compare.from) : `${formatWatLong(pack.compare.from)} to ${formatWatLong(pack.compare.to)}`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Sales {formatCurrency(pack.compare.revenue)}</p>
          </div>
          <div>
            <p className="eyebrow">Movement</p>
            <p className="mt-1 text-sm font-semibold">{movement(pack.totals.revenue, pack.compare.revenue)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Payments received {movement(pack.totals.collected, pack.compare.collected)}. Expenses {movement(pack.totals.expenses, pack.compare.expenses)}.
            </p>
          </div>
        </div>

        {/* Every headline figure opens the rows that add up to it. */}
        {/* Every headline figure opens the rows that add up to it. */}
        <StatGrid>
          <StatCard
            label="Total sales"
            value={formatCurrency(pack.totals.revenue)}
            hint={`${sales.length} transaction${sales.length === 1 ? "" : "s"} in this period`}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="neutral"
            onClick={() => setDrilldown("REVENUE")}
          />
          <StatCard
            label="Total payments received"
            value={formatCurrency(pack.totals.collected)}
            hint="Cash received plus Transfer received plus POS received. Credit still owed is not in this figure."
            icon={<Banknote className="h-4 w-4" />}
            tone="success"
            onClick={() => setDrilldown("RECEIVED")}
          />
          <StatCard
            label="Approved expenses"
            value={formatCurrency(pack.totals.expenses)}
            hint={`${expenses.length} approved expense${expenses.length === 1 ? "" : "s"}`}
            icon={<TrendingDown className="h-4 w-4" />}
            tone="danger"
            onClick={() => setDrilldown("EXPENSES")}
          />
          <StatCard
            label="Inventory valuation (Cost)"
            value={formatCurrency(pack.totals.stock)}
            hint={`${inventory.length} unit${inventory.length === 1 ? "" : "s"} currently in stock`}
            icon={<Package className="h-4 w-4" />}
            tone="warning"
            onClick={() => setDrilldown("STOCK")}
          />
        </StatGrid>

        {/*
          The opening position and what was bought after it, kept apart: "any
          financial reporting, it will guide us right to see the actual, clear
          picture of what we used to open ... then subsequent uploading value".
        */}
        <StatGrid>
          <StatCard
            label="Opening stock"
            value={formatCurrency(openingValue)}
            hint={
              opening.shops.length === 0
                ? "No shop has loaded opening stock yet"
                : stillOpen.length
                  ? `Still being counted: ${stillOpen.map((row) => row.shop).join(", ")}. Not final yet.`
                  : `Closed for ${opening.shops.map((row) => row.shop).join(", ")}`
            }
            icon={<Lock className="h-4 w-4" />}
            tone={stillOpen.length ? "warning" : "success"}
            onClick={() => setDrilldown("OPENING")}
          />
          <StatCard
            label="Procurement after opening stock"
            value={formatCurrency(boughtValue)}
            hint={`${opening.boughtSince.length} supplier bill${opening.boughtSince.length === 1 ? "" : "s"}, excluding opening stock`}
            icon={<PackagePlus className="h-4 w-4" />}
            onClick={() => setDrilldown("BOUGHT")}
          />
          <StatCard
            label="Receivables"
            value={formatCurrency(pack.totals.owing)}
            hint={`${pack.debtors.length} customer${pack.debtors.length === 1 ? "" : "s"} with outstanding balance`}
            onClick={() => setDrilldown("DEBTORS")}
          />
          <StatCard
            label="Suppliers payment (Payables)"
            value={formatCurrency(supplierOwed)}
            hint={`${owedHouses.length} supplier house${owedHouses.length === 1 ? "" : "s"} still owed`}
            onClick={() => setDrilldown("CREDITORS")}
          />
        </StatGrid>

        <StatGrid>
          <StatCard
            label="Swap Deal value"
            value={formatCurrency(pack.totals.swaps)}
            hint="Cash difference collected on Swap Deal sales"
            onClick={() => setDrilldown("SWAPS")}
          />
          <StatCard
            label="Returned products"
            value={String(pack.totals.returns)}
            hint="Products returned within this accounting period"
            onClick={() => setDrilldown("RETURNS")}
          />
        </StatGrid>

        <div className="grid gap-4 xl:grid-cols-2">
          <TableShell
            caption={
              <>
                <h2 className="text-sm font-semibold tracking-tight">Branch Performance Breakdown</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {pack.byShop.length} branch location{pack.byShop.length === 1 ? "" : "s"}
                  </span>
                  <TableDownload
                    filename={`${fileScope}-branch-breakdown`}
                    rows={() => [
                      ["Branch", "Sales Volume", "Total Sales", "Payments Received"],
                      ...pack.byShop.map((row) => [row.name, row.tickets, row.revenue, row.collected]),
                    ]}
                  />
                </div>
              </>
            }
            columns={[
              { label: "Branch" },
              { label: "Sales Volume", align: "right" },
              { label: "Total Sales", align: "right" },
              { label: "Payments Received", align: "right" },
            ]}
            footer={
              <TablePager
                page={byShopPager.page}
                pageCount={byShopPager.pageCount}
                pageSize={byShopPager.pageSize}
                total={byShopPager.total}
                start={byShopPager.start}
                end={byShopPager.end}
                onPageChange={byShopPager.setPage}
                onPageSizeChange={byShopPager.setPageSize}
                noun="shops"
              />
            }
          >
            {byShopPager.pageRows.map((row) => (
              <tr key={row.name}>
                <td className="font-medium">{row.name}</td>
                <td className="text-right num">{row.tickets}</td>
                <td className="text-right num">{formatCurrency(row.revenue)}</td>
                <td className="text-right num font-semibold text-success">{formatCurrency(row.collected)}</td>
              </tr>
            ))}
            {pack.byShop.length === 0 ? (
              <TableEmpty colSpan={4}>This shop made no sale in this time.</TableEmpty>
            ) : null}
          </TableShell>

          <TableShell
            caption={
              <>
                <h2 className="text-sm font-semibold tracking-tight">Customers who still owe us</h2>
                <div className="flex items-center gap-2">
                  <TableDownload
                    filename={`${fileScope}-receivables`}
                    rows={() => [["Customer", "Shop", "Balance Due"], ...pack.debtors.map((row) => [row.name, row.shop, row.amount])]}
                  />
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/customers">All customers</Link>
                  </Button>
                </div>
              </>
            }
            columns={[{ label: "Customer" }, { label: "Shop" }, { label: "Still owed", align: "right" }]}
            footer={
              <TablePager
                page={debtorsPager.page}
                pageCount={debtorsPager.pageCount}
                pageSize={debtorsPager.pageSize}
                total={debtorsPager.total}
                start={debtorsPager.start}
                end={debtorsPager.end}
                onPageChange={debtorsPager.setPage}
                onPageSizeChange={debtorsPager.setPageSize}
                noun="customers"
              />
            }
          >
            {debtorsPager.pageRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/customers/${row.id}`} className="font-medium text-primary hover:underline">
                    {row.name}
                  </Link>
                </td>
                <td>
                  <ShopTag>{row.shop}</ShopTag>
                </td>
                <td className="text-right num font-semibold text-warning">{formatCurrency(row.amount)}</td>
              </tr>
            ))}
            {pack.debtors.length === 0 ? (
              <TableEmpty colSpan={3}>No customer owes anything right now.</TableEmpty>
            ) : null}
          </TableShell>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <TableShell
            caption={
              <>
                <h2 className="text-sm font-semibold tracking-tight">Still owed to suppliers</h2>
                <div className="flex items-center gap-2">
                  <TableDownload
                    filename={`${fileScope}-supplier-bills-unpaid`}
                    rows={() => [
                      ["Bill", "Supplier", "Shop", "Still owed"],
                      ...pack.creditors.map((row) => [row.invoice, row.supplier, row.shop, row.owed]),
                    ]}
                  />
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/suppliers">All suppliers</Link>
                  </Button>
                </div>
              </>
            }
            columns={[{ label: "Supplier" }, { label: "Still owed", align: "right" }]}
            footer={
              <TablePager
                page={creditorsPager.page}
                pageCount={creditorsPager.pageCount}
                pageSize={creditorsPager.pageSize}
                total={creditorsPager.total}
                start={creditorsPager.start}
                end={creditorsPager.end}
                onPageChange={creditorsPager.setPage}
                onPageSizeChange={creditorsPager.setPageSize}
                noun="houses"
              />
            }
          >
            {creditorsPager.pageRows.map((house) => {
              const expanded = openHouse === house.key
              return (
                <OwedHouseRows
                  key={house.key}
                  house={house}
                  expanded={expanded}
                  colSpan={2}
                  onToggle={() => setOpenHouse(expanded ? null : house.key)}
                />
              )
            })}
            {pack.creditors.length === 0 ? (
              <TableEmpty colSpan={2}>We have paid every supplier bill.</TableEmpty>
            ) : null}
          </TableShell>

          <TableShell
            caption={
              <>
                <h2 className="text-sm font-semibold tracking-tight">Running low</h2>
                <div className="flex items-center gap-2">
                  <TableDownload
                    filename={`${fileScope}-running-low`}
                    rows={() => [
                      ["Item", "Shop", "Left", "Minimum"],
                      ...pack.lowStock.map((row) => [row.product, row.shop, row.quantity, row.min]),
                    ]}
                  />
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/inventory">Shop stock</Link>
                  </Button>
                </div>
              </>
            }
            columns={[{ label: "Item" }, { label: "Shop" }, { label: "Left", align: "right" }]}
            footer={
              <TablePager
                page={lowStockPager.page}
                pageCount={lowStockPager.pageCount}
                pageSize={lowStockPager.pageSize}
                total={lowStockPager.total}
                start={lowStockPager.start}
                end={lowStockPager.end}
                onPageChange={lowStockPager.setPage}
                onPageSizeChange={lowStockPager.setPageSize}
                noun="stock lines"
              />
            }
          >
            {lowStockPager.pageRows.map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{row.product}</td>
                <td>
                  <ShopTag>{row.shop}</ShopTag>
                </td>
                <td className="text-right">
                  <TonePill tone="danger">
                    {row.quantity} left · min {row.min}
                  </TonePill>
                </td>
              </tr>
            ))}
            {pack.lowStock.length === 0 ? (
              <TableEmpty colSpan={3}>No item is running low.</TableEmpty>
            ) : null}
          </TableShell>
        </div>
      </div>

      <DrilldownModal
        open={drilldown !== null}
        onClose={() => setDrilldown(null)}
        eyebrow={pack.scope}
        title={drilldown ? DRILLDOWN_TITLE[drilldown] : ""}
        download={
          drilldown
            ? { filename: `${fileScope}-${drilldown.toLowerCase()}`, rows: drillRows[drilldown] }
            : undefined
        }
        summary={
          drilldown === "REVENUE" ? (
            <>
              <span>{sales.length} invoices</span>
              <span className="font-semibold text-foreground">{formatCurrency(pack.totals.revenue)}</span>
            </>
          ) : drilldown === "RECEIVED" ? (
            <>
              <span>{paidSales.length} invoices with money against them</span>
              <span className="font-semibold text-foreground">{formatCurrency(pack.totals.collected)}</span>
            </>
          ) : drilldown === "EXPENSES" ? (
            <>
              <span>{expenses.length} vouchers</span>
              <span className="font-semibold text-foreground">{formatCurrency(pack.totals.expenses)}</span>
            </>
          ) : drilldown === "OPENING" ? (
            <>
              <span>
                {opening.lines.length} item lines ·{" "}
                <Link href="/opening-stock" className="text-primary hover:underline">
                  Correct &amp; close opening stock
                </Link>
              </span>
              <span className="font-semibold text-foreground">{formatCurrency(openingValue)}</span>
            </>
          ) : drilldown === "BOUGHT" ? (
            <>
              <span>{opening.boughtSince.length} supplier bills</span>
              <span className="font-semibold text-foreground">{formatCurrency(boughtValue)}</span>
            </>
          ) : drilldown === "DEBTORS" ? (
            <>
              <span>
                {pack.debtors.length} customers with outstanding balances ·{" "}
                <Link href="/customers" className="text-primary hover:underline">
                  Customer accounts
                </Link>
              </span>
              <span className="font-semibold text-foreground">{formatCurrency(pack.totals.owing)}</span>
            </>
          ) : drilldown === "CREDITORS" ? (
            <>
              <span>
                {owedHouses.length} supplier house{owedHouses.length === 1 ? "" : "s"} still owed ·{" "}
                <Link href="/suppliers" className="text-primary hover:underline">
                  Supplier accounts
                </Link>
              </span>
              <span className="font-semibold text-foreground">{formatCurrency(supplierOwed)}</span>
            </>
          ) : drilldown === "SWAPS" ? (
            <>
              <span>
                {swaps.length} device swap transactions ·{" "}
                <Link href="/swaps" className="text-primary hover:underline">
                  Device swaps
                </Link>
              </span>
              <span className="font-semibold text-foreground">{formatCurrency(pack.totals.swaps)}</span>
            </>
          ) : drilldown === "RETURNS" ? (
            <>
              <span>
                {returns.length} customer returns ·{" "}
                <Link href="/returns" className="text-primary hover:underline">
                  Returns
                </Link>
              </span>
              <span className="font-semibold text-foreground">{returns.length} return records</span>
            </>
          ) : (
            <>
              <span>{inventory.length} stock lines</span>
              <span className="font-semibold text-foreground">{formatCurrency(pack.totals.stock)}</span>
            </>
          )
        }
      >
        {drilldown === "REVENUE" ? (
          <div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Shop</th>
                  <th>Date</th>
                  <th className="text-right">Invoice total</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Still owed</th>
                </tr>
              </thead>
              <tbody>
                {revenuePager.pageRows.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <Link href={`/sales/${sale.id}`} className="font-medium text-primary hover:underline">
                        {sale.invoiceNumber}
                      </Link>
                    </td>
                    <td>{sale.customer?.name ?? "Walk-in"}</td>
                    <td>
                      <ShopTag>{sale.branch.code}</ShopTag>
                    </td>
                    <td className="text-muted-foreground">{formatDate(sale.saleDate)}</td>
                    <td className="text-right num font-semibold">{formatCurrency(money(sale.totalAmount))}</td>
                    <td className="text-right num text-success">{formatCurrency(money(sale.paidAmount))}</td>
                    <td className="text-right num text-warning">
                      {formatCurrency(money(sale.totalAmount) - money(sale.paidAmount))}
                    </td>
                  </tr>
                ))}
                {sales.length === 0 ? <TableEmpty colSpan={7}>No sale in this time.</TableEmpty> : null}
              </tbody>
            </table>
            <TablePager
              page={revenuePager.page}
              pageCount={revenuePager.pageCount}
              pageSize={revenuePager.pageSize}
              total={revenuePager.total}
              start={revenuePager.start}
              end={revenuePager.end}
              onPageChange={revenuePager.setPage}
              onPageSizeChange={revenuePager.setPageSize}
              noun="sales"
            />
          </div>
        ) : null}

        {drilldown === "RECEIVED" ? (
          <div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Shop</th>
                  <th>Date</th>
                  <th className="text-right">Amount received</th>
                </tr>
              </thead>
              <tbody>
                {receivedPager.pageRows.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <Link href={`/sales/${sale.id}`} className="font-medium text-primary hover:underline">
                        {sale.invoiceNumber}
                      </Link>
                    </td>
                    <td>{sale.customer?.name ?? "Walk-in"}</td>
                    <td>
                      <ShopTag>{sale.branch.code}</ShopTag>
                    </td>
                    <td className="text-muted-foreground">{formatDate(sale.saleDate)}</td>
                    <td className="text-right num font-semibold text-success">
                      {formatCurrency(money(sale.paidAmount))}
                    </td>
                  </tr>
                ))}
                {paidSales.length === 0 ? <TableEmpty colSpan={5}>No money was collected in this time.</TableEmpty> : null}
              </tbody>
            </table>
            <TablePager
              page={receivedPager.page}
              pageCount={receivedPager.pageCount}
              pageSize={receivedPager.pageSize}
              total={receivedPager.total}
              start={receivedPager.start}
              end={receivedPager.end}
              onPageChange={receivedPager.setPage}
              onPageSizeChange={receivedPager.setPageSize}
              noun="payments"
            />
          </div>
        ) : null}

        {drilldown === "EXPENSES" ? (
          <div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Voucher</th>
                  <th>Category</th>
                  <th>What it was for</th>
                  <th>Shop</th>
                  <th>Date</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expensesPager.pageRows.map((expense) => (
                  <tr key={expense.id}>
                    <td className="font-medium">{expense.expenseNumber}</td>
                    <td>{expense.category.replace(/_/g, " ").toLowerCase()}</td>
                    <td>{expense.description}</td>
                    <td>
                      <ShopTag>{expense.branch.code}</ShopTag>
                    </td>
                    <td className="text-muted-foreground">{formatDate(expense.date)}</td>
                    <td className="text-right num font-semibold text-danger">{formatCurrency(money(expense.amount))}</td>
                  </tr>
                ))}
                {expenses.length === 0 ? <TableEmpty colSpan={6}>No bill was recorded in this time.</TableEmpty> : null}
              </tbody>
            </table>
            <TablePager
              page={expensesPager.page}
              pageCount={expensesPager.pageCount}
              pageSize={expensesPager.pageSize}
              total={expensesPager.total}
              start={expensesPager.start}
              end={expensesPager.end}
              onPageChange={expensesPager.setPage}
              onPageSizeChange={expensesPager.setPageSize}
              noun="bills"
            />
          </div>
        ) : null}

        {drilldown === "STOCK" ? (
          <div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Shop</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">Cost price</th>
                  <th className="text-right">Selling price</th>
                  <th className="text-right">Value at cost</th>
                </tr>
              </thead>
              <tbody>
                {stockPager.pageRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium">{row.product.name}</td>
                    <td>
                      <ShopTag>{row.branch.code}</ShopTag>
                    </td>
                    <td className="text-right num">{row.quantity}</td>
                    <td className="text-right num">{formatCurrency(money(row.product.costPrice))}</td>
                    <td className="text-right num">{formatCurrency(money(row.product.sellingPrice))}</td>
                    <td className="text-right num font-semibold">
                      {formatCurrency(row.quantity * money(row.product.costPrice))}
                    </td>
                  </tr>
                ))}
                {inventory.length === 0 ? <TableEmpty colSpan={6}>Nothing is on the shelf here.</TableEmpty> : null}
              </tbody>
            </table>
            <TablePager
              page={stockPager.page}
              pageCount={stockPager.pageCount}
              pageSize={stockPager.pageSize}
              total={stockPager.total}
              start={stockPager.start}
              end={stockPager.end}
              onPageChange={stockPager.setPage}
              onPageSizeChange={stockPager.setPageSize}
              noun="stock lines"
            />
          </div>
        ) : null}

        {drilldown === "OPENING" ? (
          <div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Shop</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">Unit cost</th>
                  <th className="text-right">Lowest</th>
                  <th className="text-right">Standard</th>
                  <th className="text-right">Value at cost</th>
                </tr>
              </thead>
              <tbody>
                {openingPager.pageRows.map((line) => (
                  <tr key={`${line.shop}-${line.sku}`}>
                    <td>
                      <p className="font-medium">{line.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{line.sku}</p>
                    </td>
                    <td>
                      <ShopTag>{line.shop}</ShopTag>{" "}
                      <TonePill tone={line.status === "CLOSED" ? "success" : "warning"}>
                        {line.status === "CLOSED" ? "Closed" : "Open"}
                      </TonePill>
                    </td>
                    <td className="text-right num">{line.openingQty}</td>
                    <td className="text-right num">{formatCurrency(line.costPrice)}</td>
                    <td className="text-right num">{formatCurrency(line.minimumPrice)}</td>
                    <td className="text-right num">{formatCurrency(line.sellingPrice)}</td>
                    <td className="text-right num font-semibold">{formatCurrency(line.openingQty * line.costPrice)}</td>
                  </tr>
                ))}
                {opening.lines.length === 0 ? <TableEmpty colSpan={7}>No opening stock here yet.</TableEmpty> : null}
              </tbody>
            </table>
            <TablePager
              page={openingPager.page}
              pageCount={openingPager.pageCount}
              pageSize={openingPager.pageSize}
              total={openingPager.total}
              start={openingPager.start}
              end={openingPager.end}
              onPageChange={openingPager.setPage}
              onPageSizeChange={openingPager.setPageSize}
              noun="item lines"
            />
          </div>
        ) : null}

        {drilldown === "BOUGHT" ? (
          <div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Supplier</th>
                  <th>Shop</th>
                  <th>Date</th>
                  <th className="text-right">Bill value</th>
                  <th className="text-right">Still owed</th>
                </tr>
              </thead>
              <tbody>
                {boughtPager.pageRows.map((bill) => (
                  <tr key={bill.id}>
                    <td>
                      <Link href={`/purchases/${bill.id}`} className="font-medium text-primary hover:underline">
                        {bill.invoiceNumber}
                      </Link>
                    </td>
                    <td>{bill.supplier}</td>
                    <td>
                      <ShopTag>{bill.shop}</ShopTag>
                    </td>
                    <td className="text-muted-foreground">{formatDate(bill.date)}</td>
                    <td className="text-right num font-semibold">{formatCurrency(bill.total)}</td>
                    <td className="text-right num text-warning">{formatCurrency(bill.owed)}</td>
                  </tr>
                ))}
                {opening.boughtSince.length === 0 ? (
                  <TableEmpty colSpan={6}>No supplier bill other than opening stock.</TableEmpty>
                ) : null}
              </tbody>
            </table>
            <TablePager
              page={boughtPager.page}
              pageCount={boughtPager.pageCount}
              pageSize={boughtPager.pageSize}
              total={boughtPager.total}
              start={boughtPager.start}
              end={boughtPager.end}
              onPageChange={boughtPager.setPage}
              onPageSizeChange={boughtPager.setPageSize}
              noun="bills"
            />
          </div>
        ) : null}

        {drilldown === "DEBTORS" ? (
          <div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Shop</th>
                  <th className="text-right">Amount Owed</th>
                </tr>
              </thead>
              <tbody>
                {debtorsDrillPager.pageRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/customers/${row.id}`} className="font-medium text-primary hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td>
                      <ShopTag>{row.shop}</ShopTag>
                    </td>
                    <td className="text-right num font-semibold text-warning">{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
                {pack.debtors.length === 0 ? <TableEmpty colSpan={3}>No customer owes money.</TableEmpty> : null}
              </tbody>
            </table>
            <TablePager
              page={debtorsDrillPager.page}
              pageCount={debtorsDrillPager.pageCount}
              pageSize={debtorsDrillPager.pageSize}
              total={debtorsDrillPager.total}
              start={debtorsDrillPager.start}
              end={debtorsDrillPager.end}
              onPageChange={debtorsDrillPager.setPage}
              onPageSizeChange={debtorsDrillPager.setPageSize}
              noun="customers"
            />
          </div>
        ) : null}

        {drilldown === "CREDITORS" ? (
          <div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th className="text-right">Still owed</th>
                </tr>
              </thead>
              <tbody>
                {creditorsDrillPager.pageRows.map((house) => {
                  const expanded = openHouse === house.key
                  return (
                    <OwedHouseRows
                      key={house.key}
                      house={house}
                      expanded={expanded}
                      colSpan={2}
                      onToggle={() => setOpenHouse(expanded ? null : house.key)}
                    />
                  )
                })}
                {pack.creditors.length === 0 ? <TableEmpty colSpan={2}>No unpaid supplier bills.</TableEmpty> : null}
              </tbody>
            </table>
            <TablePager
              page={creditorsDrillPager.page}
              pageCount={creditorsDrillPager.pageCount}
              pageSize={creditorsDrillPager.pageSize}
              total={creditorsDrillPager.total}
              start={creditorsDrillPager.start}
              end={creditorsDrillPager.end}
              onPageChange={creditorsDrillPager.setPage}
              onPageSizeChange={creditorsDrillPager.setPageSize}
              noun="houses"
            />
          </div>
        ) : null}

        {drilldown === "SWAPS" ? (
          <div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Swap Number</th>
                  <th>Customer</th>
                  <th>Shop</th>
                  <th>New Item</th>
                  <th>Date</th>
                  <th className="text-right">Swap Deal Value</th>
                  <th className="text-right">Balance Paid</th>
                </tr>
              </thead>
              <tbody>
                {swapsPager.pageRows.map((swap) => (
                  <tr key={swap.id}>
                    <td>
                      <Link href="/swaps" className="font-medium text-primary hover:underline">
                        {swap.swapNumber}
                      </Link>
                    </td>
                    <td>{swap.customer?.name ?? "Walk-in"}</td>
                    <td>
                      <ShopTag>{swap.branch.code}</ShopTag>
                    </td>
                    <td>{swap.newProduct?.name ?? "Phone"}</td>
                    <td className="text-muted-foreground">{formatDate(swap.createdAt)}</td>
                    <td className="text-right num">{formatCurrency(money(swap.tradeValue))}</td>
                    <td className="text-right num font-semibold text-success">{formatCurrency(money(swap.balanceAmount))}</td>
                  </tr>
                ))}
                {swaps.length === 0 ? <TableEmpty colSpan={7}>No swap transactions completed.</TableEmpty> : null}
              </tbody>
            </table>
            <TablePager
              page={swapsPager.page}
              pageCount={swapsPager.pageCount}
              pageSize={swapsPager.pageSize}
              total={swapsPager.total}
              start={swapsPager.start}
              end={swapsPager.end}
              onPageChange={swapsPager.setPage}
              onPageSizeChange={swapsPager.setPageSize}
              noun="swaps"
            />
          </div>
        ) : null}

        {drilldown === "RETURNS" ? (
          <div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Return Number</th>
                  <th>Customer</th>
                  <th>Shop</th>
                  <th>Item / IMEI</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th className="text-right">Refund Amount</th>
                </tr>
              </thead>
              <tbody>
                {returnsPager.pageRows.map((ret) => (
                  <tr key={ret.id}>
                    <td>
                      <Link href="/returns" className="font-medium text-primary hover:underline">
                        {ret.returnNumber}
                      </Link>
                    </td>
                    <td>{ret.customer?.name ?? "Customer"}</td>
                    <td>
                      <ShopTag>{ret.branch.code}</ShopTag>
                    </td>
                    <td>{ret.imei ? `${ret.imei.product.name} (${ret.imei.imei1})` : "Item"}</td>
                    <td>{ret.reason.replace(/_/g, " ")}</td>
                    <td>
                      <TonePill tone={ret.status === "RESOLVED" || ret.status === "COMPLETED" ? "success" : "warning"}>
                        {ret.status}
                      </TonePill>
                    </td>
                    <td className="text-muted-foreground">{formatDate(ret.createdAt)}</td>
                    <td className="text-right num font-semibold text-danger">
                      {money(ret.refundAmount) > 0 ? formatCurrency(money(ret.refundAmount)) : "—"}
                    </td>
                  </tr>
                ))}
                {returns.length === 0 ? <TableEmpty colSpan={8}>No customer return records.</TableEmpty> : null}
              </tbody>
            </table>
            <TablePager
              page={returnsPager.page}
              pageCount={returnsPager.pageCount}
              pageSize={returnsPager.pageSize}
              total={returnsPager.total}
              start={returnsPager.start}
              end={returnsPager.end}
              onPageChange={returnsPager.setPage}
              onPageSizeChange={returnsPager.setPageSize}
              noun="returns"
            />
          </div>
        ) : null}
      </DrilldownModal>

      <ReportsStatement data={pack} />
    </div>
  )
}

function OwedHouseRows({
  house,
  expanded,
  colSpan,
  onToggle,
}: {
  house: OwedHouse
  expanded: boolean
  colSpan: number
  onToggle: () => void
}) {
  return (
    <>
      <tr
        className="cursor-pointer"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onToggle()
          }
        }}
        tabIndex={0}
        aria-expanded={expanded}
      >
        <td>
          <div className="flex items-start gap-2">
            <ChevronDown
              className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`}
              aria-hidden
            />
            <div>
              <p className="font-medium">{house.name}</p>
              <p className="text-xs text-muted-foreground">
                {house.bills.length} bill{house.bills.length === 1 ? "" : "s"}. Click to open.
              </p>
            </div>
          </div>
        </td>
        <td className="text-right num font-semibold text-danger">{formatCurrency(house.owed)}</td>
      </tr>
      {expanded ? (
        <tr className="hover:bg-transparent">
          <td colSpan={colSpan} className="bg-muted/30 p-4">
            <div className="overflow-x-auto rounded-lg border border-border bg-card" onClick={(event) => event.stopPropagation()}>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Bill</th>
                    <th className="px-3 py-2 font-medium">Shop</th>
                    <th className="px-3 py-2 text-right font-medium">Still owed</th>
                  </tr>
                </thead>
                <tbody>
                  {house.bills.map((bill) => (
                    <tr key={bill.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Link href={`/purchases/${bill.id}`} className="font-medium text-primary hover:underline">
                          {bill.invoice}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <ShopTag>{bill.shop}</ShopTag>
                      </td>
                      <td className="px-3 py-2 text-right num font-semibold text-danger">{formatCurrency(bill.owed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
