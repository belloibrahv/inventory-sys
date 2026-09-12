import { PageHeader } from "@/components/shared"
import { importProducts } from "@/app/actions/catalog"
import { getUploadProgress, importCustomers, importImeis, importStock } from "@/app/actions/uploads"
import { UploadCard } from "../upload-card"

export const dynamic = "force-dynamic"

/**
 * The four plain sheets, in the order they have to be loaded.
 *
 * This used to hide inside a <details> fold at the bottom of Upload stock, which
 * meant the one screen that is genuinely a four-step job was the hardest thing
 * on the page to find. On its own route the steps can just be numbered and open.
 */
export default async function UploadSheetsPage() {
  const progress = await getUploadProgress()
  if (!progress) return null

  const noItemsYet = progress.items === 0
  const lockedWhy =
    "First load the item list in step 1, or use Add one item on Phones & items, or upload the opening stock Excel sheet. Nothing can be counted or booked in until the system knows what each item is."

  return (
    <div className="space-y-6">
      <PageHeader
        title="Old Excel & CSV sheets"
        description="Use this when the item names are already in the system and you just want to add more from a simple sheet. For day-one stock with a supplier bill, use Supplier bill or Opening stock sheet."
      />

      <div className="space-y-4">
        <UploadCard
          step={1}
          title="The item list"
          what="Every model you sell. One row for each model, not for each box. You only need this if you are not using the opening stock sheet or Add one item on Phones & items."
          columns={[
            "item code",
            "name",
            "brand",
            "category",
            "how we count it (IMEI / serial / none)",
            "condition",
            "cost",
            "lowest price",
            "sell price",
            "warranty days",
          ]}
          action={importProducts}
          done={progress.items}
          doneLabel="items on the list"
        />

        <UploadCard
          step={2}
          title="Pieces on the shelf"
          what="How many of each item each shop is holding. Cords, chargers, and anything with no unique number. Phones do not go here."
          columns={["item code", "shop", "quantity", "lowest stock alert (optional)"]}
          action={importStock}
          done={progress.withStock}
          doneLabel="shop lines with stock"
          locked={noItemsYet}
          lockedWhy={lockedWhy}
        />

        <UploadCard
          step={3}
          title="Phones by IMEI"
          what="One row for every phone, tablet, or serial item sitting in a shop. Each one goes in as In shop, and the shelf count goes up to match."
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
          what="Buyer names, so old debts, warranties, and returns go to the right person. If the phone number is already on the system, that customer is left alone."
          columns={["name", "phone", "shop", "email (optional)", "address (optional)", "credit limit (optional)"]}
          action={importCustomers}
          done={progress.customers}
          doneLabel="customers"
        />
      </div>
    </div>
  )
}
