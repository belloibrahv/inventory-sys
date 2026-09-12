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
    "Load the item list in step 1 first, or use Add a new item name above, or upload the opening stock Excel. Nothing can be counted or booked in until the shop system knows what each item is."

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload stock"
        description="Book a supplier carton onto the system. Enter the supplier and the items, scan the IMEI rows the bill opens for you, then type what you have paid. The balance is worked out as you go."
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
        <h2 className="text-sm font-semibold">Which way should I use?</h2>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">One carton, or a few units today:</span> use the upload bill at
            the top. Enter the supplier, list the items with their cost and quantity, scan the IMEI rows it opens for
            you, then type whatever you have paid.
          </li>
          <li>
            <span className="font-medium text-foreground">Opening count or a whole container:</span> fill the opening
            stock Excel one shop at a time and upload it. That creates its own bill number.
          </li>
          <li>
            Either way, type the amount paid rather than ticking a box. Whatever is left over shows on Goods from
            supplier and on Revenue &amp; expenditure as still owed until it is settled.
          </li>
          <li>Sending the same phone twice is safe. A phone already on the system is left exactly as it is.</li>
        </ul>
      </div>

      <details className="surface-card group p-5">
        <summary className="cursor-pointer list-none text-sm font-semibold tracking-tight marker:content-none [&::-webkit-details-marker]:hidden">
          Advanced: older step-by-step sheet uploads
        </summary>
        <p className="mt-3 text-sm text-muted-foreground">
          Use these only when the item list is already on the system and you are topping up from a simple CSV or Excel
          file. Prefer Add one item or the opening stock Excel above for day-one stock with a supplier bill.
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
