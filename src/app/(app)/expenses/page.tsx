import { createExpense, getFinance } from "@/app/actions/finance"
import { getBranches } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { canManageFinance } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { formatCurrency, formatDate, money } from "@/lib/utils"

export default async function ExpensesPage() {
  const me = await requireUser()
  const [finance, branches, canPost] = await Promise.all([
    getFinance(),
    getBranches(),
    canManageFinance(me.role),
  ])
  return (
    <div className="page-split">
      <div>
        <PageHeader title="Expenses" description="Fuel, rent, salary, light bill. Money does not leave until a manager says yes." />
        <WorkflowSteps current={0} steps={["Ask", "Manager says yes", "Pay out"]} />
        <div className="surface-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-3">Expense</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Approval</th>
              </tr>
            </thead>
            <tbody>
              {finance.expenses.map((expense) => (
                <tr key={expense.id} className="border-b border-border/70">
                  <td className="px-4 py-3">
                    <p className="font-medium">{expense.description}</p>
                    <p className="text-xs text-muted-foreground">{expense.expenseNumber} · {formatDate(expense.date)}</p>
                  </td>
                  <td className="px-4 py-3">{expense.category}</td>
                  <td className="px-4 py-3">{expense.branch.code}</td>
                  <td className="px-4 py-3">{formatCurrency(money(expense.amount))}</td>
                  <td className="px-4 py-3"><StatusBadge value={expense.approvedAt ? "APPROVED" : "PENDING"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Ask for money</h3>
        <p className="mb-4 text-sm text-muted-foreground">Money does not leave the shop until a manager says yes.</p>
        {canPost ? (
        <ActionForm action={createExpense} className="space-y-3">
          <Select name="branchId" required>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </Select>
          <Select name="category" defaultValue="MISCELLANEOUS">
            {[
              ["TRANSPORT", "Transport"],
              ["FUEL", "Fuel"],
              ["RENT", "Rent"],
              ["UTILITIES", "Light / water"],
              ["REPAIRS", "Repairs"],
              ["SALARY", "Salary"],
              ["MARKETING", "Marketing"],
              ["MISCELLANEOUS", "Other"],
            ].map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <Input name="amount" type="number" placeholder="Amount" required />
          <Input name="description" placeholder="Description" required />
        </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">You can see expenses, but The main admin must allow you before you can ask for one.</p>
        )}
      </div>
    </div>
  )
}
