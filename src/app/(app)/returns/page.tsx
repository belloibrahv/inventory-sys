import { getReturns, getSoldImeis } from "@/app/actions/ops"
import { PageHeader } from "@/components/shared"
import { money } from "@/lib/utils"
import { ReturnForm } from "./return-form"
import { ReturnsList } from "./returns-list"

export default async function ReturnsPage() {
  const [rows, sold] = await Promise.all([getReturns(), getSoldImeis()])
  return (
    <div className="page-split">
      <div>
        <PageHeader
          title="Returns"
          description="A buyer brings a phone back. The old bill stays as it was. After the boss says yes, you can refund, give credit, repair, replace, or send it to the supplier."
        />
        <ReturnsList rows={rows} />
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Log a return</h3>
        <ReturnForm
          sold={sold.map((row) => ({
            id: row.id,
            imei1: row.imei1,
            product: {
              name: row.product.name,
              sellingPrice: money(row.product.sellingPrice),
              warrantyDays: row.product.warrantyDays,
            },
            customer: row.customer ? { name: row.customer.name } : null,
            sale: row.sale
              ? {
                  invoiceNumber: row.sale.invoiceNumber,
                  saleDate: row.sale.saleDate,
                  items: row.sale.items.map((item) => ({
                    imeiId: item.imeiId,
                    totalPrice: money(item.totalPrice),
                  })),
                }
              : null,
            branch: { code: row.branch.code },
          }))}
        />
      </div>
    </div>
  )
}
