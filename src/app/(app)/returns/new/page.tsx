import { getInStockForReplace, getSoldImeis } from "@/app/actions/ops"
import { FormScreen } from "@/components/shared"
import { money } from "@/lib/utils"
import { ReturnForm } from "../return-form"

export default async function LogReturnPage() {
  const [sold, stock] = await Promise.all([getSoldImeis(), getInStockForReplace()])
  return (
    <FormScreen
      title="Log a return"
      description="Phones and laptops: pick by IMEI. Accessories, cords and other items: look up the invoice number. It waits for approval before stock or money moves."
      backHref="/returns"
    >
      <ReturnForm
        successHref="/returns"
        sold={sold.map((row) => ({
          id: row.id,
          imei1: row.imei1,
          serialNumber: row.serialNumber,
          branchId: row.branchId,
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
        stock={stock.map((row) => ({
          id: row.id,
          imei1: row.imei1,
          serialNumber: row.serialNumber,
          branchId: row.branchId,
          product: { name: row.product.name, sellingPrice: money(row.product.sellingPrice) },
        }))}
      />
    </FormScreen>
  )
}
