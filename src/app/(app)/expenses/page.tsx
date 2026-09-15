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
        <PageHeader title="Operating Expenses (OPEX)" description="Operational disbursements, utilities, logistics, and payroll. Vouchers require managerial sign-off prior to cash disbursement." />
        <ExpensesList expenses={finance.expenses} />
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Submit Expense Requisition</h3>
        <p className="mb-4 text-sm text-muted-foreground">Disbursements require supervisor approval before funds are released from the branch register.</p>
        {canPost ? (
        <ActionForm action={createExpense} submit="Submit Requisition" className="space-y-3">
          <Select name="branchId" required>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </Select>
          <Select name="category" defaultValue="MISCELLANEOUS">
            {[
              ["TRANSPORT", "Logistics & Transport"],
              ["FUEL", "Fuel & Energy"],
              ["RENT", "Facility Lease & Rent"],
              ["UTILITIES", "Utilities & Power"],
              ["REPAIRS", "Maintenance & Repairs"],
              ["SALARY", "Payroll & Staff Allowances"],
              ["MARKETING", "Marketing & Promotions"],
              ["MISCELLANEOUS", "General Operational Overhead"],
            ].map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <Input name="amount" type="number" placeholder="Voucher Amount" required />
          <Input name="description" placeholder="Business Purpose / Description" required />
        </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">Read-only access to expense ledgers. Requisition privileges required to submit new expense vouchers.</p>
        )}
      </div>
    </div>
  )
}
