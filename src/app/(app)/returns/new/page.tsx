import { getInStockForReplace, getSoldImeis } from "@/app/actions/ops"
import { FormScreen } from "@/components/shared"
import { money } from "@/lib/utils"
import { requireUser } from "@/lib/session"
import { canSendToSupplier } from "@/lib/rbac"
import { ReturnForm } from "../return-form"

export default async function LogReturnPage() {
  const [sold, stock, me] = await Promise.all([getSoldImeis(), getInStockForReplace(), requireUser()])
  const fullControl = canSendToSupplier(me.role)
  return (
    <FormScreen
      title="Log a return"
      description={
        fullControl
          ? "Phones and laptops: pick by IMEI. Accessories, cords and other items: look up the invoice number. It waits for approval before stock or money moves."
          : "A return comes back into this shop, as a replacement from our stock or a refund by bank. Phones and laptops by IMEI, other items by invoice. It waits for a manager's approval."
      }
      backHref="/returns"
    >
      <ReturnForm
        fullControl={fullControl}
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
