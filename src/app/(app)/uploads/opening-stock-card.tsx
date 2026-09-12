"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { SectionCard } from "@/components/shared"
import { importOpeningStock, type UploadResult } from "@/app/actions/uploads"
import { formatCurrency } from "@/lib/utils"

type Shop = { id: string; name: string; code: string }
type Supplier = { id: string; name: string; city: string | null; country: string | null }

/**
 * One Excel file per shop. Creates a Goods from supplier bill with the supplier,
 * the value worked out from the sheet, and whatever has been paid against it,
 * then books the stock In shop.
 */
export function OpeningStockCard({ shops, suppliers }: { shops: Shop[]; suppliers: Supplier[] }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])

  return (
    <SectionCard
      title="Load a whole shop from the opening stock Excel"
      description="For an opening count or a full container. For one or two units, use the upload bill above."
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        One file for one shop, with tabs for PHONES, ACCESSORIES, SCREEN and LAPTOPS. Pick the shop and the supplier,
        type whatever has been paid so far, then upload. The file creates its own bill number, books phones and laptops
        In shop, sets the piece counts, and works the bill value out from the unit costs on the sheet.
      </p>

      <ul className="mt-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
        <li>PHONES tab: one row per phone, IMEI in the QTY/IMEI/SERIAL NO column.</li>
        <li>LAPTOPS tab: one row per laptop, serial in that same column.</li>
        <li>ACCESSORIES and SCREEN tabs: how many pieces are on the shelf.</li>
        <li>Never invent an IMEI. Sending the same phone twice leaves the first one alone.</li>
      </ul>

      <form
        ref={formRef}
        className="mt-5 space-y-4"
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
            result.invoiceNumber ? `Bill ${result.invoiceNumber}` : null,
            result.products ? `${result.products} new item${result.products === 1 ? "" : "s"}` : null,
            result.phones ? `${result.phones} phone${result.phones === 1 ? "" : "s"} In shop` : null,
            result.pieces ? `${result.pieces} piece line${result.pieces === 1 ? "" : "s"}` : null,
            result.submissionValue != null ? `bill value ${formatCurrency(result.submissionValue)}` : null,
            result.paid
              ? "fully cleared"
              : `paid ${formatCurrency(result.paidAmount ?? 0)}, still owed ${formatCurrency(result.balanceOwed ?? 0)}`,
          ].filter(Boolean)
          const skipped = result.skipped ? ` ${result.skipped} already on the system.` : ""
          toast.success(`${parts.join(" · ") || "Nothing new to add"}.${skipped}`)
          formRef.current?.reset()
          router.refresh()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="eyebrow mb-1 block">Which shop</span>
            <Select name="branchId" required defaultValue={shops[0]?.id || ""} disabled={busy}>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name} ({shop.code})
                </option>
              ))}
            </Select>
          </label>

          <label className="block text-sm">
            <span className="eyebrow mb-1 block">Supplier</span>
            <Select
              name="supplierId"
              required
              disabled={busy || suppliers.length === 0}
              emptyLabel="No suppliers on the books yet. Add one on Suppliers first."
            >
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                  {supplier.city || supplier.country
                    ? ` · ${[supplier.city, supplier.country].filter(Boolean).join(", ")}`
                    : ""}
                </option>
              ))}
            </Select>
          </label>

          {/*
            No more "paid already / not paid yet" buttons. Type the amount, and
            the system works out what is left against the value of the sheet.
          */}
          <label className="block text-sm">
            <span className="eyebrow mb-1 block">Amount paid on this bill so far (₦)</span>
            <Input
              name="amountPaid"
              type="number"
              min={0}
              step="0.01"
              defaultValue={0}
              disabled={busy}
              className="num font-semibold"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Leave it at zero if nothing has been paid. Anything still owed shows on Goods from supplier and on
              Revenue &amp; expenditure until it is settled.
            </span>
          </label>

          <label className="block text-sm">
            <span className="eyebrow mb-1 block">Note or waybill number</span>
            <Input name="notes" placeholder="Optional" disabled={busy} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="file"
            accept=".xlsx,.xls"
            required
            disabled={busy}
            className="h-10 max-w-full flex-1 rounded-lg border border-dashed border-input bg-card px-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground disabled:opacity-60"
          />
          <Button type="submit" disabled={busy || shops.length === 0 || suppliers.length === 0} aria-busy={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading opening stock…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden /> Upload opening stock
              </>
            )}
          </Button>
        </div>
      </form>

      {problems.length ? (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger-soft p-3">
          <p className="text-sm font-semibold text-danger">
            Fix these lines in the sheet, then upload it again. Nothing was loaded.
          </p>
          <ul className="mt-2 space-y-1">
            {problems.map((problem) => (
              <li key={problem} className="text-xs text-danger">
                {problem}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  )
}
