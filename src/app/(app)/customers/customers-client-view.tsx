"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Coins, UserCheck, Users, Wallet } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/data-table"
import { FilterChips } from "@/components/filter-chips"
import { Select } from "@/components/ui/select"
import { ShopTag, StatCard, StatGrid, TonePill } from "@/components/shared"
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
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("ALL")
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

  const filtered = useMemo(
    () =>
      accounts.filter((account) => {
        if (tab === "OWING" && !account.isOwing) return false
        if (tab === "CLEAR" && account.isOwing) return false
        if (branchFilter !== "ALL" && account.branch.id !== branchFilter) return false
        return true
      }),
    [accounts, tab, branchFilter]
  )

  type Account = (typeof accounts)[number]
  const columns: DataColumn<Account>[] = [
    {
      id: "name",
      header: "Customer",
      sortValue: (row) => row.name,
      cell: (row) => (
        <div>
          <Link href={`/customers/${row.id}`} className="font-medium text-primary hover:underline">
            {row.name}
          </Link>
          <p className="font-mono text-xs text-muted-foreground">{row.phone}</p>
        </div>
      ),
    },
    { id: "shop", header: "Shop", hideBelow: "lg", sortValue: (row) => row.branch.name, cell: (row) => <ShopTag>{row.branch.code}</ShopTag> },
    { id: "sales", header: "Sales", align: "right", hideBelow: "lg", sortValue: (row) => row._count.sales, cell: (row) => <span className="text-muted-foreground">{row._count.sales}</span> },
    { id: "bought", header: "Bought", align: "right", sortValue: (row) => row.purchased, cell: (row) => <span className="font-medium">{formatCurrency(row.purchased)}</span> },
    { id: "paid", header: "Paid us", align: "right", hideBelow: "xl", sortValue: (row) => row.paid, cell: (row) => <span className="text-success">{formatCurrency(row.paid)}</span> },
    {
      id: "owes",
      header: "Still owes",
      align: "right",
      sortValue: (row) => row.owed,
      cell: (row) =>
        row.isOwing ? <TonePill tone="warning">{formatCurrency(row.owed)}</TonePill> : <TonePill tone="success">Paid up</TonePill>,
    },
  ]

  return (
    <div className="space-y-5">
      <StatGrid>
        <StatCard
          label="Customers"
          value={String(accounts.length)}
          hint="Anybody whose name has been on a sale"
          icon={<Users className="h-4 w-4" />}
          onClick={() => setTab("ALL")}
        />
        <StatCard
          label="Bought, all time"
          value={formatCurrency(lifetime)}
          hint="What everything they took is worth"
          icon={<Coins className="h-4 w-4" />}
          tone="primary"
        />
        <StatCard
          label="Still owed to us"
          value={formatCurrency(totalOwed)}
          hint={`${owingCount} customer${owingCount === 1 ? "" : "s"} owing`}
          icon={<Wallet className="h-4 w-4" />}
          tone={totalOwed > 0 ? "warning" : "neutral"}
          onClick={() => setTab("OWING")}
        />
        <StatCard
          label="Paid up"
          value={String(accounts.length - owingCount)}
          hint="They owe us nothing today"
          icon={<UserCheck className="h-4 w-4" />}
          tone="success"
          onClick={() => setTab("CLEAR")}
        />
      </StatGrid>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(row) => row.id}
        noun="customers"
        filterKey={`${tab}|${branchFilter}`}
        onRowClick={(row) => router.push(`/customers/${row.id}`)}
        searchText={(row) => [row.name, row.phone, row.email, row.branch.name].filter(Boolean).join(" ")}
        searchPlaceholder="Find by name or phone"
        actions={
          branches.length > 1 ? (
            <Select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="h-10 w-32 sm:w-44" aria-label="Shop">
              <option value="ALL">All shops</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          ) : null
        }
        filters={
          <FilterChips
            label="Show"
            activeKey={tab}
            onSelect={(key) => setTab(key as Tab)}
            chips={[
              { key: "ALL", label: "Everyone", count: accounts.length },
              { key: "OWING", label: "Still owing", count: owingCount, tone: "warning" },
              { key: "CLEAR", label: "Paid up", count: accounts.length - owingCount, tone: "success" },
            ]}
          />
        }
        card={(row) => ({
          title: row.name,
          subtitle: `${row.phone} · ${row.branch.name}`,
          value: formatCurrency(row.purchased),
          valueHint: row.isOwing ? <span className="text-warning">Owes {formatCurrency(row.owed)}</span> : <span className="text-success">Paid up</span>,
        })}
        empty="No customer matches that filter or shop."
      />
    </div>
  )
}
