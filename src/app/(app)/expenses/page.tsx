import { createExpense, getFinance } from "@/app/actions/finance"
import { getBranches } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { canManageFinance } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { ExpensesList } from "./expenses-list"

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
        <ExpensesList expenses={finance.expenses} />
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
