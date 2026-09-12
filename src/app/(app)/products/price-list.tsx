"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { updateSelectedPrices } from "@/app/actions/catalog"
import { StatusBadge } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/utils"

export type PriceRow = {
  id: string
  sku: string
  name: string
  brand: string
  color: string | null
  storage: string | null
  tracking: string
  condition: string
  costPrice: number
  minimumPrice: number
  sellingPrice: number
  warrantyDays: number
  units: number
}

function trackingLabel(tracking: string) {
  if (tracking === "SERIAL") return "serial"
  if (tracking === "NONE") return "no number"
  return "IMEI"
}

export function ProductPriceList({
  products,
  canEdit,
  initialQuery = "",
}: {
  products: PriceRow[]
  canEdit: boolean
  initialQuery?: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return products
    return products.filter((product) => {
      const hay = [product.name, product.sku, product.brand, product.color, product.storage, product.condition]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(needle)
    })
  }, [products, query])

  const pager = usePagedRows(visible, query)
  const selected = products.filter((product) => ticked[product.id])

  function setTick(id: string, next: boolean, currentPrice: number) {
    setTicked((prev) => ({ ...prev, [id]: next }))
    if (next) {
      setPrices((prev) => (prev[id] == null || prev[id] === "" ? { ...prev, [id]: String(currentPrice) } : prev))
    }
  }

  function tickVisible(next: boolean) {
    setTicked((prev) => {
      const copy = { ...prev }
      for (const product of pager.pageRows) copy[product.id] = next
      return copy
    })
    if (next) {
      setPrices((prev) => {
        const copy = { ...prev }
        for (const product of pager.pageRows) {
          if (copy[product.id] == null || copy[product.id] === "") copy[product.id] = String(product.sellingPrice)
        }
        return copy
      })
    }
  }

  async function onSave() {
    if (!canEdit) return
    if (selected.length === 0) {
      toast.error("Tick the items whose prices you want to change.")
      return
    }
    const changes: Array<{ id: string; sellingPrice: number }> = []
    for (const product of selected) {
      const sellingPrice = Number(prices[product.id])
      if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
        toast.error(`Enter a new selling price for ${product.name}.`)
        return
      }
      changes.push({ id: product.id, sellingPrice })
    }
    if (changes.length > 200) {
      toast.error("You can change up to 200 items at a time.")
      return
    }

    const data = new FormData()
    data.set("changes", JSON.stringify(changes))
    data.set("reason", reason)
    setBusy(true)
    const outcome = await updateSelectedPrices(data)
    setBusy(false)
    if (outcome.error) {
      toast.error(outcome.error)
      return
    }
    const count = outcome.updated ?? changes.length
    toast.success(count === 1 ? "Updated 1 selling price" : `Updated ${count} selling prices`)
    setTicked({})
    setPrices({})
    setReason("")
    router.refresh()
  }

  return (
    <div className="surface-card overflow-hidden">
      <div className="space-y-3 border-b border-border p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find item code, brand, or model"
            aria-label="Find item code, brand, or model"
            className="max-w-xl"
          />
          <p className="text-sm text-muted-foreground">
            {visible.length === 1 ? "1 item" : `${visible.length} items`}
            {query.trim() ? " match this search" : " on the list"}
          </p>
        </div>
        {canEdit ? (
          <p className="text-sm text-muted-foreground">
            Tick any mix of phones and accessories on this page. Type each new selling price. One save updates all of
            them. You still sell by the unit, not by carton.
          </p>
        ) : null}
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => tickVisible(true)}>
              Tick all on this page
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => tickVisible(false)}>
              Clear ticks on this page
            </Button>
          </div>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border">
              {canEdit ? <th className="px-4 py-3">Tick</th> : null}
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Condition</th>
              <th className="px-4 py-3">Cost / Lowest / Sell</th>
              {canEdit ? <th className="px-4 py-3">New selling price</th> : null}
              <th className="px-4 py-3">Warranty</th>
              <th className="px-4 py-3">Units</th>
            </tr>
          </thead>
          <tbody>
            {pager.pageRows.map((product) => {
              const chosen = Boolean(ticked[product.id])
              return (
                <tr key={product.id} className="border-b border-border/70">
                  {canEdit ? (
                    <td className="px-4 py-3 align-top">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={chosen}
                        onChange={(event) => setTick(product.id, event.target.checked, product.sellingPrice)}
                        aria-label={`Tick ${product.name}`}
                      />
                    </td>
                  ) : null}
                  <td className="px-4 py-3">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.sku} · {product.brand}
                      {product.color ? ` · ${product.color}` : ""}
                      {product.storage ? ` ${product.storage}` : ""}
                      {` · ${trackingLabel(product.tracking)}`}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={product.condition} />
                  </td>
                  <td className="px-4 py-3">
                    {formatCurrency(product.costPrice)} / {formatCurrency(product.minimumPrice)} /{" "}
                    {formatCurrency(product.sellingPrice)}
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        disabled={!chosen}
                        value={prices[product.id] ?? ""}
                        onChange={(event) => setPrices((prev) => ({ ...prev, [product.id]: event.target.value }))}
                        placeholder="New selling price"
                        aria-label={`New selling price for ${product.name}`}
                      />
                    </td>
                  ) : null}
                  <td className="px-4 py-3">{product.warrantyDays} days</td>
                  <td className="px-4 py-3">{product.units}</td>
                </tr>
              )
            })}
            {visible.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-sm text-muted-foreground" colSpan={canEdit ? 7 : 5}>
                  No item on this list matches that search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePager
        page={pager.page}
        pageCount={pager.pageCount}
        pageSize={pager.pageSize}
        total={pager.total}
        start={pager.start}
        end={pager.end}
        onPageChange={pager.setPage}
        onPageSizeChange={pager.setPageSize}
        noun="items"
      />
      {canEdit ? (
        <div className="space-y-3 border-t border-border p-4">
          <p className="text-sm font-medium">
            {selected.length === 1 ? "1 item ticked" : `${selected.length} items ticked`}
          </p>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why you are changing these prices"
            aria-label="Why you are changing these prices"
          />
          <Button type="button" onClick={onSave} disabled={busy}>
            {busy ? "Saving selected prices" : "Update selected prices"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
