import { PageHeader } from "@/components/shared"
import { getUploadProgress } from "@/app/actions/uploads"
import { OpeningStockCard } from "../opening-stock-card"

export const dynamic = "force-dynamic"

/** Day-one stock for one shop, from the opening stock Excel sheet. */
export default async function OpeningStockPage() {
  const progress = await getUploadProgress()
  if (!progress) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opening stock sheet"
        description="Use this once per shop, when you are putting what is already on the shelf onto the system. One Excel file, one shop, one supplier bill."
      />

      <OpeningStockCard shops={progress.branches} suppliers={progress.suppliers} />

      <div className="surface-card p-5">
        <h2 className="text-sm font-semibold">Before you upload</h2>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          <li>One sheet covers one shop. Do the shops one after the other.</li>
          <li>The system makes its own bill number, so do not type one.</li>
          <li>
            Type what has been paid on that stock. Whatever is left shows as money we still owe on Goods from supplier.
          </li>
          <li>Phones that are already on the system are left exactly as they are. Nothing is doubled.</li>
        </ul>
      </div>
    </div>
  )
}
