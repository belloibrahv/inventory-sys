import { getProfitData } from "@/app/actions/finance"
import { PageHeader, StatusBadge } from "@/components/shared"
import { ExportCsv } from "@/components/export-csv"
import { formatCurrency, formatDate } from "@/lib/utils"
import { formatCondition } from "@/lib/status"

export default async function ProfitsPage() {
  const data = await getProfitData()
  const shopProfit = data.shopLines.reduce((sum, row) => sum + row.profit, 0)
  const neighborProfit = data.neighborLines.reduce((sum, row) => sum + row.profit, 0)
  const net = shopProfit + neighborProfit - data.expenses

  const csvRows = [
    ["Direct Inventory Sales Margins"],
    ["Invoice", "Shop", "Date", "Product", "Storage", "Condition", "Color", "Quantity", "Cost Price", "Revenue", "Gross Margin"],
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
    [],
    ["External Partner Fulfillment Margins"],
    ["Order Ref", "Shop", "Date", "Partner", "Customer", "Item", "Cost", "Revenue", "Retained Margin", "Status"],
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
        title="Gross & Net Profit Analytics"
        description="Gross margin realized on warehouse sales, retained margin on external partner fulfillment, and net operating income after OPEX deductions."
        actions={
          <ExportCsv
            filename={`profit-analytics-${new Date().toISOString().slice(0, 10)}.csv`}
            label="Export Profit Ledger (CSV)"
            rows={csvRows}
          />
        }
      />
      <div className="grid gap-4 md:grid-cols-4">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Inventory Sales Margin</p>
          <p className="text-2xl font-semibold">{formatCurrency(shopProfit)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Partner Sourcing Margin</p>
          <p className="text-2xl font-semibold">{formatCurrency(neighborProfit)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Authorized OPEX</p>
          <p className="text-2xl font-semibold">{formatCurrency(data.expenses)}</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Net Operating Margin</p>
          <p className="text-2xl font-semibold">{formatCurrency(net)}</p>
        </div>
      </div>
      {data.byShop.length ? (
        <div className="surface-card overflow-hidden">
          <h3 className="border-b border-border px-5 py-4 font-semibold">Profitability by Branch Location</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Branch Location</th>
                <th className="px-3 py-3">Inventory Margin</th>
                <th className="px-3 py-3">Partner Margin</th>
                <th className="px-3 py-3">Operating OPEX</th>
                <th className="px-5 py-3">Net Contribution</th>
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
          <h3 className="border-b border-border px-5 py-4 font-semibold">Direct Inventory Sales Margins</h3>
          {data.shopLines.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">No completed sales transactions recorded for this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-5 py-3">Invoice Ref</th>
                  <th className="px-3 py-3">Product & Specifications</th>
                  <th className="px-3 py-3">Cost Price</th>
                  <th className="px-3 py-3">Revenue</th>
                  <th className="px-5 py-3">Gross Margin</th>
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
                      <p className="font-semibold text-foreground">{row.item}</p>
                      <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                        {row.storage ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{row.storage}</span>
                        ) : null}
                        {row.condition ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{formatCondition(row.condition)}</span>
                        ) : null}
                        {row.color ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{row.color}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-muted-foreground">{formatCurrency(row.cost)}</td>
                    <td className="px-3 py-3 tabular-nums">{formatCurrency(row.sell)}</td>
                    <td className="px-5 py-3 tabular-nums font-semibold text-success">{formatCurrency(row.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="surface-card overflow-hidden">
          <h3 className="border-b border-border px-5 py-4 font-semibold">External Partner Fulfillment Margins</h3>
          {data.neighborLines.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">No partner cross-fulfillment transactions completed.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-5 py-3">Order Ref</th>
                  <th className="px-3 py-3">Partner Merchant</th>
                  <th className="px-3 py-3">Retained Margin</th>
                  <th className="px-5 py-3">Fulfillment Status</th>
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
