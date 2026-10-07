import Link from "next/link"
import { ChevronRight, History } from "lucide-react"
import { searchItemsForActivity } from "@/app/actions/item-activity"
import { PageHeader } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default async function ItemActivityPickerPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams
  const items = q.trim().length >= 2 ? await searchItemsForActivity(q) : []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Item activity"
        description="Pick an item to see its whole life at a glance: when it was created, what was booked in, sold, moved and returned, and where every phone under it is now."
      />
      <form className="surface-card grid grid-cols-[1fr_auto] gap-2 p-3">
        <Input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="Item name, item code, storage, colour, or any phone's IMEI or serial"
          aria-label="Find an item"
        />
        <Button type="submit">Find</Button>
      </form>

      {q.trim().length < 2 ? (
        <p className="text-sm text-muted-foreground">
          Type at least two letters or digits. An IMEI or serial finds the item that phone belongs to.
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing matches &ldquo;{q}&rdquo;. Try part of the name, or the IMEI.</p>
      ) : (
        <ul className="surface-card divide-y divide-border overflow-hidden p-0">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/products/activity/${item.id}`}
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {item.name}
                    {item.isActive ? null : <span className="ml-2 text-xs font-normal text-muted-foreground">(off the list)</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {[item.specs, item.brand].filter(Boolean).join(" · ")} · <span className="font-mono">{item.sku}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  {item.inStock}
                  <span className="block text-[11px] text-muted-foreground">in stock</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
