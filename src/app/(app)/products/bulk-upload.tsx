"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { importProducts } from "@/app/actions/catalog"
import { Button } from "@/components/ui/button"
import { ExportCsv } from "@/components/export-csv"

const SAMPLE: string[][] = [
  ["item_code", "name", "brand", "category", "tracking", "condition", "color", "storage", "ram", "cost", "minimum", "selling", "warranty_days", "description"],
  ["IP16-128-BLK", "iPhone 16 128GB", "Apple", "Phones", "IMEI", "BRAND_NEW", "Black", "128GB", "", "980000", "1050000", "1180000", "365", "Phone. IMEI required later when goods arrive."],
  ["BUDS3-WHT", "Galaxy Buds3", "Samsung", "Accessories", "SERIAL", "BRAND_NEW", "White", "", "", "45000", "52000", "68000", "180", "Accessory with a serial number."],
  ["CORD-TYPEC", "Type-C charger cord", "Generic", "Accessories", "NONE", "BRAND_NEW", "Black", "", "", "1500", "2000", "2500", "90", "No unique number. Count pieces."],
]

export function BulkProductUpload() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true)
    setResult(null)
    const outcome = await importProducts(data)
    setBusy(false)
    if (outcome.error) {
      toast.error(outcome.error)
      return
    }
    setResult({ created: outcome.created ?? 0, skipped: outcome.skipped ?? 0, errors: outcome.errors ?? [] })
    if ((outcome.created ?? 0) > 0) toast.success(`Added ${outcome.created} products`)
    else toast.message("No new products were added")
    form.reset()
    router.refresh()
  }

  return (
    <div className="surface-card p-5">
      <h3 className="mb-2 font-semibold">Upload many products</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Download the sample, fill it in Excel, then upload the file. This adds the item list only. It does not put stock in the shop. Use Goods on the way when the goods are coming.
      </p>
      <div className="mb-4">
        <ExportCsv filename="abu-twins-products-sample.csv" rows={SAMPLE} label="Download sample file" />
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          name="file"
          type="file"
          accept=".csv,.xlsx,.xls"
          required
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
        />
        <p className="text-xs text-muted-foreground">
          Columns: item code, name, brand, category, tracking (IMEI, SERIAL, or NONE), condition, color, storage, ram, cost, minimum, selling, warranty days, description.
        </p>
        <Button type="submit" disabled={busy}>{busy ? "Uploading the list" : "Upload list"}</Button>
      </form>
      {result ? (
        <div className="mt-4 space-y-1 text-sm">
          <p>Added: {result.created}</p>
          <p>Skipped (item code already exists): {result.skipped}</p>
          {result.errors.length ? (
            <ul className="list-disc pl-5 text-warning">
              {result.errors.slice(0, 12).map((error) => (
                <li key={error}>{error}</li>
              ))}
              {result.errors.length > 12 ? <li>And {result.errors.length - 12} more lines to fix.</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
