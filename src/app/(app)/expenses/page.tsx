import { createExpense, getFinance } from "@/app/actions/finance"
import { getBranches } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { canManageFinance } from "@/lib/rbac"
import { requireUser } from "@/lib/session"
import { formatCurrency, money } from "@/lib/utils"
import { shopCashOnHand } from "@/lib/shop-cash"
import { ExpensesList } from "./expenses-list"

export default async function ExpensesPage() {
  const me = await requireUser()
  const [finance, branches, canPost] = await Promise.all([
    getFinance(),
    getBranches(),
    canManageFinance(me.role),
  ])
  const shopId = me.branchId || branches[0]?.id
  const till = shopId ? await shopCashOnHand(shopId) : null
  const pendingWaiting = finance.expenses
    .filter((row) => !row.approvedAt && (!shopId || row.branchId === shopId))
    .reduce((sum, row) => sum + money(row.amount), 0)
  const cashReady = Math.max(0, (till ? till.available : finance.cashAccount.balance) - pendingWaiting)

  return (
    <div className="page-split">
      <div>
        <PageHeader title="Shop expenses" description="Write the bill. A manager must say yes before money leaves. Cash bills cannot exceed cash in the till." />
        <ExpensesList
          expenses={finance.expenses.map((row) => ({
            id: row.id,
            description: row.description,
            expenseNumber: row.expenseNumber,
            category: row.category,
            amount: money(row.amount),
            when: (row.createdAt ?? row.date).toISOString(),
            approvedAt: row.approvedAt?.toISOString() ?? null,
            shop: row.branch.name ?? row.branch.code,
          }))}
        />
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Ask for this shop bill</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Cash in the till now: <span className="num font-semibold text-foreground">{formatCurrency(cashReady)}</span>
          {cashReady <= 0
            ? " There is no cash to take out. Collect a cash sale first, or pay from the bank."
            : " A cash bill cannot be more than this."}
        </p>
        {canPost ? (
        <ActionForm action={createExpense} submit="Save this shop bill" className="space-y-3">
          <Select name="branchId" required defaultValue={shopId || undefined}>
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
          <Input name="amount" type="number" placeholder="Amount in naira" required max={cashReady > 0 ? cashReady : undefined} />
          <Input name="description" placeholder="What this bill is for" required />
        </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">You can read the list. A manager writes a new bill.</p>
        )}
      </div>
    </div>
  )
}
