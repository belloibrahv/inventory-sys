import { createCustomer, getBranches, getCustomers } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { money } from "@/lib/utils"
import { CustomersClientView } from "./customers-client-view"

export default async function CustomersPage() {
  const [rawCustomers, branches] = await Promise.all([getCustomers(), getBranches()])

  const customers = rawCustomers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    currentBalance: money(c.currentBalance),
    creditLimit: money(c.creditLimit),
    branch: { id: c.branch.id, name: c.branch.name, code: c.branch.code },
    sales: c.sales.map((s) => ({
      totalAmount: money(s.totalAmount),
      paidAmount: money(s.paidAmount),
    })),
    _count: c._count,
  }))

  const branchList = branches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name, code: b.code }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Everyone who has bought from us. See what they bought, what they paid, and what they still owe."
      />

      <div className="page-split">
        <div className="min-w-0">
          <CustomersClientView customers={customers} branches={branchList} />
        </div>
        <div className="surface-card p-5">
          <h3 className="mb-4 font-semibold">New customer</h3>
          <ActionForm action={createCustomer} className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Full name</span>
              <Input name="name" required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Phone</span>
              <Input name="phone" required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Email</span>
              <Input name="email" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Address</span>
              <Input name="address" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Shop</span>
              <Select name="branchId" required>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </Select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Credit limit</span>
              <Input name="creditLimit" type="number" />
            </label>
          </ActionForm>
        </div>
      </div>
    </div>
  )
}

