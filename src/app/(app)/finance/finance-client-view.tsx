"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  ClipboardCheck,
  Landmark,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { formatCurrency, formatDate, money } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DrilldownModal } from "@/components/drilldown-modal"
import { TableDownload } from "@/components/table-download"
import {
  ShopTag,
  StatCard,
  StatGrid,
  TableEmpty,
  TableShell,
  Toolbar,
} from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"

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
  cashAccount: { balance: number; entries: LedgerEntry[] }
  bankAccount: { balance: number; entries: LedgerEntry[] }
  debtors: Array<{ id: string; name: string; currentBalance: number; branch: { code: string } }>
  creditors: Array<{ id: string; name: string; owed: number }>
}

/** One day's worth of movements on an account, with that day's in, out and net. */
type DayGroup = {
  key: string
  label: string
  moneyIn: number
  moneyOut: number
  net: number
  entries: LedgerEntry[]
}

function groupByDay(entries: LedgerEntry[]): DayGroup[] {
  const map = new Map<string, DayGroup>()
  for (const entry of entries) {
    const date = new Date(entry.date)
    const key = date.toISOString().slice(0, 10)
    const group =
      map.get(key) ??
      { key, label: formatDate(date), moneyIn: 0, moneyOut: 0, net: 0, entries: [] as LedgerEntry[] }
    if (entry.type === "IN") group.moneyIn += entry.amount
    else group.moneyOut += entry.amount
    group.net = group.moneyIn - group.moneyOut
    group.entries.push(entry)
    map.set(key, group)
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1))
}

export function FinanceClientView({ data }: { data: FinanceData }) {
  const [ledger, setLedger] = useState<"CASH" | "BANK" | null>(null)

  const account = ledger === "CASH" ? data.cashAccount : ledger === "BANK" ? data.bankAccount : null
  const cashDays = useMemo(() => groupByDay(data.cashAccount.entries), [data.cashAccount.entries])
  const bankDays = useMemo(() => groupByDay(data.bankAccount.entries), [data.bankAccount.entries])
  const days = ledger === "CASH" ? cashDays : ledger === "BANK" ? bankDays : []
  const debtorsPager = usePagedRows(data.debtors, "debtors")
  const creditorsPager = usePagedRows(data.creditors, "creditors")
  const daysPager = usePagedRows(days, ledger ?? "none")

  return (
    <div className="space-y-5">
      <Toolbar className="justify-between">
        <p className="text-sm text-muted-foreground">
          Gross revenue reflects customer sales. Operating expenditures (OPEX) cover overhead and operations. Vendor disbursements reflect accounts payable settlements.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/finance/close">
              <ClipboardCheck className="mr-1.5 h-4 w-4" /> End of Day Register
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/audit/books">
              <Scale className="mr-1.5 h-4 w-4" /> Financial Audit Pack
            </Link>
          </Button>
        </div>
      </Toolbar>

      <StatGrid>
        <StatCard
          label="Gross Revenue (Inflows)"
          value={formatCurrency(data.revenue)}
          hint={`Cash Collections: ${formatCurrency(data.cashRevenue)} · Bank Deposits: ${formatCurrency(data.bankRevenue)}`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label="Operating Expenses (OPEX)"
          value={formatCurrency(data.expenditure)}
          hint="Facilities, payroll, transport, utilities, and general overhead"
          icon={<TrendingDown className="h-4 w-4" />}
          tone="danger"
          href="/expenses"
        />
        <StatCard
          label="Vendor Disbursements (AP)"
          value={formatCurrency(data.supplierPayments)}
          hint="Accounts payable disbursements for inventory procurement"
          icon={<Banknote className="h-4 w-4" />}
          tone="warning"
          href="/suppliers"
        />
        <StatCard
          label={data.netCashFlow >= 0 ? "Net Cash Flow (Surplus)" : "Net Cash Flow (Deficit)"}
          value={formatCurrency(data.netCashFlow)}
          hint="Gross collections minus operating expenses and vendor disbursements"
          icon={<Scale className="h-4 w-4" />}
          tone={data.netCashFlow >= 0 ? "success" : "danger"}
        />
      </StatGrid>

      <div className="grid gap-4 md:grid-cols-2">
        <button type="button" onClick={() => setLedger("CASH")} className="surface-card-interactive group p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Wallet className="h-5 w-5" />
              </span>
              <div className="text-left">
                <p className="text-sm font-semibold">Cash on Hand (Vault & Registers)</p>
                <p className="text-xs text-muted-foreground">Physical currency collected and disbursed across branch registers</p>
              </div>
            </div>
            <span className="eyebrow">{cashDays.length} day{cashDays.length === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Perpetual Ledger Balance</span>
            <span className="text-2xl font-semibold num">{formatCurrency(data.cashAccount.balance)}</span>
          </div>
          <p className="mt-1 text-right text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            View daily transaction ledger &rarr;
          </p>
        </button>

        <button type="button" onClick={() => setLedger("BANK")} className="surface-card-interactive group p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-success-soft text-success">
                <Landmark className="h-5 w-5" />
              </span>
              <div className="text-left">
                <p className="text-sm font-semibold">Bank & Merchant Clearing Accounts</p>
                <p className="text-xs text-muted-foreground">Electronic fund transfers, POS terminal settlements, and direct deposits</p>
              </div>
            </div>
            <span className="eyebrow">{bankDays.length} day{bankDays.length === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Perpetual Ledger Balance</span>
            <span className="text-2xl font-semibold num">{formatCurrency(data.bankAccount.balance)}</span>
          </div>
          <p className="mt-1 text-right text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            View daily transaction ledger &rarr;
          </p>
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TableShell
          caption={
            <>
              <h2 className="text-sm font-semibold tracking-tight">Accounts Receivable (Outstanding Balances)</h2>
              <div className="flex items-center gap-2">
                <TableDownload
                  filename="accounts-receivable"
                  rows={() => [
                    ["Customer", "Branch", "Outstanding Balance"],
                    ...data.debtors.map((row) => [row.name, row.branch.code, money(row.currentBalance)]),
                  ]}
                />
                <Button asChild variant="ghost" size="sm">
                  <Link href="/customers">All Customers</Link>
                </Button>
              </div>
            </>
          }
          columns={[{ label: "Customer / Account" }, { label: "Branch" }, { label: "Outstanding Balance", align: "right" }]}
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
              noun="accounts"
            />
          }
        >
          {debtorsPager.pageRows.map((customer) => (
            <tr key={customer.id}>
              <td>
                <Link href={`/customers/${customer.id}`} className="font-medium text-primary hover:underline">
                  {customer.name}
                </Link>
              </td>
              <td>
                <ShopTag>{customer.branch.code}</ShopTag>
              </td>
              <td className="text-right num font-semibold text-warning">
                {formatCurrency(money(customer.currentBalance))}
              </td>
            </tr>
          ))}
          {data.debtors.length === 0 ? (
            <TableEmpty colSpan={3}>No outstanding customer receivables.</TableEmpty>
          ) : null}
        </TableShell>

        <TableShell
          caption={
            <>
              <h2 className="text-sm font-semibold tracking-tight">Accounts Payable (Vendor Balances)</h2>
              <div className="flex items-center gap-2">
                <TableDownload
                  filename="accounts-payable"
                  rows={() => [["Vendor", "Outstanding Balance"], ...data.creditors.map((row) => [row.name, row.owed])]}
                />
                <Button asChild variant="ghost" size="sm">
                  <Link href="/suppliers">All Vendors</Link>
                </Button>
              </div>
            </>
          }
          columns={[{ label: "Vendor / Creditor" }, { label: "Outstanding Balance", align: "right" }]}
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
              noun="vendors"
            />
          }
        >
          {creditorsPager.pageRows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link href={`/suppliers/${row.id}`} className="font-medium text-primary hover:underline">
                  {row.name}
                </Link>
              </td>
              <td className="text-right num font-semibold text-danger">{formatCurrency(row.owed)}</td>
            </tr>
          ))}
          {data.creditors.length === 0 ? (
            <TableEmpty colSpan={2}>All vendor accounts payable settled.</TableEmpty>
          ) : null}
        </TableShell>
      </div>

      <DrilldownModal
        open={ledger !== null}
        onClose={() => setLedger(null)}
        eyebrow="General Ledger Activity"
        title={ledger === "CASH" ? "Cash on Hand General Ledger" : "Bank & Clearing Accounts General Ledger"}
        download={
          account
            ? {
                filename: `${ledger === "CASH" ? "cash" : "bank"}-ledger-${new Date().toISOString().slice(0, 10)}`,
                rows: () => [
                  ["Date", "Branch", "Transaction Type", "Category", "Description", "Amount"],
                  ...account.entries.map((entry) => [
                    new Date(entry.date).toISOString().slice(0, 10),
                    entry.branch,
                    entry.type === "IN" ? "Credit" : "Debit",
                    entry.category,
                    entry.description,
                    entry.amount,
                  ]),
                  [],
                  ["Ending Ledger Balance", "", "", "", "", account.balance],
                ],
              }
            : undefined
        }
        summary={
          account ? (
            <>
              <span>
                {account.entries.length} transaction{account.entries.length === 1 ? "" : "s"} across {days.length} business day
                {days.length === 1 ? "" : "s"}
              </span>
              <span className="font-semibold text-foreground">Ending Balance: {formatCurrency(account.balance)}</span>
            </>
          ) : null
        }
      >
        <div className="divide-y divide-border">
          {daysPager.pageRows.map((day) => (
            <section key={day.key}>
              <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 px-5 py-2">
                <p className="text-sm font-semibold">{day.label}</p>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span className="text-success">Credits {formatCurrency(day.moneyIn)}</span>
                  <span className="text-danger">Debits {formatCurrency(day.moneyOut)}</span>
                  <span className="font-semibold text-foreground">Net {formatCurrency(day.net)}</span>
                </div>
              </div>
              <ul className="divide-y divide-border/60">
                {day.entries.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-4 px-5 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                          entry.type === "IN" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                        }`}
                      >
                        {entry.type === "IN" ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{entry.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.category} · {entry.branch}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`num text-sm font-semibold ${
                          entry.type === "IN" ? "text-success" : "text-danger"
                        }`}
                      >
                        {entry.type === "IN" ? "+" : "−"}
                        {formatCurrency(entry.amount)}
                      </p>
                      <p className="eyebrow">{entry.type === "IN" ? "Credit (Inflow)" : "Debit (Outflow)"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {days.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              No transaction activity recorded for this ledger account.
            </p>
          ) : null}
        </div>
        <TablePager
          page={daysPager.page}
          pageCount={daysPager.pageCount}
          pageSize={daysPager.pageSize}
          total={daysPager.total}
          start={daysPager.start}
          end={daysPager.end}
          onPageChange={daysPager.setPage}
          onPageSizeChange={daysPager.setPageSize}
          noun="days"
        />
      </DrilldownModal>
    </div>
  )
}
