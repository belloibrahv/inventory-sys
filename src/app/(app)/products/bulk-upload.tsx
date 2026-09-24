"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { importProducts } from "@/app/actions/catalog"
import { BrandBusyOverlay } from "@/components/brand-busy-overlay"
import { Button } from "@/components/ui/button"
import { ExportCsv } from "@/components/export-csv"
import { ShopScopeFields } from "./shop-scope-fields"

const SAMPLE: string[][] = [
  ["product_name", "brand", "category", "item_code", "tracking", "condition", "color", "storage", "cost", "minimum", "selling"],
  ["Tecno Camon 30", "Tecno", "Phones", "", "IMEI", "Brand New", "Black", "256GB", "", "", ""],
  ["iPhone 16 128GB", "Apple", "Phones", "", "IMEI", "UK", "Black", "128GB", "", "", ""],
  ["Type-C charger cord", "Generic", "Accessories", "", "NONE", "Brand New", "Black", "", "", "", ""],
]

export function BulkProductUpload({ shops }: { shops: Array<{ id: string; name: string; code: string }> }) {
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
    if ((outcome.created ?? 0) > 0) toast.success(`Added ${outcome.created} product names`)
    else toast.message("No new item was added")
    form.reset()
    router.refresh()
  }

  return (
    <div className="surface-card p-5">
      <BrandBusyOverlay
        open={busy}
        title="Uploading the item list"
        detail="Adding product names only. Shelf stock comes later on Upload stock."
        phases={[
          "Opening your sheet",
          "Checking product names and brands",
          "Adding new names to the list",
          "Leaving names that are already on the system",
        ]}
      />
      <h3 className="mb-2 font-semibold">Upload many product names at once</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        The sheet needs a product name and a brand on each line. Item code, prices, and stock are optional. Pick All shops or one shop below so those names show where staff should pick them.
      </p>
      <div className="mb-4">
        <ExportCsv filename="abu-twins-product-names-sample.csv" rows={SAMPLE} label="Download an example file" />
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <ShopScopeFields shops={shops} />
        <input
          name="file"
          type="file"
          accept=".csv,.xlsx,.xls"
          required
          disabled={busy}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
        />
        <p className="text-sm text-muted-foreground">
          Required columns: product name, brand. Optional: category, item code, how we count it (IMEI, SERIAL, or NONE), How the phone looks, color, storage, cost, lowest price, sell price.
        </p>
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Uploading the list" : "Upload the list"}
        </Button>
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
