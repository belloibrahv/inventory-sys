import { createSupplier, getSuppliers } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader, SectionCard } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { money } from "@/lib/utils"
import { SuppliersList } from "./suppliers-list"

export default async function SuppliersPage() {
  const raw = await getSuppliers()
  const suppliers = raw.map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    kind: supplier.kind,
    phone: supplier.phone,
    city: supplier.city,
    country: supplier.country,
    purchases: supplier.purchases.map((purchase) => ({
      id: purchase.id,
      invoiceNumber: purchase.invoiceNumber,
      totalAmount: money(purchase.totalAmount),
      paidAmount: money(purchase.paidAmount),
      returnedAmount: money(purchase.returnedAmount),
      status: purchase.status,
      createdAt: purchase.createdAt.toISOString(),
      branchCode: purchase.branch.code,
      branchName: purchase.branch.name,
    })),
    creditBalance: money(supplier.creditBalance),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Bought, paid, still owed, and they owe us."
      />

      <div className="page-split">
        <SuppliersList suppliers={suppliers} />

        <SectionCard title="Add a supplier" description="One name and one phone for one house.">
          <ActionForm action={createSupplier} submit="Save this supplier" className="space-y-3">
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
        </SectionCard>
      </div>
    </div>
  )
}
