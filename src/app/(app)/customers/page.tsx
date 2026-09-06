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
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <div>
        <PageHeader title="Customers" description="Customer names, what they bought, and what they still owe. Money they pay later is recorded here — the old invoice is not changed." />
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
        <ActionForm action={createCustomer} className="space-y-3">
          <Input name="name" placeholder="Full name" required />
          <Input name="phone" placeholder="Phone" required />
          <Input name="email" placeholder="Email" />
          <Input name="address" placeholder="Address" />
          <Select name="branchId" required>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </Select>
          <Input name="creditLimit" type="number" placeholder="Credit limit" />
        </ActionForm>
      </div>
    </div>
  )
}
