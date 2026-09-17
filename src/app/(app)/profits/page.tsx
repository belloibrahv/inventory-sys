import { getProfitData } from "@/app/actions/finance"
import { PageHeader, StatusBadge } from "@/components/shared"
import { ExportCsv } from "@/components/export-csv"
import { formatCurrency, formatDate } from "@/lib/utils"
import { formatCondition } from "@/lib/status"

function productLine(row: {
  item: string
  storage?: string | null
  condition?: string | null
  color?: string | null
}) {
  return [row.item, row.storage, row.condition ? formatCondition(row.condition) : null, row.color]
    .filter(Boolean)
    .join(" · ")
}

export default async function ProfitsPage() {
  const data = await getProfitData()
  const shopProfit = data.shopLines.reduce((sum, row) => sum + row.profit, 0)
  const neighborProfit = data.neighborLines.reduce((sum, row) => sum + row.profit, 0)
  const net = shopProfit + neighborProfit - data.expenses

  const shopCsvRows = [
    ["Invoice", "Shop", "Date", "Product", "Storage", "How it looks", "Color", "Quantity", "Cost price", "Sold for", "Profit"],
    ...data.shopLines.map((row) => [
      row.invoice,
      row.shop,
      formatDate(row.date),
      row.item,
      row.storage ?? "",
      row.condition ? formatCondition(row.condition) : "",
      row.color ?? "",
      String(row.quantity),
      String(row.cost),
      String(row.sell),
      String(row.profit),
    ]),
  ]

  const csvRows = [
    ["Money we made on phones we sold from our own shop"],
    ...shopCsvRows,
    [],
    ["Money we kept when we filled an order from a neighbor shop"],
    ["Order", "Shop", "Date", "Neighbor", "Customer", "Item", "Cost", "Sold for", "Our profit", "Status"],
    ...data.neighborLines.map((row) => [
      row.fillNumber,
      row.shop,
      formatDate(row.date),
      row.neighbor,
      row.customer,
      row.item,
      String(row.cost),
      String(row.sell),
      String(row.profit),
      row.status,
    ]),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profit"
        description="Sell price minus cost, after shop bills."
        actions={
          <ExportCsv
            filename={`profit-${new Date().toISOString().slice(0, 10)}.csv`}
            label="Extract full profit list"
            rows={csvRows}
          />
        }
      />
      <div className="grid gap-4 md:grid-cols-4">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Profit from our own stock</p>
          <p className="text-2xl font-semibold">{formatCurrency(shopProfit)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Profit from neighbor fills</p>
          <p className="text-2xl font-semibold">{formatCurrency(neighborProfit)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Approved shop bills</p>
          <p className="text-2xl font-semibold">{formatCurrency(data.expenses)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">What is left</p>
          <p className="text-2xl font-semibold">{formatCurrency(net)}</p>
        </div>
      </div>
      {data.byShop.length ? (
        <div className="surface-card overflow-hidden">
          <h3 className="border-b border-border px-5 py-4 font-semibold">Profit by shop</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-foreground/80">
              <tr className="border-b border-border bg-muted/40">
                <th className="px-5 py-3 font-semibold">Shop</th>
                <th className="px-3 py-3 font-semibold">Our stock</th>
                <th className="px-3 py-3 font-semibold">Neighbor fills</th>
                <th className="px-3 py-3 font-semibold">Shop bills</th>
                <th className="px-5 py-3 font-semibold">Left for this shop</th>
              </tr>
            </thead>
            <tbody>
              {data.byShop.map((row) => (
                <tr key={row.name} className="border-b border-border/70">
                  <td className="px-5 py-3">{row.name}</td>
                  <td className="px-3 py-3">{formatCurrency(row.shopProfit)}</td>
                  <td className="px-3 py-3">{formatCurrency(row.neighborProfit)}</td>
                  <td className="px-3 py-3">{formatCurrency(row.expenses)}</td>
                  <td className="px-5 py-3 font-semibold">{formatCurrency(row.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="surface-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
            <h3 className="font-semibold">Sales from our own stock</h3>
            <ExportCsv
              filename={`own-stock-margins-${new Date().toISOString().slice(0, 10)}.csv`}
              label="Extract this list"
              rows={shopCsvRows}
            />
          </div>
          {data.shopLines.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">No sales from our own stock in this period yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-foreground/80">
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-3 font-semibold">Invoice</th>
                  <th className="px-3 py-3 font-semibold">Phone / item</th>
                  <th className="px-3 py-3 font-semibold">Cost price</th>
                  <th className="px-3 py-3 font-semibold">Sold for</th>
                  <th className="px-5 py-3 font-semibold">Profit</th>
                </tr>
              </thead>
              <tbody>
                {data.shopLines.slice(0, 40).map((row) => (
                  <tr key={row.id} className="border-b border-border/70">
                    <td className="px-5 py-3">
                      {row.invoice}
                      <p className="text-muted-foreground">{row.shop} · {formatDate(row.date)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-foreground">{productLine(row)}</p>
                    </td>
                    <td className="px-3 py-3 tabular-nums font-medium">{formatCurrency(row.cost)}</td>
                    <td className="px-3 py-3 tabular-nums">{formatCurrency(row.sell)}</td>
                    <td className="px-5 py-3 tabular-nums font-semibold text-success">{formatCurrency(row.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="surface-card overflow-hidden">
          <h3 className="border-b border-border px-5 py-4 font-semibold">Neighbor shop fills</h3>
          {data.neighborLines.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">No neighbor fill sales in this period yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-foreground/80">
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-3 py-3 font-semibold">Neighbor</th>
                  <th className="px-3 py-3 font-semibold">Our profit</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.neighborLines.slice(0, 40).map((row) => (
                  <tr key={row.id} className="border-b border-border/70">
                    <td className="px-5 py-3">
                      {row.fillNumber}
                      <p className="text-muted-foreground">{row.item} · {row.customer}</p>
                    </td>
                    <td className="px-3 py-3">{row.neighbor}</td>
                    <td className="px-3 py-3">{formatCurrency(row.profit)}</td>
                    <td className="px-5 py-3"><StatusBadge value={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
