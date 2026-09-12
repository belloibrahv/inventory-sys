import { PageHeader } from "@/components/shared"
import { getUploadProgress } from "@/app/actions/uploads"
import { watDayKey } from "@/lib/lagos-day"
import { generateDocNumber } from "@/lib/utils"
import { UploadStockWizard } from "./upload-stock-wizard"

export const dynamic = "force-dynamic"

/**
 * Upload stock, section one: one supplier carton going onto the system today.
 *
 * The opening stock sheet and the four old Excel sheets used to sit under this
 * form on the same screen, so the person loading one carton scrolled past two
 * jobs they were not doing. They are their own screens now, reached from the
 * tab strip or the Upload stock fold in the menu.
 */
export default async function UploadsPage() {
  const progress = await getUploadProgress()
  if (!progress) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier bill"
        description="Put a supplier carton on the system. Pick the supplier and items, scan each phone number (IMEI), then type what you paid."
      />

      <UploadStockWizard
        shops={progress.branches}
        suppliers={progress.suppliers}
        brands={progress.brands}
        categories={progress.categories}
        products={progress.products}
        defaultInvoiceNumber={generateDocNumber("PO")}
        defaultUploadDate={watDayKey()}
      />

      <div className="surface-card p-5">
        <h2 className="text-sm font-semibold">Is this the right screen?</h2>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">One carton today:</span> yes, use the form above.
          </li>
          <li>
            <span className="font-medium text-foreground">A big first stock count:</span> go to{" "}
            <span className="font-medium text-foreground">Opening stock sheet</span>. Fill the Excel for one shop and
            upload it. The system makes its own bill number.
          </li>
          <li>
            <span className="font-medium text-foreground">An old plain sheet:</span> go to{" "}
            <span className="font-medium text-foreground">Old Excel &amp; CSV</span>.
          </li>
          <li>
            Always type the amount paid. Whatever is left shows as money we still owe on Goods from supplier and Money
            in &amp; out.
          </li>
          <li>If you upload the same phone twice, nothing breaks. The phone already on the system stays as it is.</li>
        </ul>
      </div>
    </div>
  )
}
