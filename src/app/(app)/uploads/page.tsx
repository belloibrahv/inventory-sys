import { PageHeader } from "@/components/shared"
import { importProducts } from "@/app/actions/catalog"
import { getUploadProgress, importCustomers, importImeis, importStock } from "@/app/actions/uploads"
import { ManualStockForm } from "./manual-stock-form"
import { OpeningStockCard } from "./opening-stock-card"
import { UploadCard } from "./upload-card"

export const dynamic = "force-dynamic"

/**
 * Two clear ways to put stock on the shelf:
 * add one unit by hand, or load many from the Abu Twins opening stock Excel.
 * Older step-by-step sheets stay under Advanced for later top-ups.
 */
export default async function UploadsPage() {
  const progress = await getUploadProgress()
  if (!progress) return null

  const noItemsYet = progress.items === 0
  const lockedWhy =
    "Load the item list in step 1 first, or use Add a new item name above, or upload the opening stock Excel. Nothing can be counted or booked in until the shop system knows what each item is."

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload stock"
        description="Put what is on the shelf into the system. Add one phone or cord at a time, or load a full shop count from the Abu Twins opening stock Excel."
      />

      <ManualStockForm
        shops={progress.branches}
        brands={progress.brands}
        categories={progress.categories}
        products={progress.products}
      />

      <OpeningStockCard shops={progress.branches} />

      <div className="surface-card p-5">
        <h2 className="font-semibold">Which way should I use?</h2>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">One or a few units today:</span> use Add one item to the shelf at the top. Scan or type each IMEI or serial, or say how many cords you have.
          </li>
          <li>
            <span className="font-medium text-foreground">Opening count or a full shop load:</span> fill the opening stock Excel one shop at a time and upload it in the card above.
          </li>
          <li>
            Sending the same phone twice is safe. A phone already on the system is left exactly as it is.
          </li>
          <li>
            Every Excel upload is checked from top to bottom before anything is saved. If one line is wrong, nothing is loaded and you are told which lines to fix.
          </li>
        </ul>
      </div>

      <details className="surface-card group p-5">
        <summary className="cursor-pointer list-none font-semibold tracking-tight marker:content-none [&::-webkit-details-marker]:hidden">
          Advanced: older step-by-step sheet uploads
        </summary>
        <p className="mt-3 text-sm text-muted-foreground">
          Use these only when the item list is already on the system and you are topping up from a simple CSV or Excel file.
          For day-one stock, prefer Add one item or the opening stock Excel above.
        </p>

        <div className="mt-4 space-y-4">
          <UploadCard
            step={1}
            title="The item list"
            what="Every model you sell, one row per model, not per box. Only needed if you are not using the opening stock sheet or Add a new item name above."
            columns={[
              "item code",
              "name",
              "brand",
              "category",
              "tracking (IMEI / serial / none)",
              "condition",
              "cost",
              "minimum",
              "selling",
              "warranty days",
            ]}
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
            what="One row for every phone, tablet, or serial item sitting in a shop. Each one is booked in as In shop, and the shelf count is raised to match."
            columns={[
              "imei",
              "imei2 (optional)",
              "serial (optional)",
              "item code",
              "shop",
              "supplier (optional)",
              "notes (optional)",
            ]}
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
      </details>
    </div>
  )
}
