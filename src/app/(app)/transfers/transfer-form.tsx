"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createTransfer } from "@/app/actions/ops"
import { getShopImeiSheet } from "@/app/actions/sales"
import { ExportCsv } from "@/components/export-csv"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"

type Branch = { id: string; name: string; code?: string }
type Product = { id: string; name: string; sku: string; serialized: boolean; stock: Array<{ branchId: string; quantity: number }> }

const SAMPLE: string[][] = [
  ["imei", "serial", "item_code", "name", "quantity", "color", "notes"],
  ["353456789012345", "", "IP16-128-BLK", "iPhone 16 128GB", "1", "Black", "Leaving Iwo Road, going to Challenge"],
  ["", "", "CORD-TYPEC", "Type-C charger cord", "20", "Black", "A box of cords. It has no unique number."],
]

export function TransferForm({
  branches,
  defaultFromId,
}: {
  branches: Branch[]
  products?: Product[]
  imeis?: unknown
  defaultFromId?: string | null
}) {
  const router = useRouter()
  const [fromId, setFromId] = useState(defaultFromId || branches[0]?.id || "")
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [sheet, setSheet] = useState<string[][]>(SAMPLE.slice(0, 1))
  const [sheetBusy, setSheetBusy] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const fromShop = branches.find((row) => row.id === fromId)
  const shopImeiRows = useMemo(() => (sheet.length > 1 ? sheet : SAMPLE.slice(0, 1)), [sheet])

  useEffect(() => {
    let cancelled = false
    setSheetBusy(true)
    void getShopImeiSheet(fromId).then((result) => {
      if (cancelled) return
      setSheet(result.rows)
      setTruncated(result.truncated)
      setSheetBusy(false)
    })
    return () => {
      cancelled = true
    }
  }, [fromId])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true)
    setErrors([])
    const outcome = await createTransfer(data)
    setBusy(false)
    if (outcome.error) {
      toast.error(outcome.error)
      setErrors(outcome.errors ?? [outcome.error])
      return
    }
    toast.success("Saved")
    form.reset()
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Select
        name="fromBranchId"
        value={fromId}
        onChange={(event) => setFromId(event.target.value)}
        required
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </Select>
      <Select name="toBranchId" required>
        {branches.filter((branch) => branch.id !== fromId).map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </Select>
      <p className="text-sm text-muted-foreground">
        Download a sample, or download the In shop phone numbers (IMEIs) at {fromShop?.name ?? "this shop"}. Keep the phones you are sending. Add accessory lines with item code and quantity. Then upload that file.
      </p>
      <div className="flex flex-wrap gap-2">
        <ExportCsv filename="abu-twins-shop-to-shop-sample.csv" rows={SAMPLE} label="Download an example file" />
        <ExportCsv
          filename={`shop-to-shop-${(fromShop?.code || "shop").toLowerCase()}-imeis.csv`}
          rows={shopImeiRows}
          label={sheetBusy ? "Loading the phone numbers in this shop" : "Download the phone numbers (IMEIs) in the shop you are sending from"}
        />
      </div>
      {truncated ? (
        <p className="text-sm text-muted-foreground">
          This list shows the newest 50,000 In shop phones. Split a bigger send into more than one file.
        </p>
      ) : null}
      {shopImeiRows.length <= 1 && !sheetBusy ? (
        <p className="text-sm text-muted-foreground">The shop you are sending from has no phone in stock to put on a list. You can still send accessories by item code and quantity.</p>
      ) : null}
      <input
        name="file"
        type="file"
        accept=".csv,.xlsx,.xls"
        required
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground"
      />
      <p className="text-sm text-muted-foreground">
        Columns: IMEI, serial, item code, name, quantity, color, notes. One phone or serial per line. Accessories use item code and quantity, with IMEI left empty.
      </p>
      <Button type="submit" disabled={busy}>{busy ? "Sending this list" : "Send this list"}</Button>
      {errors.length ? (
        <ul className="list-disc pl-5 text-sm text-warning">
          {errors.slice(0, 12).map((error) => (
            <li key={error}>{error}</li>
          ))}
          {errors.length > 12 ? <li>And {errors.length - 12} more lines to fix.</li> : null}
        </ul>
      ) : null}
    </form>
  )
}
