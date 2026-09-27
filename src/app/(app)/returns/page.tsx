import Link from "next/link"
import { Plus } from "lucide-react"
import { getInStockForReplace, getReturns } from "@/app/actions/ops"
import { PageHeader } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { money } from "@/lib/utils"
import { ReturnsList } from "./returns-list"

export default async function ReturnsPage() {
  const [rows, stock] = await Promise.all([getReturns(), getInStockForReplace()])
  return (
    <div className="space-y-6">
      <div className="space-y-5">
        <PageHeader
          title="Returns"
          description="Return value, replacement value, and the balance. Stock and money move after approval."
          actions={
            <Button asChild>
              <Link href="/returns/new">
                <Plus className="mr-1.5 h-4 w-4" /> Log a return
              </Link>
            </Button>
          }
        />
        <ReturnsList
          // Only what the list shows. Spreading the whole row sent the staff
          // member's login record, password hash included, to the browser.
          rows={rows.map((row) => ({
            id: row.id,
            returnNumber: row.returnNumber,
            status: row.status,
            reason: row.reason,
            outcome: row.outcome,
            faultClass: row.faultClass,
            notes: row.notes,
            refundAmount: row.refundAmount != null ? money(row.refundAmount) : null,
            createdAt: row.createdAt,
            approvedAt: row.approvedAt,
            completedAt: row.completedAt,
            customer: { id: row.customer.id, name: row.customer.name },
            invoice: row.invoice
              ? {
                  id: row.invoice.id,
                  invoiceNumber: row.invoice.invoiceNumber,
                  total: money(row.invoice.totalAmount),
                  paid: money(row.invoice.paidAmount),
                }
              : null,
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
            saleItem: row.saleItem
              ? {
                  id: row.saleItem.id,
                  productName: row.saleItem.product.name,
                  quantity: row.saleItem.quantity,
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
    </div>
  )
}
