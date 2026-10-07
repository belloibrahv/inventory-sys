import Link from "next/link"
import { notFound } from "next/navigation"
import { getItemActivity } from "@/app/actions/item-activity"
import { PageHeader } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { formatShopWhen } from "@/lib/lagos-day"
import { formatCurrency } from "@/lib/utils"
import { ItemActivityView } from "./item-activity-view"

export default async function ItemActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getItemActivity(id)
  if (!data) notFound()
  const { product, summary } = data

  const tiles: Array<[string, string, string?]> = [
    ["Created", formatShopWhen(product.createdAt)],
    ["Booked in", summary.bookedIn.toLocaleString("en-NG"), summary.lastBookedIn ? `last ${formatShopWhen(summary.lastBookedIn)}` : undefined],
    ["Sold", summary.sold.toLocaleString("en-NG"), summary.lastSold ? `last ${formatShopWhen(summary.lastSold)}` : "not sold yet"],
    ["Returned by buyers", summary.returnedIn.toLocaleString("en-NG")],
    ["In stock now", summary.inStock.toLocaleString("en-NG"), data.scope],
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        description={[product.specs, product.brand, product.category, product.sku].filter(Boolean).join(" · ")}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/products/activity">Another item</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className="surface-card p-4">
            <p className="eyebrow">{label}</p>
            <p className="mt-1.5 text-xl font-semibold tabular-nums">{value}</p>
            {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="surface-card p-5">
          <h3 className="mb-3 font-semibold">Stock in each shop</h3>
          {data.stock.length ? (
            <ul className="divide-y divide-border text-sm">
              {data.stock.map((row) => (
                <li key={row.code} className="flex justify-between py-2">
                  <span>{row.shop}</span>
                  <span className="font-semibold tabular-nums">{row.quantity}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No shop holds this item.</p>
          )}
        </div>
        <div className="surface-card p-5">
          <h3 className="mb-3 font-semibold">Prices now</h3>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Selling</dt>
              <dd className="font-semibold tabular-nums">{formatCurrency(product.sellingPrice)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Lowest allowed</dt>
              <dd className="font-semibold tabular-nums">{formatCurrency(product.minimumPrice)}</dd>
            </div>
            {product.costPrice != null ? (
              <div>
                <dt className="text-xs text-muted-foreground">Cost</dt>
                <dd className="font-semibold tabular-nums">{formatCurrency(product.costPrice)}</dd>
              </div>
            ) : null}
          </dl>
          {Object.keys(summary.unitsByStatus).length ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Phones under this item:{" "}
              {Object.entries(summary.unitsByStatus)
                .map(([status, count]) => `${count} ${status.replace(/_/g, " ").toLowerCase()}`)
                .join(" · ")}
            </p>
          ) : null}
        </div>
      </div>

      <ItemActivityView
        itemName={product.name}
        sku={product.sku}
        showCost={data.showCost}
        moves={data.moves}
        bills={data.bills}
        sales={data.sales}
        prices={data.prices}
        units={data.units}
        returns={data.returns}
      />
    </div>
  )
}
