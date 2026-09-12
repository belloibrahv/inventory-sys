import Link from "next/link"
import { completeReturn, getReturns, getSoldImeis } from "@/app/actions/ops"
import { ActionForm } from "@/components/action-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { Input } from "@/components/ui/input"
import { formatCurrency, money } from "@/lib/utils"
import { ReturnForm } from "./return-form"

export default async function ReturnsPage() {
  const [rows, sold] = await Promise.all([getReturns(), getSoldImeis()])
  return (
    <div className="page-split">
      <div>
        <PageHeader title="Returns" description="A buyer brings a phone back. The old invoice stays. After approval you refund, give credit, repair, replace, or send the unit back to the supplier. Shop to shop is a different page." />
        <WorkflowSteps current={0} steps={["Enter IMEI", "Say why", "Boss approves", "Refund, replace, or send to supplier"]} />
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="surface-card p-5">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">{row.returnNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    <Link href={`/customers/${row.customer.id}`} className="text-primary">{row.customer.name}</Link>
                    {" · "}
                    {row.imei ? (
                      <Link href={`/imei/${row.imei.id}`} className="text-primary">{row.imei.imei1}</Link>
                    ) : "No IMEI"}
                    {row.invoice ? (
                      <>
                        {" · "}
                        <Link href={`/sales/${row.invoice.id}`} className="text-primary">{row.invoice.invoiceNumber}</Link>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm">{row.reason} → {row.outcome}{row.refundAmount ? ` · ${formatCurrency(money(row.refundAmount))}` : ""}</p>
                </div>
                <StatusBadge value={row.status} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Fault class: {row.faultClass}</p>
              {row.status === "PENDING" ? (
                <p className="mt-3 text-xs text-warning">Waiting on approval. The IMEI is locked and cannot be sold.</p>
              ) : null}
              {row.status === "APPROVED" ? (
                <div className="mt-4 border-t border-border pt-4">
                  <ActionForm action={completeReturn} submit="Apply outcome" className="space-y-2">
                    <input type="hidden" name="id" value={row.id} />
                    {row.outcome === "REPLACEMENT" ? (
                      <Input name="replacementImei" placeholder="In-stock replacement IMEI" />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        This will {
                          row.outcome === "REFUND"
                            ? "pay cash back from the amount they already paid"
                            : row.outcome === "REPAIR"
                              ? "open a repair job"
                              : row.outcome === "SEND_TO_SUPPLIER"
                                ? "send this unit back to the supplier. It will not sit in this shop"
                                : "post a credit note"
                        } without editing the original sale.
                      </p>
                    )}
                  </ActionForm>
                </div>
              ) : null}
            </div>
          ))}
        </div>
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
