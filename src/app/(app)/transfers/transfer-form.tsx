"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Download, FileSpreadsheet } from "lucide-react"
import { toast } from "sonner"
import { createTransfer } from "@/app/actions/ops"
import { getShopImeiSheet } from "@/app/actions/sales"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { downloadTable } from "@/lib/download-table"
import { formatCurrency, money } from "@/lib/utils"

type Branch = { id: string; name: string; code?: string }
type Product = {
  id: string
  name: string
  sku: string
  serialized: boolean
  costPrice: number
  brand?: { name: string }
  category?: { name: string }
  stock: Array<{ branchId: string; quantity: number }>
}

type PhonePick = {
  imei: string
  name: string
  sku: string
  costPrice: number
}

export function TransferForm({
  branches,
  products = [],
  defaultFromId,
}: {
  branches: Branch[]
  products?: Product[]
  imeis?: unknown
  defaultFromId?: string | null
}) {
  const router = useRouter()
  const [fromId, setFromId] = useState(defaultFromId || branches[0]?.id || "")
  const [toId, setToId] = useState(() => branches.find((row) => row.id !== (defaultFromId || branches[0]?.id))?.id || "")
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [phones, setPhones] = useState<PhonePick[]>([])
  const [phonesBusy, setPhonesBusy] = useState(false)
  const [pickedImeis, setPickedImeis] = useState<Record<string, boolean>>({})
  const [accessoryQty, setAccessoryQty] = useState<Record<string, string>>({})
  const [query, setQuery] = useState("")

  const fromShop = branches.find((row) => row.id === fromId)
  const toShop = branches.find((row) => row.id === toId)
  const toOptions = branches.filter((row) => row.id !== fromId)

  const accessories = useMemo(
    () =>
      products
        .filter((product) => !product.serialized)
        .map((product) => ({
          ...product,
          costPrice: money(product.costPrice),
          onShelf: product.stock.find((row) => row.branchId === fromId)?.quantity ?? 0,
        }))
        .filter((product) => product.onShelf > 0),
    [products, fromId]
  )

  const needle = query.trim().toLowerCase()

  const visiblePhones = useMemo(() => {
    const list = !needle
      ? phones
      : phones.filter(
          (row) =>
            row.imei.toLowerCase().includes(needle) ||
            row.name.toLowerCase().includes(needle) ||
            row.sku.toLowerCase().includes(needle)
        )
    return list.slice(0, 120)
  }, [phones, needle])

  const visibleAccessories = useMemo(() => {
    if (!needle) return accessories
    return accessories.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        row.sku.toLowerCase().includes(needle) ||
        row.brand?.name?.toLowerCase().includes(needle) ||
        row.category?.name?.toLowerCase().includes(needle)
    )
  }, [accessories, needle])

  const selectedPhones = useMemo(
    () => phones.filter((row) => pickedImeis[row.imei]),
    [phones, pickedImeis]
  )

  const selectedAccessories = useMemo(
    () =>
      accessories
        .map((product) => {
          const qty = Math.min(product.onShelf, Math.max(0, Math.floor(Number(accessoryQty[product.id]) || 0)))
          return { product, qty }
        })
        .filter((row) => row.qty > 0),
    [accessories, accessoryQty]
  )

  const phoneQty = selectedPhones.length
  const accessoryCount = selectedAccessories.reduce((sum, row) => sum + row.qty, 0)
  const totalQty = phoneQty + accessoryCount
  const phoneCost = selectedPhones.reduce((sum, row) => sum + money(row.costPrice), 0)
  const accessoryCost = selectedAccessories.reduce(
    (sum, row) => sum + row.qty * money(row.product.costPrice),
    0
  )
  const totalCost = phoneCost + accessoryCost

  useEffect(() => {
    let cancelled = false
    setPhonesBusy(true)
    setPickedImeis({})
    setAccessoryQty({})
    void getShopImeiSheet(fromId).then((result) => {
      if (cancelled) return
      const header = result.rows[0] ?? []
      const imeiIdx = header.findIndex((col) => /imei/i.test(col))
      const nameIdx = header.findIndex((col) => /name/i.test(col))
      const skuIdx = header.findIndex((col) => /item_code|sku/i.test(col))
      const costIdx = header.findIndex((col) => /unit_cost|cost/i.test(col))
      const next: PhonePick[] = []
      for (const row of result.rows.slice(1)) {
        const imei = String(row[imeiIdx >= 0 ? imeiIdx : 0] || "").trim()
        if (!imei) continue
        next.push({
          imei,
          name: String(row[nameIdx >= 0 ? nameIdx : 3] || "").trim() || "Phone",
          sku: String(row[skuIdx >= 0 ? skuIdx : 2] || "").trim(),
          costPrice: money(Number(row[costIdx >= 0 ? costIdx : -1] || 0) || 0),
        })
      }
      setPhones(next)
      setPhonesBusy(false)
    })
    return () => {
      cancelled = true
    }
  }, [fromId])

  useEffect(() => {
    if (!toOptions.some((row) => row.id === toId)) {
      setToId(toOptions[0]?.id || "")
    }
  }, [fromId, toId, toOptions])

  function extractSelection(format: "csv" | "xlsx") {
    if (totalQty < 1) {
      toast.error("Select phones or type piece quantities before you extract.")
      return
    }
    const rows: Array<Array<string | number>> = [
      [
        "From shop",
        "To shop",
        "Item",
        "IMEI or item code",
        "Qty to send",
        "Unit cost",
        "Cost value",
      ],
      ...selectedPhones.map((row) => [
        fromShop?.name ?? "",
        toShop?.name ?? "",
        row.name,
        row.imei,
        1,
        money(row.costPrice).toFixed(2),
        money(row.costPrice).toFixed(2),
      ]),
      ...selectedAccessories.map(({ product, qty }) => [
        fromShop?.name ?? "",
        toShop?.name ?? "",
        product.name,
        product.sku,
        qty,
        money(product.costPrice).toFixed(2),
        (qty * money(product.costPrice)).toFixed(2),
      ]),
      [],
      ["Total qty to send", totalQty],
      ["Total cost value", totalCost.toFixed(2)],
    ]
    const stamp = new Date().toISOString().slice(0, 10)
    const base = `shop-to-shop-selection-${fromShop?.code ?? "from"}-to-${toShop?.code ?? "to"}-${stamp}`
    void downloadTable(rows, `${base}.${format}`, format)
    toast.success(format === "xlsx" ? "Excel extracted for this selection." : "CSV extracted for this selection.")
  }

  function extractAvailable(format: "csv" | "xlsx") {
    const rows: Array<Array<string | number>> = [
      [
        "Shop",
        "Kind",
        "Item",
        "IMEI or item code",
        "On hand",
        "Qty to send",
        "Unit cost",
        "Cost value if sent",
      ],
      ...phones.map((row) => {
        const sending = pickedImeis[row.imei] ? 1 : 0
        return [
          fromShop?.name ?? "",
          "Phone",
          row.name,
          row.imei,
          1,
          sending,
          money(row.costPrice).toFixed(2),
          sending ? money(row.costPrice).toFixed(2) : "0.00",
        ]
      }),
      ...accessories.map((product) => {
        const qty = Math.min(product.onShelf, Math.max(0, Math.floor(Number(accessoryQty[product.id]) || 0)))
        return [
          fromShop?.name ?? "",
          "Piece item",
          product.name,
          product.sku,
          product.onShelf,
          qty,
          money(product.costPrice).toFixed(2),
          (qty * money(product.costPrice)).toFixed(2),
        ]
      }),
      [],
      ["Selected qty to send", totalQty],
      ["Selected cost value", totalCost.toFixed(2)],
    ]
    const stamp = new Date().toISOString().slice(0, 10)
    const base = `shop-to-shop-stock-${fromShop?.code ?? "shop"}-${stamp}`
    void downloadTable(rows, `${base}.${format}`, format)
    toast.success(format === "xlsx" ? "Excel extracted for this shop stock." : "CSV extracted for this shop stock.")
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const imeis = Object.entries(pickedImeis)
      .filter(([, on]) => on)
      .map(([imei]) => imei)
    const accessoryLines = Object.entries(accessoryQty)
      .map(([productId, quantity]) => ({ productId, quantity: Number(quantity) || 0 }))
      .filter((row) => row.quantity > 0)
    data.set("selectedImeis", imeis.join("\n"))
    data.set("accessoryLines", JSON.stringify(accessoryLines))
    setBusy(true)
    setErrors([])
    const outcome = await createTransfer(data)
    setBusy(false)
    if (outcome.error) {
      toast.error(outcome.error)
      setErrors(outcome.errors ?? [outcome.error])
      return
    }
    toast.success("Transfer submitted. Stock stays In shop until the other shop accepts.")
    setPickedImeis({})
    setAccessoryQty({})
    form.reset()
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From (Branch)</span>
          <Select
            name="fromBranchId"
            value={fromId}
            onChange={(event) => setFromId(event.target.value)}
            required
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="block space-y-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">To (Pick the branch)</span>
          <Select name="toBranchId" value={toId} onChange={(event) => setToId(event.target.value)} required>
            {toOptions.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="space-y-3 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Select the items</p>
            <p className="text-xs text-muted-foreground">
              Find by IMEI, name, item code, or category. Type how many pieces to send. Cost value uses unit cost × qty to send.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => extractAvailable("csv")}>
              <Download className="mr-1.5 h-4 w-4" /> Extract stock (CSV)
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => extractAvailable("xlsx")}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Extract stock (Excel)
            </Button>
          </div>
        </div>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find IMEI, item code, name, brand, or category"
          aria-label="Find items to send"
        />

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Item</th>
                <th className="px-3 py-2 font-semibold">IMEI or item code</th>
                <th className="px-3 py-2 text-center font-semibold">On hand</th>
                <th className="px-3 py-2 text-center font-semibold">Qty to send</th>
                <th className="px-3 py-2 text-right font-semibold">Unit cost</th>
                <th className="px-3 py-2 text-right font-semibold">Cost value</th>
              </tr>
            </thead>
            <tbody>
              {phonesBusy ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Loading phones In shop at {fromShop?.name ?? "this branch"}
                  </td>
                </tr>
              ) : null}

              {!phonesBusy && visiblePhones.length === 0 && visibleAccessories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    No In shop items match this search at the sending branch.
                  </td>
                </tr>
              ) : null}

              {visiblePhones.map((phone) => {
                const sending = Boolean(pickedImeis[phone.imei])
                const unit = money(phone.costPrice)
                return (
                  <tr key={phone.imei} className="border-t border-border/70">
                    <td className="px-3 py-2">
                      <p className="font-medium">{phone.name}</p>
                      <p className="text-xs text-muted-foreground">Phone · qty 1</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{phone.imei}</td>
                    <td className="px-3 py-2 text-center tabular-nums">1</td>
                    <td className="px-3 py-2 text-center">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={sending}
                          onChange={(event) =>
                            setPickedImeis((current) => ({ ...current, [phone.imei]: event.target.checked }))
                          }
                          aria-label={`Send ${phone.imei}`}
                        />
                        <span className="tabular-nums font-semibold">{sending ? "1" : "0"}</span>
                      </label>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(unit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatCurrency(sending ? unit : 0)}
                    </td>
                  </tr>
                )
              })}

              {visibleAccessories.map((product) => {
                const raw = accessoryQty[product.id] ?? ""
                const qty = Math.min(product.onShelf, Math.max(0, Math.floor(Number(raw) || 0)))
                const unit = money(product.costPrice)
                return (
                  <tr key={product.id} className="border-t border-border/70">
                    <td className="px-3 py-2">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[product.brand?.name, product.category?.name].filter(Boolean).join(" · ") || "Piece item"}
                      </p>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{product.sku}</td>
                    <td className="px-3 py-2 text-center tabular-nums font-semibold">{product.onShelf}</td>
                    <td className="px-3 py-2 text-center">
                      <Input
                        type="number"
                        min={0}
                        max={product.onShelf}
                        step={1}
                        value={raw}
                        onChange={(event) =>
                          setAccessoryQty((current) => ({ ...current, [product.id]: event.target.value }))
                        }
                        placeholder="0"
                        aria-label={`Qty to send of ${product.name}`}
                        className="mx-auto h-9 w-24 text-center font-semibold tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(unit)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatCurrency(qty * unit)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {phones.length > visiblePhones.length && !needle ? (
          <p className="text-xs text-muted-foreground">
            Showing the first {visiblePhones.length} phones. Type in Find to narrow the list.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-3">
          <div className="text-sm">
            <p>
              <span className="text-muted-foreground">Qty to send: </span>
              <strong className="tabular-nums">{totalQty}</strong>
              <span className="text-muted-foreground">
                {" "}
                ({phoneQty} phone{phoneQty === 1 ? "" : "s"}
                {accessoryCount ? ` · ${accessoryCount} piece${accessoryCount === 1 ? "" : "s"}` : ""})
              </span>
            </p>
            <p className="mt-1">
              <span className="text-muted-foreground">Cost value at unit cost: </span>
              <strong className="tabular-nums">{formatCurrency(totalCost)}</strong>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={totalQty < 1} onClick={() => extractSelection("csv")}>
              <Download className="mr-1.5 h-4 w-4" /> Extract selection (CSV)
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={totalQty < 1} onClick={() => extractSelection("xlsx")}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Extract selection (Excel)
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        After you submit, wait for the receiving branch to accept or reject. Stock stays on the sending branch In shop record until they accept. Accept and Reject stay the same.
      </div>

      <Button type="submit" disabled={busy || totalQty < 1}>
        {busy ? "Submitting this transfer" : "Submit the transfer"}
      </Button>

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
