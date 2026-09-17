"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { SectionCard } from "@/components/shared"
import { BrandBusyOverlay } from "@/components/brand-busy-overlay"
import { importOpeningStock, type UploadResult } from "@/app/actions/uploads"
import { listedSupplierClash } from "@/lib/party-key"
import { formatCurrency } from "@/lib/utils"

type Shop = { id: string; name: string; code: string }
type Supplier = { id: string; name: string; phone?: string | null; city: string | null; country: string | null }

const OPENING_PHASES = [
  "Opening your Excel file",
  "Checking every IMEI and serial",
  "Folding any duplicate numbers into one entry",
  "Booking phones and laptops In shop",
  "Setting piece counts on the shelf",
  "Saving the opening stock value",
]

/**
 * One Excel file per shop. Books what is already on the shelf as opening stock
 * value. There is no supplier payment on this load.
 */
export function OpeningStockCard({ shops, suppliers }: { shops: Shop[]; suppliers: Supplier[] }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState(false)
  const [busyShop, setBusyShop] = useState("")
  const [problems, setProblems] = useState<string[]>([])
  const [softNotes, setSoftNotes] = useState<string[]>([])
  const [supplierChoice, setSupplierChoice] = useState(suppliers[0]?.id || "__new__")
  const [branchId, setBranchId] = useState(shops[0]?.id || "")
  const addingNewSupplier = supplierChoice === "__new__"

  const shopLabel =
    shops.find((shop) => shop.id === branchId)?.name ||
    shops.find((shop) => shop.id === branchId)?.code ||
    "this shop"

  return (
    <SectionCard
      title="Load a whole shop from the opening stock Excel sheet"
      description="Once per shop for stock already on the shelf. Later cartons use Supplier bill."
    >
      <BrandBusyOverlay
        open={busy}
        title={`Uploading opening stock to ${busyShop || shopLabel}`}
        detail="Reading the Excel and booking what is on the shelf. This can take a minute for a full shop."
        phases={OPENING_PHASES}
      />

      <p className="text-sm leading-relaxed text-muted-foreground">
        One file for one shop, with tabs for PHONES, ACCESSORIES, SCREEN and LAPTOPS. Pick the shop and the supplier
        (or add a new one). The file books phones and laptops In shop, sets the piece counts, and stores the opening
        stock value from the unit costs. That value is not a bill to pay.
      </p>

      <ul className="mt-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
        <li>PHONES tab: one row per phone, IMEI in the QTY/IMEI/SERIAL NO column.</li>
        <li>LAPTOPS tab: one row per laptop, serial in that same column.</li>
        <li>ACCESSORIES and SCREEN tabs: how many pieces are on the shelf.</li>
        <li>Never make up an IMEI. If you send the same phone twice, the first one is not touched.</li>
      </ul>

      <form
        ref={formRef}
        className="mt-5 space-y-4"
        action={async (formData) => {
          if (addingNewSupplier) {
            const clash = listedSupplierClash(
              suppliers,
              String(formData.get("newSupplierName") || ""),
              String(formData.get("newSupplierPhone") || ""),
            )
            if (clash) {
              toast.error(clash)
              return
            }
          }
          const selectedId = String(formData.get("branchId") || branchId)
          const selectedShop = shops.find((shop) => shop.id === selectedId)
          setBusyShop(selectedShop ? `${selectedShop.name} (${selectedShop.code})` : shopLabel)
          setBusy(true)
          setProblems([])
          setSoftNotes([])
          let result: UploadResult
          try {
            result = await importOpeningStock(formData)
          } catch {
            setBusy(false)
            toast.error("That did not reach the shop system. Check your network and try again.")
            return
          }
          setBusy(false)
          if (result.error) {
            toast.error(result.error)
            setProblems(result.problems ?? [])
            return
          }
          const parts = [
            result.invoiceNumber ? `Opening stock ${result.invoiceNumber}` : null,
            result.products ? `${result.products} new item${result.products === 1 ? "" : "s"}` : null,
            result.phones ? `${result.phones} phone${result.phones === 1 ? "" : "s"} In shop` : null,
            result.pieces ? `${result.pieces} piece line${result.pieces === 1 ? "" : "s"}` : null,
            result.submissionValue != null ? `opening value ${formatCurrency(result.submissionValue)}` : null,
          ].filter(Boolean)
          const skippedBits = [
            result.duplicates ? `${result.duplicates} duplicate number(s) counted once` : null,
            result.skipped ? `${result.skipped} already on the system left as they are` : null,
          ].filter(Boolean)
          toast.success(
            `${parts.join(" · ") || "Nothing new to add"}${skippedBits.length ? `. ${skippedBits.join(" · ")}` : "."}`
          )
          setSoftNotes(result.problems ?? [])
          formRef.current?.reset()
          setSupplierChoice(suppliers[0]?.id || "__new__")
          setBranchId(shops[0]?.id || "")
          router.refresh()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="eyebrow mb-1 block">Which shop</span>
            <Select
              name="branchId"
              required
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              disabled={busy}
            >
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
              disabled={busy}
              value={supplierChoice}
              onChange={(event) => setSupplierChoice(event.target.value)}
            >
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                  {supplier.city || supplier.country
                    ? ` · ${[supplier.city, supplier.country].filter(Boolean).join(", ")}`
                    : ""}
                </option>
              ))}
              <option value="__new__">Add new supplier</option>
            </Select>
          </label>

          {addingNewSupplier ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 sm:col-span-2">
              <p className="text-xs font-semibold text-foreground">New supplier</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input name="newSupplierName" required placeholder="Supplier name" disabled={busy} />
                <Input name="newSupplierPhone" required placeholder="Supplier phone number" disabled={busy} />
                <Input name="newSupplierCity" placeholder="City (optional)" disabled={busy} />
                <Input name="newSupplierCountry" placeholder="Country (optional)" disabled={busy} />
              </div>
            </div>
          ) : null}

          <label className="block text-sm sm:col-span-2">
            <span className="eyebrow mb-1 block">Note, or the waybill number</span>
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
          <Button type="submit" disabled={busy || shops.length === 0} aria-busy={busy}>
            {busy ? (
              "Uploading opening stock"
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
              <li key={problem} className="text-sm text-danger">
                {problem}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {softNotes.length ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-sm font-semibold text-foreground">
            Upload completed. Duplicates were folded into one entry, or numbers already on the system were left as they are. You can edit stock later on Correct and close opening stock or Phones and items.
          </p>
          <ul className="mt-2 space-y-1">
            {softNotes.map((note) => (
              <li key={note} className="text-sm text-muted-foreground">
                {note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  )
}
