import Link from "next/link"
import { getProducts } from "@/app/actions/catalog"
import { createPurchase, getPurchases } from "@/app/actions/ops"
import { getBranches, getSuppliers } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency, money } from "@/lib/utils"

export default async function PurchasesPage() {
  const [purchases, suppliers, products, branches] = await Promise.all([
    getPurchases(),
    getSuppliers(),
    getProducts(),
    getBranches(),
  ])

  return (
    <div className="page-split">
      <div>
        <PageHeader title="Goods from supplier" description="Order goods, wait for them, check them, type the IMEIs, then they are in the shop." />
        <WorkflowSteps current={0} steps={["Order", "On the way", "Check goods", "Enter IMEIs", "In shop"]} />
        <div className="space-y-3">
          {purchases.map((purchase) => (
            <Link key={purchase.id} href={`/purchases/${purchase.id}`} className="surface-card block p-5 hover:bg-muted/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{purchase.invoiceNumber}</p>
                  <p className="text-sm text-muted-foreground">{purchase.supplier.name} · {purchase.branch.code}</p>
                  <p className="mt-1 text-sm">{purchase.items[0]?.product.name} × {purchase.items[0]?.quantity}</p>
                </div>
                <StatusBadge value={purchase.status} />
              </div>
              <p className="mt-3 text-sm">
                {formatCurrency(money(purchase.totalAmount))} · received {purchase.items[0]?.receivedQty ?? 0}
                {" · "}owed {formatCurrency(money(purchase.totalAmount) - money(purchase.paidAmount))}
              </p>
            </Link>
          ))}
        </div>
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">New purchase order</h3>
        <ActionForm action={createPurchase} className="space-y-3">
          <Select name="supplierId" required>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </Select>
          <Select name="branchId" required>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </Select>
          <Select name="productId" required>
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </Select>
          <Input name="quantity" type="number" placeholder="Expected quantity" required />
          <Input name="costPrice" type="number" placeholder="Unit cost" required />
        </ActionForm>
      </div>
    </div>
  )
}
