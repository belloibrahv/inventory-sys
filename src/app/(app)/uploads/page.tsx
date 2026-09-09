import { PageHeader } from "@/components/shared"
import { importProducts } from "@/app/actions/catalog"
import { getUploadProgress, importCustomers, importImeis, importStock } from "@/app/actions/uploads"
import { UploadCard } from "./upload-card"

export const dynamic = "force-dynamic"

/**
 * Loading the shop system from sheets, in the order the work has to happen.
 *
 * The order is not a suggestion. A phone cannot be booked in until the system
 * knows what that phone is, and a shelf cannot be counted for an item that does
 * not exist yet. Later steps stay shut until the item list is in.
 */
export default async function UploadsPage() {
  const progress = await getUploadProgress()
  if (!progress) return null

  const noItemsYet = progress.items === 0
  const lockedWhy = "Load the item list in step 1 first. Nothing can be counted or booked in until the shop system knows what each item is."

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload stock"
        description="Load the shop system from an Excel or CSV sheet. Work down the steps in order."
      />

      <div className="surface-card p-5">
        <h2 className="font-semibold">Before you start</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>Work top to bottom. Step 1 must be done before the rest will open.</li>
          <li>The first row of the sheet must be the column names. Spelling of the names is flexible: item code, sku, or code all work.</li>
          <li>Every sheet is checked from top to bottom before anything is saved. If one line is wrong, nothing is loaded and you are told which lines to fix.</li>
          <li>
            Say which shop each line belongs to using the name or the short code:{" "}
            <span className="font-medium text-foreground">
              {progress.branches.map((branch) => `${branch.code} (${branch.name.split(",")[0]})`).join(", ")}
            </span>
            .
          </li>
          <li>Sending the same sheet twice is safe. A phone or customer already on the system is left exactly as it is.</li>
        </ul>
      </div>

      <UploadCard
        step={1}
        title="The item list"
        what="Every model you sell, one row per model, not per box. This has to be first: nothing else can refer to an item the shop system has not been told about."
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
