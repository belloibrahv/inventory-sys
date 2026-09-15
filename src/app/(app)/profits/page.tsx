import { getProfitData } from "@/app/actions/finance"
import { PageHeader, StatusBadge } from "@/components/shared"
import { formatCurrency, formatDate } from "@/lib/utils"

export default async function ProfitsPage() {
  const data = await getProfitData()
  const shopProfit = data.shopLines.reduce((sum, row) => sum + row.profit, 0)
  const neighborProfit = data.neighborLines.reduce((sum, row) => sum + row.profit, 0)
  const net = shopProfit + neighborProfit - data.expenses

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gross & Net Profit Analytics"
        description="Gross margin realized on warehouse sales, retained margin on external partner fulfillment, and net operating income after OPEX deductions."
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
                  <th className="px-3 py-3">Product</th>
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
                    <td className="px-3 py-3">{row.item}</td>
                    <td className="px-3 py-3">{formatCurrency(row.sell)}</td>
                    <td className="px-5 py-3">{formatCurrency(row.profit)}</td>
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
