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
        <PageHeader title="Shop expenses" description="Write the bill. A manager must say yes before money leaves." />
        <ExpensesList expenses={finance.expenses} />
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Ask for this shop bill</h3>
        {canPost ? (
        <ActionForm action={createExpense} submit="Save this shop bill" className="space-y-3">
          <Select name="branchId" required>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </Select>
          <Select name="category" defaultValue="MISCELLANEOUS">
            {[
              ["TRANSPORT", "Transport"],
              ["FUEL", "Fuel"],
              ["RENT", "Rent"],
              ["UTILITIES", "Light bill"],
              ["REPAIRS", "Repairs"],
              ["SALARY", "Salary"],
              ["MARKETING", "Marketing"],
              ["MISCELLANEOUS", "Other shop bill"],
            ].map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <Input name="amount" type="number" placeholder="Amount in naira" required />
          <Input name="description" placeholder="What this bill is for" required />
        </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">You can read the list. A manager writes a new bill.</p>
        )}
      </div>
    </div>
  )
}
