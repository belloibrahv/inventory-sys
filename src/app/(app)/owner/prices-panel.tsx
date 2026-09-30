"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { setProductPrices } from "@/app/actions/catalog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/utils"

export type PanelItem = {
  id: string
  name: string
  sku: string
  brand: string
  category: string
  units: number
  costPrice: number
  minimumPrice: number
  sellingPrice: number
}

const SHOWN = 8

/** Mark-up over cost, the way the shop reasons about margin. */
function markup(cost: number, selling: number) {
  return cost > 0 ? ((selling - cost) / cost) * 100 : null
}

/**
 * The CEO's price desk on Business today: find an item, see what it cost and
 * what it keeps, change its prices. Nobody else is sent this panel or the
 * costs in it.
 */
export function PricesPanel({ items }: { items: PanelItem[] }) {
  const [query, setQuery] = useState("")

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      // With nothing typed, the thinnest margins come first: those are the
      // prices most worth a second look.
      return [...items]
        .filter((item) => item.units > 0)
        .sort((a, b) => (markup(a.costPrice, a.sellingPrice) ?? Infinity) - (markup(b.costPrice, b.sellingPrice) ?? Infinity))
        .slice(0, SHOWN)
    }
    return items
      .filter((item) =>
        [item.name, item.sku, item.brand, item.category].some((text) => text.toLowerCase().includes(needle))
      )
      .slice(0, SHOWN)
  }, [items, query])

  return (
    <div className="surface-card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-semibold">Prices</h3>
          <p className="text-sm text-muted-foreground">
            Only you see cost and margin, and only you change prices.{" "}
            {query.trim() ? "" : "Thinnest margins first."}
          </p>
        </div>
        <Link href="/products" className="text-sm font-medium text-primary hover:underline">
          Full price list
        </Link>
      </div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find an item by name, code, brand or kind"
          aria-label="Find an item to price"
          className="pl-9"
        />
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {query.trim() ? `Nothing matches "${query.trim()}".` : "No item is on the shelf yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {shown.map((item) => (
            <PriceRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  )
}

function PriceRow({ item }: { item: PanelItem }) {
  const router = useRouter()
  const [cost, setCost] = useState(String(item.costPrice))
  const [lowest, setLowest] = useState(String(item.minimumPrice))
  const [selling, setSelling] = useState(String(item.sellingPrice))
  const [busy, setBusy] = useState(false)

  const typed = { cost: Number(cost), lowest: Number(lowest), selling: Number(selling) }
  const changed =
    typed.cost !== item.costPrice || typed.lowest !== item.minimumPrice || typed.selling !== item.sellingPrice
  const margin = markup(typed.cost, typed.selling)
  const underCost = typed.cost > 0 && typed.lowest < typed.cost

  async function save() {
    setBusy(true)
    const result = await setProductPrices({
      id: item.id,
      costPrice: typed.cost,
      minimumPrice: typed.lowest,
      sellingPrice: typed.selling,
    })
    setBusy(false)
    if ("error" in result && result.error) {
      toast.error(result.error)
      return
    }
    toast.success(("message" in result && result.message) || "Prices saved.")
    router.refresh()
  }

  const field = (label: string, value: string, set: (value: string) => void) => (
    <label className="block min-w-0 text-xs">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={value}
        onChange={(event) => set(event.target.value)}
        className="h-9 tabular-nums"
        aria-label={`${label} for ${item.name}`}
      />
    </label>
  )

  return (
    <li className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium leading-snug">{item.name}</p>
          {/* Wraps rather than cutting off, so the shelf count stays in view on a phone. */}
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {item.brand} · {item.category} · <span className="font-mono">{item.sku}</span> · {item.units} on shelf
          </p>
        </div>
        <p
          className={`shrink-0 text-right text-sm font-semibold tabular-nums ${
            margin === null ? "text-muted-foreground" : margin < 0 ? "text-danger" : margin < 10 ? "text-warning" : "text-success"
          }`}
        >
          {margin === null ? "No cost" : `${margin > 0 ? "+" : ""}${margin.toFixed(1)}%`}
          <span className="block text-[11px] font-normal text-muted-foreground">
            {typed.cost > 0 ? `${formatCurrency(typed.selling - typed.cost)} each` : "margin"}
          </span>
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end">
        {field("Cost", cost, setCost)}
        {field("Lowest", lowest, setLowest)}
        {field("Selling", selling, setSelling)}
        <Button
          type="button"
          size="sm"
          className="col-span-3 h-9 sm:col-span-1"
          disabled={!changed || busy}
          onClick={save}
        >
          {busy ? "Saving" : "Save"}
        </Button>
      </div>
      {underCost ? <p className="text-xs text-warning">The lowest price is under cost, so staff could sell at a loss.</p> : null}
    </li>
  )
}
