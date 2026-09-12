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
          Revenue is money earned from sales. Expenditure is what it costs to run the shops. Payments are what we send
          to suppliers for stock.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/finance/close">
              <ClipboardCheck className="mr-1.5 h-4 w-4" /> Close the day
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/audit/books">
              <Scale className="mr-1.5 h-4 w-4" /> Check the books
            </Link>
          </Button>
        </div>
      </Toolbar>

      <StatGrid>
        <StatCard
          label="Money in from sales"
          value={formatCurrency(data.revenue)}
          hint={`Cash ${formatCurrency(data.cashRevenue)} · Bank ${formatCurrency(data.bankRevenue)}`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="success"
        />
        <StatCard
          label="Money spent to run the shop"
          value={formatCurrency(data.expenditure)}
          hint="Rent, fuel, transport, salary, light bill and the rest"
          icon={<TrendingDown className="h-4 w-4" />}
          tone="danger"
          href="/expenses"
        />
        <StatCard
          label="Money paid to suppliers"
          value={formatCurrency(data.supplierPayments)}
          hint="What we sent to suppliers for goods they gave us"
          icon={<Banknote className="h-4 w-4" />}
          tone="warning"
          href="/suppliers"
        />
        <StatCard
          label={data.netCashFlow >= 0 ? "Money left over" : "Money short"}
          value={formatCurrency(data.netCashFlow)}
          hint="Money in from sales, minus what we spent and what we paid suppliers"
          icon={<Scale className="h-4 w-4" />}
          tone={data.netCashFlow >= 0 ? "success" : "danger"}
        />
      </StatGrid>

      {/*
        The client, as an accountant, did not want every movement listed on the
        page: "let it be summarized. If there's a need for us to check through, we
        click on it." So Cash and Bank each show one balance, and the day-by-day
        build-up opens on click.
      */}
      <div className="grid gap-4 md:grid-cols-2">
        <button type="button" onClick={() => setLedger("CASH")} className="surface-card-interactive group p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Wallet className="h-5 w-5" />
              </span>
              <div className="text-left">
                <p className="text-sm font-semibold">Cash (the till)</p>
                <p className="text-xs text-muted-foreground">Notes collected and paid out at the counter</p>
              </div>
            </div>
            <span className="eyebrow">{cashDays.length} day{cashDays.length === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">What the books say is left</span>
            <span className="text-2xl font-semibold num">{formatCurrency(data.cashAccount.balance)}</span>
          </div>
          <p className="mt-1 text-right text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            See how it built up, day by day &rarr;
          </p>
        </button>

        <button type="button" onClick={() => setLedger("BANK")} className="surface-card-interactive group p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-success-soft text-success">
                <Landmark className="h-5 w-5" />
              </span>
              <div className="text-left">
                <p className="text-sm font-semibold">Bank (POS and transfers)</p>
                <p className="text-xs text-muted-foreground">Money that passed through the bank, not the till</p>
              </div>
            </div>
            <span className="eyebrow">{bankDays.length} day{bankDays.length === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">What the books say is left</span>
            <span className="text-2xl font-semibold num">{formatCurrency(data.bankAccount.balance)}</span>
          </div>
          <p className="mt-1 text-right text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            See how it built up, day by day &rarr;
          </p>
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
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
            <TableEmpty colSpan={3}>No customer owes anything right now.</TableEmpty>
          ) : null}
        </TableShell>

        <TableShell
          caption={
            <>
              <h2 className="text-sm font-semibold tracking-tight">Suppliers we still owe</h2>
              <Button asChild variant="ghost" size="sm">
                <Link href="/suppliers">All suppliers</Link>
              </Button>
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
              noun="suppliers"
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
            <TableEmpty colSpan={2}>Every supplier bill is settled.</TableEmpty>
          ) : null}
        </TableShell>
      </div>

      <DrilldownModal
        open={ledger !== null}
        onClose={() => setLedger(null)}
        eyebrow="Day-by-day build-up"
        title={ledger === "CASH" ? "Cash account (the till)" : "Bank account (POS and transfers)"}
        summary={
          account ? (
            <>
              <span>
                {account.entries.length} movement{account.entries.length === 1 ? "" : "s"} over {days.length} day
                {days.length === 1 ? "" : "s"}
              </span>
              <span className="font-semibold text-foreground">Balance {formatCurrency(account.balance)}</span>
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
                  <span className="text-success">Money in {formatCurrency(day.moneyIn)}</span>
                  <span className="text-danger">Money out {formatCurrency(day.moneyOut)}</span>
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
                      {/*
                        The client wanted this unmistakable for someone without
                        accounting training: say, in words, which way the money went.
                      */}
                      <p
                        className={`num text-sm font-semibold ${
                          entry.type === "IN" ? "text-success" : "text-danger"
                        }`}
                      >
                        {entry.type === "IN" ? "+" : "−"}
                        {formatCurrency(entry.amount)}
                      </p>
                      <p className="eyebrow">{entry.type === "IN" ? "Money moved in" : "Money moved out"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {days.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              Nothing has moved through this account yet.
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
