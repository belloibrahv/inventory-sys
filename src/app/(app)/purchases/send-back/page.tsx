import { getSupplierReturnCandidates } from "@/app/actions/ops"
import { FormScreen, SectionCard } from "@/components/shared"
import { SupplierReturnForm } from "../supplier-return-form"

export default async function SendBackToSupplierPage() {
  const returnUnits = await getSupplierReturnCandidates()
  return (
    <FormScreen
      title="Send back to supplier"
      description="Scan every phone going back in this one send-back. The supplier and cost fill in from the bill."
      backHref="/purchases"
      aside={
        <SectionCard title="Waiting to go back" description={returnUnits.length ? `${returnUnits.length} phone${returnUnits.length === 1 ? "" : "s"}` : undefined}>
          {returnUnits.length ? (
            <ul className="space-y-2 text-sm">
              {returnUnits.slice(0, 20).map((row) => (
                <li key={row.id} className="min-w-0">
                  <p className="font-mono text-xs">{row.imei1}</p>
                  <p className="truncate text-muted-foreground">
                    {row.productName} · {row.shop}
                    {row.supplierName ? ` · ${row.supplierName}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No phone is waiting. You can still scan an In shop IMEI.</p>
          )}
        </SectionCard>
      }
    >
      <SupplierReturnForm />
    </FormScreen>
  )
}
