import { getInStockForReplace, getSoldImeis } from "@/app/actions/ops"
import { prisma } from "@/lib/prisma"
import { FormScreen } from "@/components/shared"
import { money } from "@/lib/utils"
import { requireUser } from "@/lib/session"
import { canSendToSupplier } from "@/lib/rbac"
import { ReturnForm } from "../return-form"

export default async function LogReturnPage() {
  const [sold, stock, me, bankAccounts] = await Promise.all([
    getSoldImeis(),
    getInStockForReplace(),
    requireUser(),
    // A refund or a replacement difference is paid by bank from a named account.
    prisma.bankAccount.findMany({
      where: { isActive: true },
      include: { branch: { select: { name: true } } },
      orderBy: [{ bankName: "asc" }, { accountNumber: "asc" }],
    }),
  ])
  const fullControl = canSendToSupplier(me.role)
  return (
    <FormScreen
      title="Log a return"
      description={
        fullControl
          ? "Phones and laptops: pick by IMEI. Accessories, cords and other items: look up the invoice number. It takes effect as soon as you save it."
          : "A return comes back into this shop, as a replacement from our stock or a refund by bank. Phones and laptops by IMEI, other items by invoice. It takes effect as soon as you save it."
      }
      backHref="/returns"
    >
      <ReturnForm
        fullControl={fullControl}
        banks={bankAccounts.map((bank) => ({
          id: bank.id,
          branchId: bank.branchId,
          label: `${bank.bankName} ${bank.accountNumber}${bank.accountName ? ` · ${bank.accountName}` : ""} (${bank.branch.name})`,
        }))}
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
