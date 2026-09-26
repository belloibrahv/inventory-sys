"use client"

import { useMemo, useState } from "react"
import { FileSpreadsheet } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/data-table"
import { FilterChips } from "@/components/filter-chips"
import { StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { downloadTable } from "@/lib/download-table"
import { formatShopWhen } from "@/lib/lagos-day"
import { statusLabel } from "@/lib/status"
import { formatCurrency } from "@/lib/utils"

export type ExpenseRow = {
  id: string
  description: string
  expenseNumber: string
  category: string
  amount: number
  when: string
  approvedAt: string | null
  shop: string
}

type ExpenseFilter = "all" | "waiting" | "approved"

export function ExpensesList({ expenses }: { expenses: ExpenseRow[] }) {
  const [status, setStatus] = useState<ExpenseFilter>("all")

  const filtered = useMemo(
    () =>
      expenses.filter((expense) => {
        if (status === "waiting") return !expense.approvedAt
        if (status === "approved") return Boolean(expense.approvedAt)
        return true
      }),
    [expenses, status]
  )
  const counts = useMemo(
    () => ({
      all: expenses.length,
      waiting: expenses.filter((expense) => !expense.approvedAt).length,
      approved: expenses.filter((expense) => Boolean(expense.approvedAt)).length,
    }),
    [expenses]
  )

  const columns: DataColumn<ExpenseRow>[] = [
    {
      id: "expense",
      header: "Expense",
      sortValue: (row) => row.description,
      cell: (row) => (
        <div>
          <p className="font-medium">{row.description}</p>
          <p className="text-xs text-muted-foreground">{row.expenseNumber}</p>
        </div>
      ),
    },
    { id: "category", header: "Category", sortValue: (row) => statusLabel(row.category), cell: (row) => statusLabel(row.category) },
    { id: "shop", header: "Shop", hideBelow: "lg", sortValue: (row) => row.shop, cell: (row) => <span className="whitespace-nowrap">{row.shop}</span> },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      sortValue: (row) => row.amount,
      cell: (row) => <span className="font-medium">{formatCurrency(row.amount)}</span>,
    },
    {
      id: "approval",
      header: "Approval",
      sortValue: (row) => (row.approvedAt ? 1 : 0),
      cell: (row) => <StatusBadge value={row.approvedAt ? "APPROVED" : "PENDING"} />,
    },
    {
      id: "when",
      header: "When",
      sortValue: (row) => row.when,
      cell: (row) => (
        <div className="whitespace-nowrap">
          <p className="tabular-nums">{formatShopWhen(row.when)}</p>
          {row.approvedAt ? <p className="text-xs text-muted-foreground">Approved {formatShopWhen(row.approvedAt)}</p> : null}
        </div>
      ),
    },
  ]

  const exportRows = (rows: ExpenseRow[]) => [
    ["Expense", "Number", "Category", "Shop", "Amount", "Approved", "When"],
    ...rows.map((row) => [
      row.description,
      row.expenseNumber,
      statusLabel(row.category),
      row.shop,
      row.amount,
      row.approvedAt ? formatShopWhen(row.approvedAt) : "Waiting",
      formatShopWhen(row.when),
    ]),
  ]

  return (
    <DataTable
      rows={filtered}
      columns={columns}
      rowKey={(row) => row.id}
      noun="expenses"
      filterKey={status}
      initialSort={{ id: "when", dir: "desc" }}
      searchText={(row) => [row.description, row.expenseNumber, statusLabel(row.category), row.shop].join(" ")}
      searchPlaceholder="Search what it was for, number or shop"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10"
          onClick={() => downloadTable(exportRows(filtered), "expenses.xlsx", "xlsx")}
          aria-label="Download these expenses as Excel"
        >
          <FileSpreadsheet className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Excel</span>
        </Button>
      }
      filters={
        <FilterChips
          label="Approval"
          activeKey={status}
          onSelect={(key) => setStatus(key as ExpenseFilter)}
          chips={[
            { key: "all", label: "All", count: counts.all },
            { key: "waiting", label: "Waiting", count: counts.waiting, tone: "warning" },
            { key: "approved", label: "Approved", count: counts.approved, tone: "success" },
          ]}
        />
      }
      card={(row) => ({
        title: row.description,
        subtitle: `${statusLabel(row.category)} · ${row.shop}`,
        value: formatCurrency(row.amount),
        badge: <StatusBadge value={row.approvedAt ? "APPROVED" : "PENDING"} />,
        meta: <span>{formatShopWhen(row.when)}</span>,
      })}
      footer={(rows) => (
        <tr>
          <td colSpan={2} className="text-sm">Total for {rows.length} expense{rows.length === 1 ? "" : "s"}</td>
          <td className="hidden lg:table-cell" />
          <td className="whitespace-nowrap text-right tabular-nums">{formatCurrency(rows.reduce((sum, row) => sum + row.amount, 0))}</td>
          <td colSpan={2} />
        </tr>
      )}
      empty={expenses.length === 0 ? "No expenses recorded yet." : "No expense matches this filter."}
    />
  )
}
