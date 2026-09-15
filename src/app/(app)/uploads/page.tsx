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
        title="Procurement Bill & Inventory Intake"
        description="Process vendor purchase bills and intake inventory consignments. Assign vendor, line items, serialized assets (IMEI), and payment disbursements."
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
        <h2 className="text-sm font-semibold">Consignment Intake Protocols</h2>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Standard Inbound Consignment:</span> Use the purchase intake wizard above.
          </li>
          <li>
            <span className="font-medium text-foreground">Initial System Migration:</span> Navigate to{" "}
            <span className="font-medium text-foreground">Opening Stock Import</span> to upload comprehensive baseline inventory sheets.
          </li>
          <li>
            <span className="font-medium text-foreground">Legacy File Formatting:</span> Use{" "}
            <span className="font-medium text-foreground">Legacy Spreadsheet Import</span> for raw historical spreadsheets.
          </li>
          <li>
            <span className="font-medium text-foreground">Accounts Payable:</span> Any unpaid purchase balance is automatically accrued under Accounts Payable and reflected in the General Ledger.
          </li>
          <li>
            <span className="font-medium text-foreground">Serialized Deduplication:</span> Duplicate serial numbers/IMEIs are safely rejected without disrupting existing active inventory.
          </li>
        </ul>
      </div>
    </div>
  )
}
