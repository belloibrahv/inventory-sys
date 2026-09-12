import { PageHeader } from "@/components/shared"
import { importProducts } from "@/app/actions/catalog"
import { getUploadProgress, importCustomers, importImeis, importStock } from "@/app/actions/uploads"
import { UploadStockWizard } from "./upload-stock-wizard"
import { OpeningStockCard } from "./opening-stock-card"
import { UploadCard } from "./upload-card"

export const dynamic = "force-dynamic"

/**
 * Upload stock: Supplier Bill Upload with dynamic IMEI fields, payment amount, and automatic balance tracking.
 */
export default async function UploadsPage() {
  const progress = await getUploadProgress()
  if (!progress) return null

  const noItemsYet = progress.items === 0
  const lockedWhy =
    "First load the item list in step 1, or use Add a new item name above, or upload the opening stock Excel sheet. Nothing can be counted or booked in until the system knows what each item is."

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload stock"
        description="Put a supplier carton on the system. Pick the supplier and items, scan each phone number (IMEI), then type what you paid."
      />

      <UploadStockWizard
        shops={progress.branches}
        suppliers={progress.suppliers}
        brands={progress.brands}
        categories={progress.categories}
        products={progress.products}
      />

      <OpeningStockCard shops={progress.branches} suppliers={progress.suppliers} />


      <div className="surface-card p-5">
        <h2 className="text-sm font-semibold">Which one should I use?</h2>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">One carton today:</span> use the form at the top. Pick the
            supplier, add the items, scan each phone number (IMEI), then type how much you have paid.
          </li>
          <li>
            <span className="font-medium text-foreground">A big first stock count:</span> fill the opening stock Excel for
            one shop, then upload it. The system makes its own bill number.
          </li>
          <li>
            Always type the amount paid. Whatever is left shows as money we still owe on Goods from supplier and Money in
            &amp; out.
          </li>
          <li>If you upload the same phone twice, nothing breaks. The phone already on the system stays as it is.</li>
        </ul>
      </div>

      <details className="surface-card group p-5">
        <summary className="cursor-pointer list-none text-sm font-semibold tracking-tight marker:content-none [&::-webkit-details-marker]:hidden">
          Extra: upload from an old Excel or CSV sheet
        </summary>
        <p className="mt-3 text-sm text-muted-foreground">
          Use this only when the item names are already in the system and you just want to add more from a simple sheet.
          For day-one stock with a supplier bill, use the form or opening stock Excel above.
        </p>

        <div className="mt-4 space-y-4">
          <UploadCard
            step={1}
            title="The item list"
            what="Every model you sell. One row for each model, not for each box. You only need this if you are not using the opening stock sheet or Add a new item name above."
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
      </details>
    </div>
  )
}
