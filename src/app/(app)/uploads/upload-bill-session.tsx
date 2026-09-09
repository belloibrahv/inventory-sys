"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, FilePlus2 } from "lucide-react"
import { toast } from "sonner"
import { closeUploadPurchase, startUploadPurchase, type UploadResult } from "@/app/actions/uploads"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"

type Shop = { id: string; name: string; code: string }
type Supplier = { id: string; name: string; city: string | null; country: string | null }
export type OpenUploadBill = {
  id: string
  invoiceNumber: string
  branchId: string
  supplierId: string
  shopName: string
  shopCode: string
  supplierName: string
  submissionValue: number
  paid: boolean
  owed: number
  lineCount: number
  unitCount: number
}

/**
 * Start or show the open Goods from supplier bill for a manual Upload stock session.
 */
export function UploadBillSession({
  shops,
  suppliers,
  openBill,
}: {
  shops: Shop[]
  suppliers: Supplier[]
  openBill: OpenUploadBill | null
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState(false)

  async function onStart(formData: FormData) {
    setBusy(true)
    let result: UploadResult
    try {
      result = await startUploadPurchase(formData)
    } catch {
      setBusy(false)
      toast.error("That did not reach the shop system. Check your connection and try once more.")
      return
    }
    setBusy(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(
      `Upload bill ${result.invoiceNumber} is open. Add phones or pieces below. ${
        result.paid ? "Marked paid." : "Not paid yet — it will show on Finance until settled."
      }`
    )
    formRef.current?.reset()
    router.refresh()
  }

  async function onClose() {
    if (!openBill) return
    setBusy(true)
    const formData = new FormData()
    formData.set("purchaseId", openBill.id)
    let result: UploadResult
    try {
      result = await closeUploadPurchase(formData)
    } catch {
      setBusy(false)
      toast.error("That did not reach the shop system. Check your connection and try once more.")
      return
    }
    setBusy(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(
      `Closed ${result.invoiceNumber}. Submission value ${formatCurrency(result.submissionValue ?? 0)}. Start a new bill when the next carton arrives.`
    )
    router.refresh()
  }

  return (
    <div className="surface-card border-primary/30 p-5">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Before you add units</p>
        <h2 className="text-lg font-semibold tracking-tight">Upload bill</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Every manual add sits on one supplier bill with a unique PO number. Accountants and auditors use that number to
        trace the load, see the submission value, and tell paid from not paid. Start a bill once, then add many units
        under it.
      </p>

      {openBill ? (
        <div className="mt-4 space-y-3 rounded-xl bg-muted/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Open bill</p>
              <p className="text-xl font-semibold tracking-tight">{openBill.invoiceNumber}</p>
              <p className="mt-1 text-sm">
                {openBill.supplierName} · {openBill.shopName} ({openBill.shopCode})
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Submission value</p>
              <p className="text-xl font-semibold">{formatCurrency(openBill.submissionValue)}</p>
              <p className="mt-1 text-sm font-medium">
                {openBill.paid ? "Marked paid" : `Not paid yet · owed ${formatCurrency(openBill.owed)}`}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {openBill.lineCount} item line{openBill.lineCount === 1 ? "" : "s"}
            {openBill.unitCount
              ? ` · ${openBill.unitCount} phone or serial unit${openBill.unitCount === 1 ? "" : "s"}`
              : ""}
            . Add more below, or close this bill when the carton is finished.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy} aria-busy={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Closing this bill
                </>
              ) : (
                "Close this bill"
              )}
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/purchases/${openBill.id}`}>Open on Goods from supplier</Link>
            </Button>
          </div>
        </div>
      ) : (
        <form ref={formRef} className="mt-4 space-y-3" action={onStart}>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="bill-shop">
              Shop
            </label>
            <Select id="bill-shop" name="branchId" required defaultValue={shops[0]?.id || ""} disabled={busy}>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name} ({shop.code})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="bill-supplier">
              Supplier
            </label>
            <Select
              id="bill-supplier"
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
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Has this bill been paid?</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="paid" value="no" defaultChecked disabled={busy} />
                Not paid yet
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="paid" value="yes" disabled={busy} />
                Paid already
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Not paid yet shows on Finance as still owed. Paid already keeps the bill settled as you add units. Cash
              movement for later payments is recorded by accounts on Goods from supplier.
            </p>
          </fieldset>
          <Input name="notes" placeholder="Optional note or supplier waybill number" disabled={busy} />
          <Button type="submit" disabled={busy || shops.length === 0 || suppliers.length === 0} aria-busy={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Opening upload bill
              </>
            ) : (
              <>
                <FilePlus2 className="h-4 w-4" aria-hidden />
                Start upload bill
              </>
            )}
          </Button>
        </form>
      )}
    </div>
  )
}
