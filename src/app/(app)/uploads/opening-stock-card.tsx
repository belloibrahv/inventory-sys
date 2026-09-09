"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { importOpeningStock, type UploadResult } from "@/app/actions/uploads"

type Shop = { id: string; name: string; code: string }

/**
 * The sheet Abu Twins already fills: one Excel file per shop, with PHONES,
 * ACCESSORIES, SCREEN, and LAPTOPS. One upload creates the item names, books
 * phones and serials In shop, and sets piece counts for that shop.
 */
export function OpeningStockCard({ shops }: { shops: Shop[] }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])

  return (
    <div className="surface-card border-primary/30 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Easiest way</p>
          <h2 className="text-lg font-semibold tracking-tight">Abu Twins opening stock sheet</h2>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Use the Excel file your shops already know: one file for one shop, with tabs for PHONES, ACCESSORIES, SCREEN, and LAPTOPS.
        The system reads PRODUCT NAME, BRAND, CATEGORY, QTY/IMEI/SERIAL NO, CONDITION, SPECIFICATION, UNIT COST PRICE, and MIN.SELLING PRICE.
        Pick the shop first. One upload adds the item names, puts phones and laptops In shop, and sets how many cords or screens are on the shelf.
      </p>

      <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
        <li>PHONES tab: one row per phone. Put the IMEI in QTY/IMEI/SERIAL NO.</li>
        <li>LAPTOPS tab: one row per laptop. Put the serial in that same column.</li>
        <li>ACCESSORIES and SCREEN tabs: put how many pieces are on the shelf.</li>
        <li>Do not invent an IMEI. Sending the same phone twice leaves the first one alone.</li>
      </ul>

      <form
        ref={formRef}
        className="mt-4 space-y-3"
        action={async (formData) => {
          setBusy(true)
          setProblems([])
          let result: UploadResult
          try {
            result = await importOpeningStock(formData)
          } catch {
            setBusy(false)
            toast.error("That did not reach the shop system. Check your connection and try once more.")
            return
          }
          setBusy(false)
          if (result.error) {
            toast.error(result.error)
            setProblems(result.problems ?? [])
            return
          }
          const parts = [
            result.products ? `${result.products} new item${result.products === 1 ? "" : "s"}` : null,
            result.phones ? `${result.phones} phone${result.phones === 1 ? "" : "s"} In shop` : null,
            result.pieces ? `${result.pieces} piece line${result.pieces === 1 ? "" : "s"}` : null,
          ].filter(Boolean)
          const skipped = result.skipped ? ` ${result.skipped} already on the system.` : ""
          toast.success(`${parts.join(", ") || "Nothing new to add"}.${skipped}`)
          formRef.current?.reset()
          router.refresh()
        }}
      >
        <Select name="branchId" required defaultValue={shops[0]?.id || ""} disabled={busy}>
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.name} ({shop.code})
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="file"
            accept=".xlsx,.xls"
            required
            disabled={busy}
            className="min-h-11 max-w-full flex-1 rounded-xl border-2 border-dashed border-primary/40 bg-card px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground disabled:opacity-60"
          />
          <Button type="submit" disabled={busy || shops.length === 0} aria-busy={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading opening stock
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden />
                Upload opening stock
              </>
            )}
          </Button>
        </div>
      </form>

      {problems.length ? (
        <div className="mt-4 rounded-xl bg-rose-50 p-3 dark:bg-rose-500/10">
          <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
            Fix these lines in the sheet, then upload it again. Nothing was loaded.
          </p>
          <ul className="mt-2 space-y-1">
            {problems.map((problem) => (
              <li key={problem} className="text-xs text-rose-700 dark:text-rose-300">
                {problem}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
