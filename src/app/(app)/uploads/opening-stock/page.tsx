import Link from "next/link"
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
        title="Upload stock · Many at once (Excel)"
        description="Put a whole shop on the system from one Excel file. This is opening stock value only. It is not a supplier bill to pay. Use this once per shop for what is already on the shelf."
      />

      <div className="surface-card border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
        <p className="font-bold text-foreground">Need to add phones one after another instead?</p>
        <p className="mt-1">
          Open{" "}
          <Link href="/uploads" className="font-medium text-primary hover:underline">
            Supplier bill
          </Link>{" "}
          for a carton with a bill, or{" "}
          <Link href="/imei/intake" className="font-medium text-primary hover:underline">
            One phone at a time
          </Link>{" "}
          for a single phone with no bill.
        </p>
      </div>

      <OpeningStockCard shops={progress.branches} suppliers={progress.suppliers} />

      <div className="surface-card p-5">
        <h2 className="text-sm font-semibold">Before you upload</h2>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          <li>One sheet covers one shop. Do the shops one after the other.</li>
          <li>The system makes its own opening stock number, so do not type one.</li>
          <li>
            There is no paid or unpaid on this sheet. The value is what the shop started with. New cartons with a bill
            go on Supplier bill, where payment belongs.
          </li>
          <li>Phones that are already on the system are left exactly as they are. Nothing is doubled.</li>
          <li>
            After this first load, new cartons go on{" "}
            <Link href="/uploads" className="font-medium text-primary hover:underline">
              Supplier bill
            </Link>
            , not on this Excel again.
          </li>
        </ul>
      </div>
    </div>
  )
}
