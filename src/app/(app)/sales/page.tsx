import { ReceiptBatchButton } from "@/components/receipt-batch-button"
import { productSpecLine } from "@/lib/product-specs"
import Link from "next/link"
import { getSales } from "@/app/actions/sales"
import { PageHeader } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { money } from "@/lib/utils"
import { prisma } from "@/lib/prisma"
import { returnedValueBySale } from "@/lib/returned-value"
import { SalesList, type SaleRow } from "./sales-list"
import { CachePageData } from "@/components/cache-page-data"

export default async function SalesPage() {
  const raw = await getSales()
  // Refunds and credit notes already finished against each sale, so the
  // figures show the real sales value and what is really still owed.
  const returned = await returnedValueBySale(prisma, raw.map((sale) => sale.id))
  // Plain numbers and strings only. Database money values are not plain
  // objects, and handing them to the browser raised a warning per figure.
  const sales: SaleRow[] = raw.map((sale) => ({
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    saleDate: sale.saleDate.toISOString(),
    totalAmount: money(sale.totalAmount),
    paidAmount: money(sale.paidAmount),
    discount: money(sale.discount),
    paymentMethod: sale.paymentMethod,
    status: sale.status,
    isWholesale: sale.isWholesale,
    customer: sale.customer ? { name: sale.customer.name, phone: sale.customer.phone } : null,
    branch: { code: sale.branch.code, name: sale.branch.name },
    soldBy: sale.user?.name ?? null,
    returned: returned.get(sale.id) ?? 0,
    paymentRef: sale.payments.find((p) => p.reference)?.reference ?? null,
    // Every bank the money went into, so a sale split across two accounts
    // shows both on the list without opening it.
    paymentBank: (() => {
      const banks = [
        ...new Set(
          sale.payments
            .filter((p) => p.method !== "CASH" && p.bankAccount)
            .map((p) => `${p.bankAccount!.bankName} · ${p.bankAccount!.accountNumber}`)
        ),
      ]
      return banks.length ? banks.join(" + ") : null
    })(),
    items: sale.items.map((item) => ({
      id: item.id,
      name: item.product.name,
      // Storage, condition and colour, faint under the name.
      specs: productSpecLine(item.product),
      imei: item.imei?.imei1 ?? null,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      totalPrice: money(item.totalPrice),
    })),
  }))
  return (
    <div className="space-y-6">
      <CachePageData pageKey="sales" title="Sales" data={sales} />
      <PageHeader
        title="Sales"
        description="Every bill, what was paid and what is still owed."
        actions={
          <Button asChild>
            <Link href="/pos">Sell now</Link>
          </Button>
        }
      />
      <SalesList sales={sales} />
      <ReceiptBatchButton />
    </div>
  )
}
