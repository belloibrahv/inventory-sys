import Link from "next/link"
import { createSupplier, getSuppliers } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency, money } from "@/lib/utils"

export default async function SuppliersPage() {
  const suppliers = await getSuppliers()

  const totalInvoiced = suppliers.reduce((sum, s) => sum + s.purchases.reduce((acc, p) => acc + money(p.totalAmount), 0), 0)
  const totalPaid = suppliers.reduce((sum, s) => sum + s.purchases.reduce((acc, p) => acc + money(p.paidAmount), 0), 0)
  const totalOwed = Math.max(0, totalInvoiced - totalPaid)
  const owingCount = suppliers.filter((s) => s.purchases.reduce((acc, p) => acc + money(p.totalAmount) - money(p.paidAmount), 0) > 0).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Vendor transaction accounts and cartons. Track total purchases, amounts paid, and outstanding balances owed to suppliers."
      />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-4">
          <span className="text-xs font-medium uppercase text-muted-foreground">Total Suppliers</span>
          <p className="mt-1 text-2xl font-bold">{suppliers.length}</p>
          <p className="text-xs text-muted-foreground mt-1">{owingCount} vendor(s) currently owed</p>
        </div>

        <div className="surface-card p-4">
          <span className="text-xs font-medium uppercase text-muted-foreground">Total Stock Invoiced</span>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(totalInvoiced)}</p>
          <p className="text-xs text-muted-foreground mt-1">Total value of cartons purchased</p>
        </div>

        <div className="surface-card p-4">
          <span className="text-xs font-medium uppercase text-muted-foreground">Total Amount Paid</span>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-muted-foreground mt-1">Disbursements & settlements</p>
        </div>

        <div className="surface-card p-4">
          <span className="text-xs font-medium uppercase text-muted-foreground">Total Balance Owed</span>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(totalOwed)}</p>
          <p className="text-xs text-muted-foreground mt-1">Outstanding supplier payables</p>
        </div>
      </div>

      <div className="page-split">
        <div>
          <div className="surface-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground bg-muted/40 text-xs uppercase tracking-wider">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-3 py-3">From</th>
                    <th className="px-3 py-3 text-right">Purchased</th>
                    <th className="px-3 py-3 text-right">Amount Paid</th>
                    <th className="px-4 py-3 text-right">Still Owed</th>
                    <th className="px-3 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {suppliers.map((supplier) => {
                    const purchased = supplier.purchases.reduce((sum, row) => sum + money(row.totalAmount), 0)
                    const paid = supplier.purchases.reduce((sum, row) => sum + money(row.paidAmount), 0)
                    const owed = Math.max(0, purchased - paid)
                    const isSettled = owed === 0

                    return (
                      <tr key={supplier.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/suppliers/${supplier.id}`} className="font-semibold text-primary hover:underline">
                            {supplier.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {supplier.kind === "NEIGHBOR" ? "Neighboring shop" : "Carton Supplier"} · {supplier.phone}
                          </p>
                        </td>

                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {[supplier.city, supplier.country].filter(Boolean).join(", ") || "Unset"}
                        </td>

                        <td className="px-3 py-3 text-right tabular-nums font-mono font-medium">
                          {formatCurrency(purchased)}
                        </td>

                        <td className="px-3 py-3 text-right tabular-nums font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(paid)}
                        </td>

                        <td className="px-4 py-3 text-right tabular-nums font-mono font-bold text-foreground">
                          {formatCurrency(owed)}
                        </td>

                        <td className="px-3 py-3 text-center">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              isSettled
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                            }`}
                          >
                            {isSettled ? "Settled" : "Owing"}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="surface-card p-5">
          <h3 className="mb-4 font-semibold">Add supplier</h3>
          <ActionForm action={createSupplier} className="space-y-3">
            <Select name="kind" defaultValue="SUPPLIER">
              <option value="SUPPLIER">Supplier of cartons</option>
              <option value="NEIGHBOR">Neighboring shop we fill from</option>
            </Select>
            <Input name="name" placeholder="Name" required />
            <Input name="phone" placeholder="Phone" required />
            <Input name="country" placeholder="Country, such as China or UAE" />
            <Input name="city" placeholder="City or market" />
            <Input name="contactPerson" placeholder="Contact person" />
            <Input name="email" placeholder="Email" />
            <Input name="address" placeholder="Address" />
          </ActionForm>
        </div>
      </div>
    </div>
  )
}

