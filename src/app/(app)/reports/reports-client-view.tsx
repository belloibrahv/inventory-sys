"use client"

import { useState } from "react"
import Link from "next/link"
import { DollarSign, TrendingUp, TrendingDown, Package, Users, AlertTriangle, ArrowRight, X, Building2, Store } from "lucide-react"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ReportsStatement } from "@/components/reports-statement"
import { ReportsPdfButton } from "@/components/reports-pdf-button"
import { PrintButton } from "@/components/print-button"
import { ExportCsv } from "@/components/export-csv"
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

type BranchOption = {
  id: string
  name: string
  code: string
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
  const [activeDrilldown, setActiveDrilldown] = useState<"REVENUE" | "COLLECTED" | "EXPENSES" | "STOCK" | null>(null)

  return (
    <div className="space-y-6">
      {/* Top Controls & Actions */}
      <div className="reports-chrome print:hidden space-y-6">
        {/* Branch Filter Tabs / Dropdown */}
        {branches.length > 1 && (
          <div className="surface-card p-4 flex flex-wrap items-center justify-between gap-3 border-primary/20 bg-muted/20">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filter Reports by Shop:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/reports"
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  !selectedBranchId
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-background border border-border text-foreground hover:bg-muted"
                }`}
              >
                All Shops (Consolidated)
              </Link>
              {branches.map((b) => {
                const isCurrent = selectedBranchId === b.id
                return (
                  <Link
                    key={b.id}
                    href={`/reports?branchId=${b.id}`}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      isCurrent
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-background border border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {b.name} ({b.code})
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Action Buttons Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/audit/books">Check the Books</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/finance">Finance & Cash Flow</Link>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <ReportsPdfButton data={pack} />
            <PrintButton label="Print / Save PDF" />
            <ExportCsv
              filename={`${pack.statementRef}.csv`}
              label="Export Sales CSV"
              rows={[
                ["Invoice", "Customer", "Branch", "Total", "Paid", "Due", "Date"],
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
        </div>

        {/* Core KPI Cards with Clickable Drill-downs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Executive Financial KPIs (Click to drill down)</h3>
            <span className="text-[11px] text-primary">Interactive Ledger Cards</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Revenue Posted */}
            <button
              type="button"
              onClick={() => setActiveDrilldown("REVENUE")}
              className="surface-card p-5 text-left transition-all hover:border-primary/50 hover:shadow-md cursor-pointer group"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Revenue Posted</span>
                <TrendingUp className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(pack.totals.revenue)}</p>
              <p className="text-[11px] text-primary mt-1 flex items-center gap-1 font-medium">
                {sales.length} invoices billed · Click to inspect →
              </p>
            </button>

            {/* Payments Received */}
            <button
              type="button"
              onClick={() => setActiveDrilldown("COLLECTED")}
              className="surface-card p-5 text-left transition-all hover:border-emerald-500/50 hover:shadow-md cursor-pointer group"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Payments Received</span>
                <DollarSign className="h-4 w-4 text-emerald-600 group-hover:scale-110 transition-transform" />
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(pack.totals.collected)}
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                Settled in cash/bank · Click to inspect →
              </p>
            </button>

            {/* Operating Expenses */}
            <button
              type="button"
              onClick={() => setActiveDrilldown("EXPENSES")}
              className="surface-card p-5 text-left transition-all hover:border-rose-500/50 hover:shadow-md cursor-pointer group"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Operating Expenses</span>
                <TrendingDown className="h-4 w-4 text-rose-600 group-hover:scale-110 transition-transform" />
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
                {formatCurrency(pack.totals.expenses)}
              </p>
              <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1 font-medium">
                {expenses.length} approved expenses · Click to inspect →
              </p>
            </button>

            {/* Stock at Cost */}
            <button
              type="button"
              onClick={() => setActiveDrilldown("STOCK")}
              className="surface-card p-5 text-left transition-all hover:border-amber-500/50 hover:shadow-md cursor-pointer group"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Stock Valuation (Cost)</span>
                <Package className="h-4 w-4 text-amber-600 group-hover:scale-110 transition-transform" />
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {formatCurrency(pack.totals.stock)}
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1 font-medium">
                {inventory.length} product lines in stock · Click to inspect →
              </p>
            </button>
          </div>
        </div>

        {/* Secondary Operational Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="surface-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer Debt (Receivables)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {formatCurrency(pack.totals.owing)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{pack.debtors.length} customers with balance</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supplier Invoices Owed</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {formatCurrency(pack.creditors.reduce((s, c) => s + c.owed, 0))}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{pack.creditors.length} unpaid supplier bills</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Swap Balances</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(pack.totals.swaps)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Customer phone trade-in diffs</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stock Returns Filed</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{pack.totals.returns}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Customer item return claims</p>
          </div>
        </div>

        {/* Shop Comparison and Debtors */}
        <div className="grid gap-4 xl:grid-cols-2">
          {/* Shop Books */}
          <div className="surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-bold text-sm uppercase tracking-wider">Branch Performance</h3>
              <span className="text-xs text-muted-foreground">{pack.byShop.length} Branches</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-5 py-3">Shop</th>
                    <th className="px-3 py-3">Invoices</th>
                    <th className="px-3 py-3">Revenue Posted</th>
                    <th className="px-5 py-3">Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pack.byShop.map((row) => (
                    <tr key={row.name} className="hover:bg-muted/20">
                      <td className="px-5 py-3 font-semibold">{row.name}</td>
                      <td className="px-3 py-3">{row.tickets}</td>
                      <td className="px-3 py-3 font-mono font-medium">{formatCurrency(row.revenue)}</td>
                      <td className="px-5 py-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(row.collected)}
                      </td>
                    </tr>
                  ))}
                  {pack.byShop.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center text-muted-foreground">
                        No sales recorded for this scope.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Customers Still Owe */}
          <div className="surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-bold text-sm uppercase tracking-wider">Customer Receivables (Debtors)</h3>
              <Button asChild variant="ghost" size="sm" className="text-xs">
                <Link href="/customers">View All Customers</Link>
              </Button>
            </div>
            <div className="space-y-2 p-5 text-sm max-h-[280px] overflow-y-auto">
              {pack.debtors.map((row) => (
                <div key={row.id} className="flex justify-between items-center py-1.5 border-b border-border/50">
                  <Link href={`/customers/${row.id}`} className="text-primary hover:underline font-medium">
                    {row.name} <span className="text-xs text-muted-foreground">({row.shop})</span>
                  </Link>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {formatCurrency(row.amount)}
                  </span>
                </div>
              ))}
              {pack.debtors.length === 0 && <p className="text-muted-foreground text-xs py-4">No open customer balances.</p>}
            </div>
          </div>
        </div>

        {/* Creditors & Low Stock */}
        <div className="grid gap-4 xl:grid-cols-2">
          {/* Supplier Creditors */}
          <div className="surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-bold text-sm uppercase tracking-wider">Unpaid Supplier Invoices (Payables)</h3>
              <Button asChild variant="ghost" size="sm" className="text-xs">
                <Link href="/suppliers">View Suppliers</Link>
              </Button>
            </div>
            <div className="space-y-2 p-5 text-sm max-h-[260px] overflow-y-auto">
              {pack.creditors.map((row) => (
                <div key={row.id} className="flex justify-between items-center py-1.5 border-b border-border/50">
                  <Link href={`/purchases/${row.id}`} className="text-primary hover:underline font-medium">
                    {row.invoice} · {row.supplier} <span className="text-xs text-muted-foreground">({row.shop})</span>
                  </Link>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                    {formatCurrency(row.owed)}
                  </span>
                </div>
              ))}
              {pack.creditors.length === 0 && <p className="text-muted-foreground text-xs py-4">No supplier balances owed.</p>}
            </div>
          </div>

          {/* Low Stock Alerts */}
          <div className="surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-bold text-sm uppercase tracking-wider">Low Stock Warnings</h3>
              <Button asChild variant="ghost" size="sm" className="text-xs">
                <Link href="/inventory">View Inventory</Link>
              </Button>
            </div>
            <div className="space-y-2 p-5 text-sm max-h-[260px] overflow-y-auto">
              {pack.lowStock.map((row) => (
                <div key={row.id} className="flex justify-between items-center py-1.5 border-b border-border/50">
                  <span className="font-medium">
                    {row.product} <span className="text-xs text-muted-foreground">({row.shop})</span>
                  </span>
                  <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                    {row.quantity} left (Min: {row.min})
                  </span>
                </div>
              ))}
              {pack.lowStock.length === 0 && <p className="text-muted-foreground text-xs py-4">All stock levels are above minimum threshold.</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Drill-down Modal */}
      {activeDrilldown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="surface-card max-h-[85vh] w-full max-w-4xl overflow-hidden p-0 shadow-2xl border-primary/30 flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/30">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Itemized Audit Drilldown</span>
                <h3 className="text-lg font-bold">
                  {activeDrilldown === "REVENUE" && "All Completed Sales Invoices (Revenue Posted)"}
                  {activeDrilldown === "COLLECTED" && "Payments Collected Breakdown"}
                  {activeDrilldown === "EXPENSES" && "Operational Running Expenses Log"}
                  {activeDrilldown === "STOCK" && "Physical Inventory Stock at Cost"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveDrilldown(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 flex-1">
              {activeDrilldown === "REVENUE" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-left text-muted-foreground uppercase">
                      <tr>
                        <th className="p-2.5">Invoice</th>
                        <th className="p-2.5">Customer</th>
                        <th className="p-2.5">Branch</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5 text-right">Total Amount</th>
                        <th className="p-2.5 text-right">Paid</th>
                        <th className="p-2.5 text-right">Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-muted/20">
                          <td className="p-2.5 font-semibold text-primary">{sale.invoiceNumber}</td>
                          <td className="p-2.5">{sale.customer?.name ?? "Walk-in"}</td>
                          <td className="p-2.5">{sale.branch.code}</td>
                          <td className="p-2.5">{formatDate(sale.saleDate)}</td>
                          <td className="p-2.5 text-right font-mono font-bold">{formatCurrency(money(sale.totalAmount))}</td>
                          <td className="p-2.5 text-right font-mono text-emerald-600">{formatCurrency(money(sale.paidAmount))}</td>
                          <td className="p-2.5 text-right font-mono text-rose-600">
                            {formatCurrency(money(sale.totalAmount) - money(sale.paidAmount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeDrilldown === "COLLECTED" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-left text-muted-foreground uppercase">
                      <tr>
                        <th className="p-2.5">Invoice</th>
                        <th className="p-2.5">Customer</th>
                        <th className="p-2.5">Branch</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5 text-right">Amount Collected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sales
                        .filter((s) => money(s.paidAmount) > 0)
                        .map((sale) => (
                          <tr key={sale.id} className="hover:bg-muted/20">
                            <td className="p-2.5 font-semibold text-primary">{sale.invoiceNumber}</td>
                            <td className="p-2.5">{sale.customer?.name ?? "Walk-in"}</td>
                            <td className="p-2.5">{sale.branch.code}</td>
                            <td className="p-2.5">{formatDate(sale.saleDate)}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-emerald-600">
                              {formatCurrency(money(sale.paidAmount))}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeDrilldown === "EXPENSES" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-left text-muted-foreground uppercase">
                      <tr>
                        <th className="p-2.5">Voucher #</th>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5">Branch</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {expenses.map((exp) => (
                        <tr key={exp.id} className="hover:bg-muted/20">
                          <td className="p-2.5 font-semibold text-primary">{exp.expenseNumber}</td>
                          <td className="p-2.5 font-medium">{exp.category}</td>
                          <td className="p-2.5">{exp.description}</td>
                          <td className="p-2.5">{exp.branch.code}</td>
                          <td className="p-2.5">{formatDate(exp.date)}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-rose-600">
                            {formatCurrency(money(exp.amount))}
                          </td>
                        </tr>
                      ))}
                      {expenses.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-muted-foreground">
                            No approved expenses logged for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeDrilldown === "STOCK" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-left text-muted-foreground uppercase">
                      <tr>
                        <th className="p-2.5">Product Name</th>
                        <th className="p-2.5">Branch</th>
                        <th className="p-2.5 text-right">Qty</th>
                        <th className="p-2.5 text-right">Cost Price</th>
                        <th className="p-2.5 text-right">Selling Price</th>
                        <th className="p-2.5 text-right">Total Valuation (Cost)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {inventory.map((inv) => (
                        <tr key={inv.id} className="hover:bg-muted/20">
                          <td className="p-2.5 font-medium">{inv.product.name}</td>
                          <td className="p-2.5">{inv.branch.code}</td>
                          <td className="p-2.5 text-right font-semibold">{inv.quantity}</td>
                          <td className="p-2.5 text-right font-mono">{formatCurrency(money(inv.product.costPrice))}</td>
                          <td className="p-2.5 text-right font-mono">{formatCurrency(money(inv.product.sellingPrice))}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-amber-600">
                            {formatCurrency(inv.quantity * money(inv.product.costPrice))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="border-t border-border px-6 py-3 bg-muted/20 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setActiveDrilldown(null)}>
                Close Drilldown
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Formal Printed Statement */}
      <ReportsStatement data={pack} />
    </div>
  )
}
