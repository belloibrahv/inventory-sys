"use client"

import { useState } from "react"
import Link from "next/link"
import { DollarSign, TrendingUp, TrendingDown, Landmark, Wallet, ArrowDownRight, ArrowUpRight, X, ExternalLink, Calendar, Receipt } from "lucide-react"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type LedgerEntry = {
  id: string
  date: Date
  branch: string
  type: "IN" | "OUT"
  category: string
  description: string
  amount: number
}

type FinanceData = {
  revenue: number
  expenditure: number
  supplierPayments: number
  netCashFlow: number
  cashRevenue: number
  bankRevenue: number
  cashAccount: {
    balance: number
    entries: LedgerEntry[]
  }
  bankAccount: {
    balance: number
    entries: LedgerEntry[]
  }
  debtors: Array<{ id: string; name: string; currentBalance: number; branch: { code: string } }>
  creditors: Array<{ id: string; name: string; owed: number }>
}

export function FinanceClientView({ data }: { data: FinanceData }) {
  const [activeLedger, setActiveLedger] = useState<"CASH" | "BANK" | null>(null)

  const activeAccount = activeLedger === "CASH" ? data.cashAccount : activeLedger === "BANK" ? data.bankAccount : null
  const accountTitle = activeLedger === "CASH" ? "Cash Account Ledger (Till)" : "Bank Account Ledger (POS & Transfers)"

  return (
    <div className="space-y-6">
      {/* Quick links */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Button asChild variant="outline" size="sm">
          <Link href="/finance/close">
            <Receipt className="mr-1.5 h-4 w-4" /> Close the Day (Till Count)
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/audit/books">
            <ExternalLink className="mr-1.5 h-4 w-4" /> Check the Books
          </Link>
        </Button>
      </div>

      {/* Core Accounting Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Revenue</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(data.revenue)}</p>
          <p className="text-xs text-muted-foreground mt-1">Cash: {formatCurrency(data.cashRevenue)} · Bank: {formatCurrency(data.bankRevenue)}</p>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Expenditures</span>
            <TrendingDown className="h-4 w-4 text-rose-600" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">{formatCurrency(data.expenditure)}</p>
          <p className="text-xs text-muted-foreground mt-1">Operational running expenses</p>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Supplier Payments</span>
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-primary">{formatCurrency(data.supplierPayments)}</p>
          <p className="text-xs text-muted-foreground mt-1">Payments disbursed for stock</p>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Net Cash Surplus</span>
            <span className={`text-xs font-bold ${data.netCashFlow >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {data.netCashFlow >= 0 ? "SURPLUS" : "DEFICIT"}
            </span>
          </div>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${data.netCashFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {formatCurrency(data.netCashFlow)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Revenue − Expenditures − Supplier Pay</p>
        </div>
      </div>

      {/* Account Cards with Interactive Drill-Down */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Account Ledgers (Click to View Itemized Breakdown)</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Cash Card */}
          <button
            type="button"
            onClick={() => setActiveLedger("CASH")}
            className="surface-card p-5 text-left transition-all hover:border-primary/50 hover:shadow-md cursor-pointer group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Wallet className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-base">Cash Account (Till)</p>
                  <p className="text-xs text-muted-foreground">Cash collections & till transactions</p>
                </div>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {data.cashAccount.entries.length} entries
              </span>
            </div>

            <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Net Cash Balance:</span>
              <span className="text-lg font-bold font-mono text-foreground">{formatCurrency(data.cashAccount.balance)}</span>
            </div>
            <p className="mt-1 text-[11px] text-primary font-medium text-right">Click for day-by-day cash ledger →</p>
          </button>

          {/* Bank Card */}
          <button
            type="button"
            onClick={() => setActiveLedger("BANK")}
            className="surface-card p-5 text-left transition-all hover:border-primary/50 hover:shadow-md cursor-pointer group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Landmark className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-base">Bank Account (POS & Transfers)</p>
                  <p className="text-xs text-muted-foreground">Electronic receipts & vendor payments</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {data.bankAccount.entries.length} entries
              </span>
            </div>

            <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Net Bank Balance:</span>
              <span className="text-lg font-bold font-mono text-foreground">{formatCurrency(data.bankAccount.balance)}</span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium text-right">Click for day-by-day bank ledger →</p>
          </button>
        </div>
      </div>

      {/* Drill-down Modal */}
      {activeLedger && activeAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="surface-card max-h-[85vh] w-full max-w-3xl overflow-hidden p-0 shadow-2xl border-primary/30 flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/30">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Itemized Accounting Drilldown</span>
                <h3 className="text-lg font-bold">{accountTitle}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveLedger(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-3 flex-1">
              <div className="rounded-xl bg-muted/40 p-3 flex justify-between items-center text-xs">
                <span>Total itemized transactions: <strong>{activeAccount.entries.length}</strong></span>
                <span>Calculated ledger balance: <strong className="font-mono text-sm">{formatCurrency(activeAccount.balance)}</strong></span>
              </div>

              <div className="space-y-2">
                {activeAccount.entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full p-1.5 ${entry.type === "IN" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"}`}>
                        {entry.type === "IN" ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{entry.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.category} · {entry.branch} · {formatDate(entry.date)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right font-mono font-bold">
                      <span className={entry.type === "IN" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                        {entry.type === "IN" ? `+${formatCurrency(entry.amount)}` : `-${formatCurrency(entry.amount)}`}
                      </span>
                      <span className="block text-[10px] text-muted-foreground uppercase">{entry.type === "IN" ? "Money In" : "Money Out"}</span>
                    </div>
                  </div>
                ))}

                {activeAccount.entries.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">No ledger entries recorded for this account.</p>
                )}
              </div>
            </div>

            <div className="border-t border-border px-6 py-3 bg-muted/20 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setActiveLedger(null)}>
                Close Ledger
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Debtors & Creditors */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="surface-card p-5">
          <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
            <h3 className="font-semibold text-sm uppercase tracking-wider">Customers Who Still Owe (Receivables)</h3>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/customers">View All Customers</Link>
            </Button>
          </div>
          <div className="space-y-2 text-sm">
            {data.debtors.map((customer) => (
              <div key={customer.id} className="flex justify-between items-center py-1.5 border-b border-border/50">
                <Link href={`/customers/${customer.id}`} className="text-primary hover:underline font-medium">
                  {customer.name} <span className="text-xs text-muted-foreground font-normal">({customer.branch.code})</span>
                </Link>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{formatCurrency(money(customer.currentBalance))}</span>
              </div>
            ))}
            {data.debtors.length === 0 && <p className="text-muted-foreground text-xs py-4">No customers currently owe money.</p>}
          </div>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
            <h3 className="font-semibold text-sm uppercase tracking-wider">Suppliers We Still Owe (Payables)</h3>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/suppliers">View All Suppliers</Link>
            </Button>
          </div>
          <div className="space-y-2 text-sm">
            {data.creditors.map((row) => (
              <div key={row.id} className="flex justify-between items-center py-1.5 border-b border-border/50">
                <Link href={`/suppliers/${row.id}`} className="text-primary hover:underline font-medium">
                  {row.name}
                </Link>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{formatCurrency(row.owed)}</span>
              </div>
            ))}
            {data.creditors.length === 0 && <p className="text-muted-foreground text-xs py-4">No outstanding balances owed to suppliers.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
