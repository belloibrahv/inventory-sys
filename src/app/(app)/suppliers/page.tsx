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
      status: purchase.status,
      createdAt: purchase.createdAt.toISOString(),
      branchCode: purchase.branch.code,
      branchName: purchase.branch.name,
    })),
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="What we bought from each supplier, what we paid, and what we still owe. Click a box to see the houses that make that number. Click a house to open its bills. Each house is one name and one phone."
      />

      <div className="page-split">
        <SuppliersList suppliers={suppliers} />

        <SectionCard title="Add a supplier">
          <p className="mb-3 text-sm text-muted-foreground">
            Use one name for one house. A second spelling of the same name, or the same phone with extra spaces, is refused. Pick the name already on the list instead.
          </p>
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
