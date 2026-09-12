"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Coins, Search, UserCheck, Users, Wallet } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { ShopTag, StatCard, StatGrid, TableEmpty, TableShell, TonePill, Toolbar } from "@/components/shared"
import { formatCurrency, money } from "@/lib/utils"

type CustomerItem = {
  id: string
  name: string
  phone: string
  email: string | null
  address: string | null
  currentBalance: number
  creditLimit: number
  branch: { id: string; name: string; code: string }
  sales: Array<{ totalAmount: number; paidAmount: number }>
  _count: { sales: number; returns: number }
}

type Tab = "ALL" | "OWING" | "CLEAR"

export function CustomersClientView({
  customers,
  branches,
}: {
  customers: CustomerItem[]
  branches: Array<{ id: string; name: string; code: string }>
}) {
  const [tab, setTab] = useState<Tab>("ALL")
  const [search, setSearch] = useState("")
  const [branchFilter, setBranchFilter] = useState("ALL")

  /*
    What the client asked this page to answer, in his words: "I want to know
    which of the customers is owing us and which one is not owing. I want to know
    the total value of item this particular customer has purchased from us."
  */
  const accounts = useMemo(
    () =>
      customers.map((customer) => {
        const purchased = customer.sales.reduce((sum, sale) => sum + money(sale.totalAmount), 0)
        const paid = customer.sales.reduce((sum, sale) => sum + money(sale.paidAmount), 0)
        const owed = money(customer.currentBalance)
        return { ...customer, purchased, paid, owed, isOwing: owed > 0 }
      }),
    [customers]
  )

  const owingCount = accounts.filter((account) => account.isOwing).length
  const lifetime = accounts.reduce((sum, account) => sum + account.purchased, 0)
  const totalOwed = accounts.reduce((sum, account) => sum + account.owed, 0)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return accounts.filter((account) => {
      if (tab === "OWING" && !account.isOwing) return false
      if (tab === "CLEAR" && account.isOwing) return false
      if (branchFilter !== "ALL" && account.branch.id !== branchFilter) return false
      if (!query) return true
      return account.name.toLowerCase().includes(query) || account.phone.includes(query)
    })
  }, [accounts, tab, branchFilter, search])

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: "ALL", label: "Everyone", count: accounts.length },
    { key: "OWING", label: "Still owing", count: owingCount },
    { key: "CLEAR", label: "Paid up", count: accounts.length - owingCount },
  ]

  return (
    <div className="space-y-5">
      <StatGrid>
        <StatCard
          label="Customers on the books"
          value={String(accounts.length)}
          hint="Anyone whose name has been entered on a sale"
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Bought from us, all time"
          value={formatCurrency(lifetime)}
          hint="Total value of everything these customers have taken"
          icon={<Coins className="h-4 w-4" />}
          tone="primary"
        />
        <StatCard
          label="Still owed to us"
          value={formatCurrency(totalOwed)}
          hint={`${owingCount} customer${owingCount === 1 ? "" : "s"} with an open balance`}
          icon={<Wallet className="h-4 w-4" />}
          tone={totalOwed > 0 ? "warning" : "neutral"}
          onClick={() => setTab("OWING")}
        />
        <StatCard
          label="Paid up in full"
          value={String(accounts.length - owingCount)}
          hint="Owe us nothing today"
          icon={<UserCheck className="h-4 w-4" />}
          tone="success"
          onClick={() => setTab("CLEAR")}
        />
      </StatGrid>

      <Toolbar className="justify-between">
        <div className="inline-flex rounded-lg bg-muted p-0.5">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                tab === item.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label} <span className="num text-xs opacity-70">({item.count})</span>
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <Select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="h-9 w-44">
            <option value="ALL">All shops</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Find by name or phone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 pl-9"
            />
          </div>
        </div>
      </Toolbar>

      <TableShell
        columns={[
          { label: "Customer" },
          { label: "Shop" },
          { label: "Sales", align: "right" },
          { label: "Bought, all time", align: "right" },
          { label: "Paid us", align: "right" },
          { label: "Still owes", align: "right" },
          { label: "", align: "right" },
        ]}
      >
        {filtered.map((customer) => (
          <tr key={customer.id}>
            <td>
              <Link href={`/customers/${customer.id}`} className="font-medium text-primary hover:underline">
                {customer.name}
              </Link>
              <p className="font-mono text-xs text-muted-foreground">{customer.phone}</p>
            </td>
            <td>
              <ShopTag>{customer.branch.code}</ShopTag>
            </td>
            <td className="text-right num text-muted-foreground">{customer._count.sales}</td>
            <td className="text-right num font-medium">{formatCurrency(customer.purchased)}</td>
            <td className="text-right num text-success">{formatCurrency(customer.paid)}</td>
            <td className="text-right">
              {customer.isOwing ? (
                <TonePill tone="warning">{formatCurrency(customer.owed)}</TonePill>
              ) : (
                <TonePill tone="success">Paid up</TonePill>
              )}
            </td>
            <td className="text-right">
              <Button asChild variant="ghost" size="sm">
                <Link href={`/customers/${customer.id}`}>
                  Statement <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </td>
          </tr>
        ))}
        {filtered.length === 0 ? (
          <TableEmpty colSpan={7}>No customer matches that tab, shop or search.</TableEmpty>
        ) : null}
      </TableShell>
    </div>
  )
}
