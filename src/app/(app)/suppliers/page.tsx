import Link from "next/link"
import { createSupplier, getSuppliers } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency, money } from "@/lib/utils"

export default async function SuppliersPage() {
  const suppliers = await getSuppliers()
  return (
    <div className="page-split">
      <div>
        <PageHeader title="Suppliers" description="People and firms who send cartons to Abu Twins from other countries and cities. A neighboring dealer you buy one unit from for a customer belongs on Neighbor shop fill, not here." />
        <div className="surface-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">POs</th>
                <th className="px-4 py-3">IMEIs</th>
                <th className="px-4 py-3">Still owed</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-b border-border/70">
                  <td className="px-4 py-3">
                    <Link href={`/suppliers/${supplier.id}`} className="font-medium text-primary">{supplier.name}</Link>
                    <p className="text-muted-foreground">{supplier.kind === "NEIGHBOR" ? "Neighboring shop" : "Supplier"}</p>
                  </td>
                  <td className="px-4 py-3">{[supplier.city, supplier.country].filter(Boolean).join(", ") || "Not set"}</td>
                  <td className="px-4 py-3">{supplier.phone}</td>
                  <td className="px-4 py-3">{supplier._count.purchases}</td>
                  <td className="px-4 py-3">{supplier._count.imeiRecords}</td>
                  <td className="px-4 py-3">
                    {formatCurrency(supplier.purchases.reduce((sum, row) => sum + money(row.totalAmount) - money(row.paidAmount), 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  )
}
