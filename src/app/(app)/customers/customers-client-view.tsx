"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Search, UserCheck, AlertCircle, Users, DollarSign, ArrowRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
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

export function CustomersClientView({
  customers,
  branches,
}: {
  customers: CustomerItem[]
  branches: Array<{ id: string; name: string; code: string }>
}) {
  const [tab, setTab] = useState<"ALL" | "OWING" | "SETTLED">("ALL")
  const [search, setSearch] = useState("")
  const [branchFilter, setBranchFilter] = useState("ALL")

  const formattedCustomers = useMemo(() => {
    return customers.map((c) => {
      const totalPurchases = c.sales.reduce((sum, s) => sum + money(s.totalAmount), 0)
      const totalPaid = c.sales.reduce((sum, s) => sum + money(s.paidAmount), 0)
      const balanceOwed = money(c.currentBalance)
      const isOwing = balanceOwed > 0

      return {
        ...c,
        totalPurchases,
        totalPaid,
        balanceOwed,
        isOwing,
      }
    })
  }, [customers])

  // KPIs
  const totalCustomers = formattedCustomers.length
  const totalLifetimePurchases = formattedCustomers.reduce((sum, c) => sum + c.totalPurchases, 0)
  const totalDebtOwed = formattedCustomers.reduce((sum, c) => sum + c.balanceOwed, 0)
  const owingCount = formattedCustomers.filter((c) => c.isOwing).length

  // Filtered List
  const filtered = useMemo(() => {
    return formattedCustomers.filter((c) => {
      if (tab === "OWING" && !c.isOwing) return false
      if (tab === "SETTLED" && c.isOwing) return false
      if (branchFilter !== "ALL" && c.branch.id !== branchFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchName = c.name.toLowerCase().includes(q)
        const matchPhone = c.phone.includes(q)
        if (!matchName && !matchPhone) return false
      }
      return true
    })
  }, [formattedCustomers, tab, branchFilter, search])

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">Registered Customers</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-1 text-2xl font-bold">{totalCustomers}</p>
          <p className="text-xs text-muted-foreground mt-1">Active customer accounts</p>
        </div>

        <div className="surface-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">Total Lifetime Purchases</span>
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(totalLifetimePurchases)}</p>
          <p className="text-xs text-muted-foreground mt-1">Total sales value across all customers</p>
        </div>

        <div className="surface-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">Outstanding Debts Owed</span>
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {formatCurrency(totalDebtOwed)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{owingCount} customer(s) currently owing</p>
        </div>

        <div className="surface-card p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase">Debt-Free Customers</span>
            <UserCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {totalCustomers - owingCount}
          </p>
          <p className="text-xs text-muted-foreground mt-1">100% cleared balances</p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="surface-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex rounded-xl bg-muted/50 p-1">
            <button
              type="button"
              onClick={() => setTab("ALL")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === "ALL" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Customers ({totalCustomers})
            </button>
            <button
              type="button"
              onClick={() => setTab("OWING")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === "OWING" ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Owing Customers ({owingCount})
            </button>
            <button
              type="button"
              onClick={() => setTab("SETTLED")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === "SETTLED" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Settled / Clear ({totalCustomers - owingCount})
            </button>
          </div>

          {/* Search & Branch */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px] justify-end">
            <div className="w-40">
              <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                <option value="ALL">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer name or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground bg-muted/40 text-xs uppercase tracking-wider">
              <tr className="border-b border-border">
                <th className="px-4 py-3">Customer Profile</th>
                <th className="px-3 py-3">Shop</th>
                <th className="px-3 py-3 text-right">Total Purchases</th>
                <th className="px-3 py-3 text-right">Total Paid</th>
                <th className="px-4 py-3 text-right">Balance Owed</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((customer) => (
                <tr key={customer.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${customer.id}`} className="font-semibold text-primary hover:underline">
                      {customer.name}
                    </Link>
                    <p className="text-xs text-muted-foreground font-mono">{customer.phone}</p>
                  </td>

                  <td className="px-3 py-3">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">{customer.branch.code}</span>
                  </td>

                  <td className="px-3 py-3 text-right tabular-nums font-mono font-medium">
                    {formatCurrency(customer.totalPurchases)}
                  </td>

                  <td className="px-3 py-3 text-right tabular-nums font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(customer.totalPaid)}
                  </td>

                  <td className="px-4 py-3 text-right tabular-nums font-mono font-bold">
                    <span className={customer.isOwing ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                      {formatCurrency(customer.balanceOwed)}
                    </span>
                  </td>

                  <td className="px-3 py-3 text-center">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        customer.isOwing
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      }`}
                    >
                      {customer.isOwing ? "Owing" : "Clear"}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <Button asChild size="sm" variant="ghost" className="h-8 text-xs font-medium">
                      <Link href={`/customers/${customer.id}`}>
                        Statement <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No customers found matching the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
