import { PageHeader } from "@/components/shared"
import { importProducts } from "@/app/actions/catalog"
import { getUploadProgress, importCustomers, importImeis, importStock } from "@/app/actions/uploads"
import { OpeningStockCard } from "./opening-stock-card"
import { UploadCard } from "./upload-card"

export const dynamic = "force-dynamic"

/**
 * Loading the shop system from sheets.
 *
 * Prefer the Abu Twins opening stock workbook first. The four older steps stay
 * for top-ups after the item list already exists.
 */
export default async function UploadsPage() {
  const progress = await getUploadProgress()
  if (!progress) return null

  const noItemsYet = progress.items === 0
  const lockedWhy = "Load the item list in step 1 first, or use the opening stock sheet above. Nothing can be counted or booked in until the shop system knows what each item is."

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload stock"
        description="Load what is on the shelf from Excel. Start with the Abu Twins opening stock sheet your shops already use."
      />

      <OpeningStockCard shops={progress.branches} />

      <div className="surface-card p-5">
        <h2 className="font-semibold">Before you start</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>For day-one stock, fill the opening stock Excel one shop at a time and use the card above.</li>
          <li>The older steps below are for later top-ups, when the item list is already on the system.</li>
          <li>Every sheet is checked from top to bottom before anything is saved. If one line is wrong, nothing is loaded and you are told which lines to fix.</li>
          <li>
            For the older steps, say which shop each line belongs to using the name or the short code:{" "}
            <span className="font-medium text-foreground">
              {progress.branches.map((branch) => `${branch.code} (${branch.name.split(",")[0]})`).join(", ")}
            </span>
            .
          </li>
          <li>Sending the same phone twice is safe. A phone already on the system is left exactly as it is.</li>
        </ul>
      </div>

      <h2 className="text-base font-semibold tracking-tight">Older step-by-step sheets</h2>

      <UploadCard
        step={1}
        title="The item list"
        what="Every model you sell, one row per model, not per box. Only needed if you are not using the opening stock sheet above."
        columns={["item code", "name", "brand", "category", "tracking (IMEI / serial / none)", "condition", "cost", "minimum", "selling", "warranty days"]}
        action={importProducts}
        done={progress.items}
        doneLabel="items on the list"
      />

      <UploadCard
        step={2}
        title="Pieces on the shelf"
        what="How many of each countable item each shop is holding. Cords, chargers, and anything with no unique number. Phones do not belong here."
        columns={["item code", "shop", "quantity", "minimum (optional)"]}
        action={importStock}
        done={progress.withStock}
        doneLabel="shop lines with stock"
        locked={noItemsYet}
        lockedWhy={lockedWhy}
      />

      <UploadCard
        step={3}
        title="Phones by IMEI"
        what="One row for every phone, tablet, or serial item sitting in a shop. Each one is booked in as In shop, and the shelf count is raised to match, so Shop stock and the IMEI list agree from the start."
        columns={["imei", "imei2 (optional)", "serial (optional)", "item code", "shop", "supplier (optional)", "notes (optional)"]}
        action={importImeis}
        done={progress.phones}
        doneLabel="phones In shop"
        locked={noItemsYet}
        lockedWhy={lockedWhy}
      />

      <UploadCard
        step={4}
        title="Customers"
        what="Named buyers, so old debts, warranties, and returns can be attached to the right person. A customer already on the system, matched on phone number, is left alone."
        columns={["name", "phone", "shop", "email (optional)", "address (optional)", "credit limit (optional)"]}
        action={importCustomers}
        done={progress.customers}
        doneLabel="customers"
      />
    </div>
  )
}
