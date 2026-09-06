import Link from "next/link"
import { createCustomer, getBranches, getCustomers } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency, money } from "@/lib/utils"

export default async function CustomersPage() {
  const [customers, branches] = await Promise.all([getCustomers(), getBranches()])
  return (
    <div className="page-split">
      <div className="min-w-0">
        <PageHeader title="Customers" description="Customer names, what they bought, and what they still owe. Money they pay later is recorded here. The old invoice is not changed." />
        <div className="surface-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Sales</th>
                <th className="px-4 py-3">Balance</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="border-b border-border/70">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${customer.id}`} className="font-medium text-primary">{customer.name}</Link>
                    <p className="text-xs text-muted-foreground">{customer.phone}</p>
                  </td>
                  <td className="px-4 py-3">{customer.branch.code}</td>
                  <td className="px-4 py-3">{customer._count.sales}</td>
                  <td className="px-4 py-3">{formatCurrency(money(customer.currentBalance))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  )
}
