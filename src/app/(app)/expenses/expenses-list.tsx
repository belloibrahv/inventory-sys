"use client"

import { useMemo, useState } from "react"
import { FilterChips } from "@/components/filter-chips"
import { StatusBadge } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { formatShopWhen } from "@/lib/lagos-day"
import { formatCurrency, money } from "@/lib/utils"

type ExpenseRow = {
  id: string
  description: string
  expenseNumber: string
  date: Date
  category: string
  amount: unknown
  approvedAt: Date | null
  createdAt?: Date
  branch: { code: string }
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

  const pager = usePagedRows(filtered, status)

  return (
    <div className="space-y-4">
      <div className="surface-card p-4">
        <FilterChips
          label="Approval"
          activeKey={status}
          onSelect={(key) => setStatus(key as ExpenseFilter)}
          chips={[
            { key: "all", label: "All expenses", count: counts.all },
            { key: "waiting", label: "Waiting", count: counts.waiting, tone: "warning" },
            { key: "approved", label: "Approved", count: counts.approved, tone: "success" },
          ]}
        />
      </div>

      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3">Expense</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Approval</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageRows.map((expense) => (
              <tr key={expense.id} className="border-b border-border/70">
                <td className="px-4 py-3">
                  <p className="font-medium">{expense.description}</p>
                  <p className="text-xs text-muted-foreground">{expense.expenseNumber}</p>
                </td>
                <td className="px-4 py-3">{expense.category}</td>
                <td className="px-4 py-3">{expense.branch.code}</td>
                <td className="px-4 py-3">{formatCurrency(money(expense.amount))}</td>
                <td className="px-4 py-3">
                  <StatusBadge value={expense.approvedAt ? "APPROVED" : "PENDING"} />
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium tabular-nums">{formatShopWhen(expense.createdAt ?? expense.date)}</p>
                  {expense.approvedAt ? (
                    <p className="text-xs text-muted-foreground">Approved {formatShopWhen(expense.approvedAt)}</p>
                  ) : null}
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-sm text-muted-foreground" colSpan={6}>
                  {expenses.length === 0
                    ? "No expenses recorded yet."
                    : "No expense matches this filter. Tap another chip above."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <TablePager
          page={pager.page}
          pageCount={pager.pageCount}
          pageSize={pager.pageSize}
          total={pager.total}
          start={pager.start}
          end={pager.end}
          onPageChange={pager.setPage}
          onPageSizeChange={pager.setPageSize}
          noun="expenses"
        />
      </div>
    </div>
  )
}
