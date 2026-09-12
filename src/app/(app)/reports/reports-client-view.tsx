"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Banknote, Package, TrendingDown, TrendingUp } from "lucide-react"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { ReportsStatement } from "@/components/reports-statement"
import { ReportsPdfButton } from "@/components/reports-pdf-button"
import { PrintButton } from "@/components/print-button"
import { ExportCsv } from "@/components/export-csv"
import { DrilldownModal } from "@/components/drilldown-modal"
import {
  ShopTag,
  StatCard,
  StatGrid,
  TableEmpty,
  TableShell,
  TonePill,
  Toolbar,
} from "@/components/shared"
import type { ReportsPack } from "@/lib/reports-pack"

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

type BranchOption = { id: string; name: string; code: string }

type Drilldown = "REVENUE" | "RECEIVED" | "EXPENSES" | "STOCK"

const DRILLDOWN_TITLE: Record<Drilldown, string> = {
  REVENUE: "Every sale that makes up this money",
  RECEIVED: "Every payment we collected in this time",
  EXPENSES: "Every bill we paid in this time",
  STOCK: "Every item that makes up this stock value",
}

export function ReportsClientView({
  pack,
  sales,
  expenses,
  inventory,
  branches,
  selectedBranchId,
}: {
  pack: ReportsPack
  sales: RawSale[]
  expenses: RawExpense[]
  inventory: RawInventory[]
  branches: BranchOption[]
  selectedBranchId?: string
}) {
  const router = useRouter()
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null)
  const paidSales = sales.filter((sale) => money(sale.paidAmount) > 0)
  const supplierOwed = pack.creditors.reduce((sum, row) => sum + row.owed, 0)

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
                  const next = event.target.value
                  router.push(next ? `/reports?branchId=${next}` : "/reports")
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
            <TonePill tone={selectedBranchId ? "primary" : "neutral"}>{pack.scope}</TonePill>
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

        {/* Every headline figure opens the rows that add up to it. */}
        <StatGrid>
          <StatCard
            label="Money from sales"
            value={formatCurrency(pack.totals.revenue)}
            hint={`${sales.length} sale${sales.length === 1 ? "" : "s"} in this time`}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="neutral"
            onClick={() => setDrilldown("REVENUE")}
          />
          <StatCard
            label="Money we collected"
            value={formatCurrency(pack.totals.collected)}
            hint="Money that truly entered our hand: cash, transfer or POS"
            icon={<Banknote className="h-4 w-4" />}
            tone="success"
            onClick={() => setDrilldown("RECEIVED")}
          />
          <StatCard
            label="Money we spent"
            value={formatCurrency(pack.totals.expenses)}
            hint={`${expenses.length} bill${expenses.length === 1 ? "" : "s"} recorded`}
            icon={<TrendingDown className="h-4 w-4" />}
            tone="danger"
            onClick={() => setDrilldown("EXPENSES")}
          />
          <StatCard
            label="What the stock cost us"
            value={formatCurrency(pack.totals.stock)}
            hint={`${inventory.length} item${inventory.length === 1 ? "" : "s"} on the shelf`}
            icon={<Package className="h-4 w-4" />}
            tone="warning"
            onClick={() => setDrilldown("STOCK")}
          />
        </StatGrid>

        <StatGrid>
          <StatCard
            label="Customers still owe us"
            value={formatCurrency(pack.totals.owing)}
            hint={`${pack.debtors.length} customer${pack.debtors.length === 1 ? "" : "s"} with a balance`}
            href="/customers"
          />
          <StatCard
            label="We still owe suppliers"
            value={formatCurrency(supplierOwed)}
            hint={`${pack.creditors.length} supplier bill${pack.creditors.length === 1 ? "" : "s"} not yet paid`}
            href="/suppliers"
          />
          <StatCard
            label="Money from swaps"
            value={formatCurrency(pack.totals.swaps)}
            hint="The extra money customers added when they swapped an old phone"
            href="/swaps"
          />
          <StatCard
            label="Things brought back"
            value={String(pack.totals.returns)}
            hint="Items customers returned in this time"
            href="/returns"
          />
        </StatGrid>

        <div className="grid gap-4 xl:grid-cols-2">
          <TableShell
            caption={
              <>
                <h2 className="text-sm font-semibold tracking-tight">Shop by shop</h2>
                <span className="text-xs text-muted-foreground">
                  {pack.byShop.length} shop{pack.byShop.length === 1 ? "" : "s"} with sales
                </span>
              </>
            }
            columns={[
              { label: "Shop" },
              { label: "How many sales", align: "right" },
              { label: "Money from sales", align: "right" },
              { label: "Money we collected", align: "right" },
            ]}
          >
            {pack.byShop.map((row) => (
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
                <Button asChild variant="ghost" size="sm">
                  <Link href="/customers">All customers</Link>
                </Button>
              </>
            }
            columns={[{ label: "Customer" }, { label: "Shop" }, { label: "Still owed", align: "right" }]}
          >
            {pack.debtors.map((row) => (
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
                <h2 className="text-sm font-semibold tracking-tight">Supplier bills we have not paid</h2>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/suppliers">All suppliers</Link>
                </Button>
              </>
            }
            columns={[{ label: "Bill" }, { label: "Shop" }, { label: "Still owed", align: "right" }]}
          >
            {pack.creditors.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/purchases/${row.id}`} className="font-medium text-primary hover:underline">
                    {row.invoice}
                  </Link>
                  <p className="text-xs text-muted-foreground">{row.supplier}</p>
                </td>
                <td>
                  <ShopTag>{row.shop}</ShopTag>
                </td>
                <td className="text-right num font-semibold text-danger">{formatCurrency(row.owed)}</td>
              </tr>
            ))}
            {pack.creditors.length === 0 ? (
              <TableEmpty colSpan={3}>We have paid every supplier bill.</TableEmpty>
            ) : null}
          </TableShell>

          <TableShell
            caption={
              <>
                <h2 className="text-sm font-semibold tracking-tight">Running low</h2>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/inventory">Shop stock</Link>
                </Button>
              </>
            }
            columns={[{ label: "Item" }, { label: "Shop" }, { label: "Left", align: "right" }]}
          >
            {pack.lowStock.map((row) => (
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
          ) : (
            <>
              <span>{inventory.length} stock lines</span>
              <span className="font-semibold text-foreground">{formatCurrency(pack.totals.stock)}</span>
            </>
          )
        }
      >
        {drilldown === "REVENUE" ? (
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
              {sales.map((sale) => (
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
        ) : null}

        {drilldown === "RECEIVED" ? (
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
              {paidSales.map((sale) => (
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
        ) : null}

        {drilldown === "EXPENSES" ? (
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
              {expenses.map((expense) => (
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
        ) : null}

        {drilldown === "STOCK" ? (
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
              {inventory.map((row) => (
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
        ) : null}
      </DrilldownModal>

      <ReportsStatement data={pack} />
    </div>
  )
}
