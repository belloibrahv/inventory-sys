import Link from "next/link"
import { notFound } from "next/navigation"
import { getImeiDetail } from "@/app/actions/imei"
import { ImeiConditionForm } from "@/app/(app)/imei/condition-form"
import { PageHeader, StatusBadge } from "@/components/shared"
import { WorkflowSteps } from "@/components/workflow-steps"
import { formatCurrency, formatDateTime, money } from "@/lib/utils"
import { statusLabel } from "@/lib/status"
import { warrantyState } from "@/lib/warranty"

const lifecycle = ["RECEIVED", "IN_STOCK", "TRANSFERRED", "SOLD", "RETURNED", "FAULTY", "RETURNED_TO_SUPPLIER", "REPAIRED", "SWAPPED", "DISPOSED"]

export default async function ImeiDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getImeiDetail(id)
  if (!data) notFound()
  const { record, logs } = data
  const current = Math.max(0, lifecycle.indexOf(record.status))
  const swaps = [...record.swapsOld, ...record.swapsNew]
  const warranty = record.sale
    ? warrantyState(record.sale.saleDate, record.product.warrantyDays)
    : null

  return (
    <div className="space-y-6">
      <PageHeader title={record.imei1} description={`${record.product.name} · ${record.branch.name}`} />
      <WorkflowSteps steps={lifecycle.map(statusLabel)} current={current} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge value={record.status} />
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">IMEI 2</p>
          <p className="font-medium">{record.imei2 ?? "-"}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Serial</p>
          <p className="font-medium">{record.serialNumber ?? "-"}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Warranty</p>
          <p className="font-medium">{warranty ? warranty.label : "Not sold yet"}</p>
          {warranty ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {warranty.days} days from the sale date
              {warranty.active ? ` · ${warranty.daysLeft} days left` : ""}
            </p>
          ) : null}
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Owner</p>
          <p className="font-medium">
            {record.customer ? (
              <Link href={`/customers/${record.customer.id}`} className="text-primary">{record.customer.name}</Link>
            ) : record.supplier?.name ?? "Vault"}
          </p>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="surface-card p-5 text-sm">
          <h3 className="mb-3 font-semibold">Unit history</h3>
          <div className="space-y-3">
            {record.purchase ? (
              <p>
                Supplier bill{" "}
                <Link href={`/purchases/${record.purchase.id}`} className="font-medium text-primary">
                  {record.purchase.invoiceNumber}
                </Link>
              </p>
            ) : null}
            {record.sale ? (
              <p>
                Invoice{" "}
                <Link href={`/sales/${record.sale.id}`} className="font-medium text-primary">{record.sale.invoiceNumber}</Link>
                {record.sale.customer ? ` · ${record.sale.customer.name}` : ""}
                {` · ${record.sale.branch.name}`}
              </p>
            ) : (
              <p className="text-muted-foreground">No sale posted against this IMEI yet.</p>
            )}
            {record.returns.map((row) => (
              <p key={row.id}>
                Return <Link href="/returns" className="text-primary">{row.returnNumber}</Link>
                {` · ${row.status} · ${row.reason} → ${row.outcome}`}
                {row.refundAmount ? ` · ${formatCurrency(money(row.refundAmount))}` : ""}
              </p>
            ))}
            {record.repairs.map((row) => (
              <p key={row.id}>
                Repair <Link href="/repairs" className="text-primary">{row.repairNumber}</Link>
                {` · ${row.status} · ${row.issue}`}
              </p>
            ))}
            {swaps.map((row) => (
              <p key={row.id}>
                Swap <Link href="/swaps" className="text-primary">{row.swapNumber}</Link>
                {` · ${row.status} · ${row.customer.name} · ${row.newProduct.name}`}
              </p>
            ))}
            {record.notes ? <p className="text-muted-foreground">{record.notes}</p> : null}
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <p className="font-medium">Condition</p>
              <p>Grade {record.cosmeticGrade ?? "-"}{record.batteryHealth != null ? ` · battery ${record.batteryHealth}%` : ""}</p>
              {record.conditionNotes ? <p className="text-muted-foreground">{record.conditionNotes}</p> : null}
              {record.photoData ? <img src={record.photoData} alt="Phone condition" className="mt-2 h-48 w-full rounded-xl object-cover" /> : null}
            </div>
          </div>
        </div>
        <div className="surface-card p-5">
          <h3 className="mb-3 font-semibold">Lifecycle log</h3>
          <div className="space-y-3 text-sm">
            {logs.map((log) => (
              <div key={log.id} className="border-b border-border/70 pb-2">
                <p className="font-medium">{log.action} · {log.user?.name ?? "Unknown"}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</p>
                <p className="break-all text-xs text-muted-foreground">{log.newValue}</p>
              </div>
            ))}
            {logs.length === 0 ? <p className="text-sm text-muted-foreground">No audit rows yet for this IMEI.</p> : null}
          </div>
        </div>
      </div>
      <div className="surface-card p-5">
        <h3 className="mb-3 font-semibold">Update condition and photo</h3>
        <ImeiConditionForm
          id={record.id}
          cosmeticGrade={record.cosmeticGrade}
          batteryHealth={record.batteryHealth}
          conditionNotes={record.conditionNotes}
          photoData={record.photoData}
        />
      </div>
    </div>
  )
}
