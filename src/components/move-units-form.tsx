"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { moveUnitsToItem } from "@/app/actions/catalog"
import { searchItemsForActivity } from "@/app/actions/item-activity"
import { ScanList } from "@/components/scan-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { SHOP_CONDITION_OPTIONS } from "@/lib/conditions"
import { cn } from "@/lib/utils"

export type MoveSource = {
  id: string
  name: string
  storage: string | null
  ram: string | null
  color: string | null
  condition: string
}

type Found = { id: string; name: string; sku: string; specs: string }

/**
 * Move phones booked under the wrong item to the right one: an item already
 * on the list, or a corrected copy of this item (same brand, prices and
 * warranty, with the storage, colour or condition fixed). Phones written off
 * by mistake can be put back in the shop on the way.
 */
export function MoveUnitsForm({ source, presetCodes = [], onDone }: { source: MoveSource; presetCodes?: string[]; onDone?: (targetId?: string) => void }) {
  const router = useRouter()
  const [mode, setMode] = useState<"copy" | "existing">("copy")
  const [query, setQuery] = useState("")
  const [found, setFound] = useState<Found[]>([])
  const [searching, setSearching] = useState(false)
  const [target, setTarget] = useState<Found | null>(null)
  const [busy, setBusy] = useState(false)

  async function search() {
    if (query.trim().length < 2) {
      toast.error("Type at least two letters of the item's name or code.")
      return
    }
    setSearching(true)
    const rows = await searchItemsForActivity(query)
    setSearching(false)
    setFound(rows.filter((row) => row.id !== source.id).map(({ id, name, sku, specs }) => ({ id, name, sku, specs })))
    if (!rows.length) toast.error("No item matches. Try part of the name, or make a corrected copy instead.")
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (mode === "existing") {
      if (!target) {
        toast.error("Pick the item to move the phones to.")
        return
      }
      data.set("targetProductId", target.id)
    } else {
      data.set("copyFromProductId", source.id)
    }
    setBusy(true)
    const result = await moveUnitsToItem(data)
    setBusy(false)
    if ("error" in result && result.error) {
      toast.error(result.error)
      return
    }
    toast.success("message" in result && result.message ? result.message : "Phones moved.")
    router.refresh()
    onDone?.("targetId" in result ? result.targetId : undefined)
  }

  return (
    <form onSubmit={onSubmit} onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT" && event.preventDefault()} className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Phones to move</p>
        {presetCodes.length ? (
          <>
            <input type="hidden" name="codes" value={presetCodes.join("\n")} />
            <p className="rounded-lg bg-muted px-3 py-2 font-mono text-xs">{presetCodes.join(", ")}</p>
          </>
        ) : (
          <ScanList name="codes" kind="ANY" />
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Move them to</p>
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/60 p-1 text-xs font-semibold">
          {(
            [
              ["copy", "A corrected copy of this item"],
              ["existing", "An item already on the list"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={cn("rounded-lg px-2 py-2 transition", mode === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-card")}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "copy" ? (
          <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground">Item name</span>
              <Input name="name" defaultValue={source.name} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Storage</span>
              <Input name="storage" defaultValue={source.storage ?? ""} placeholder="e.g. 256GB" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">RAM</span>
              <Input name="ram" defaultValue={source.ram ?? ""} placeholder="e.g. 8GB" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Colour</span>
              <Input name="color" defaultValue={source.color ?? ""} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Condition</span>
              <Select name="condition" defaultValue={source.condition}>
                {SHOP_CONDITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Fix what was booked wrong. Brand, category, prices and warranty are copied from {source.name}. If an item with
              exactly these details already exists, the phones go to it instead of a new one.
            </p>
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void search()
                  }
                }}
                placeholder="Item name, code, storage or colour"
                className="min-w-0 flex-1"
              />
              <Button type="button" variant="outline" onClick={() => void search()} disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
              </Button>
            </div>
            {found.length ? (
              <ul className="max-h-56 divide-y divide-border overflow-auto rounded-lg border border-border">
                {found.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setTarget(row)}
                      className={cn("w-full px-3 py-2 text-left text-sm", target?.id === row.id ? "bg-success-soft" : "hover:bg-muted/60")}
                    >
                      <span className="block font-medium">{row.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[row.specs, row.sku].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {target ? (
              <p className="text-sm">
                Moving to <span className="font-semibold">{target.name}</span>
                {target.specs ? <span className="text-muted-foreground"> · {target.specs}</span> : null}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <label className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft/50 p-3 text-sm">
        <input type="checkbox" name="restoreWrittenOff" className="mt-0.5 h-4 w-4" />
        <span>
          <span className="font-medium">Put written-off phones back in the shop.</span>
          <span className="block text-xs text-muted-foreground">
            Tick this when a phone was written off with Reduce stock by mistake. It goes back In shop under the right item.
          </span>
        </span>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Why (optional, kept on Who did what)</span>
        <Input name="reason" placeholder="e.g. booked as 128GB, really 256GB" />
      </label>

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Move the phones
      </Button>
    </form>
  )
}
