import { getInStockForReplace, getReturns, getSoldImeis } from "@/app/actions/ops"
import { PageHeader } from "@/components/shared"
import { money } from "@/lib/utils"
import { ReturnForm } from "./return-form"
import { ReturnsList } from "./returns-list"

export default async function ReturnsPage() {
  const [rows, sold, stock] = await Promise.all([getReturns(), getSoldImeis(), getInStockForReplace()])
  return (
    <div className="page-split">
      <div>
        <PageHeader
          title="Returns"
          description="Return value, replacement value, and the balance. Stock and money move after approval."
        />
        <ReturnsList
          rows={rows.map((row) => ({
            ...row,
            returnValue: row.returnValue != null ? money(row.returnValue) : row.refundAmount != null ? money(row.refundAmount) : null,
            replacementValue: row.replacementValue != null ? money(row.replacementValue) : null,
            balanceAmount: row.balanceAmount != null ? money(row.balanceAmount) : null,
            imei: row.imei
              ? {
                  id: row.imei.id,
                  imei1: row.imei.imei1,
                  serialNumber: row.imei.serialNumber,
                  productName: row.imei.product.name,
                }
              : null,
            replacementImei: row.replacementImei
              ? {
                  id: row.replacementImei.id,
                  imei1: row.replacementImei.imei1,
                  serialNumber: row.replacementImei.serialNumber,
                  productName: row.replacementImei.product.name,
                }
              : null,
          }))}
          stock={stock.map((row) => ({
            id: row.id,
            imei1: row.imei1,
            serialNumber: row.serialNumber,
            branchId: row.branchId,
            product: { name: row.product.name, sellingPrice: money(row.product.sellingPrice) },
          }))}
        />
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-4 font-semibold">Log a return</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Show the goods and the money. Pick Replace to choose what goes out and see Receivable or Payable.
        </p>
        <ReturnForm
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
      </div>
    </div>
  )
}
