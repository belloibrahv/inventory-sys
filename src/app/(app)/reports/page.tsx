import { getReportData } from "@/app/actions/finance"
import { getBranches } from "@/app/actions/parties"
import { PageHeader } from "@/components/shared"
import { formatLagosStamp, watDayKey } from "@/lib/lagos-day"
import type { ReportsPack } from "@/lib/reports-pack"
import { getAppSettings, lowStockLimit } from "@/lib/settings"
import { requireUser } from "@/lib/session"
import { money } from "@/lib/utils"
import { ReportsClientView } from "./reports-client-view"

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>
}) {
  const params = await searchParams
  const selectedBranchId = params.branchId || undefined

  const [data, settings, user, branches] = await Promise.all([
    getReportData(selectedBranchId),
    getAppSettings(),
    requireUser(),
    getBranches(),
  ])

  const revenue = data.sales.reduce((sum, sale) => sum + money(sale.totalAmount), 0)
  const collected = data.sales.reduce((sum, sale) => sum + money(sale.paidAmount), 0)
  const expense = data.expenses.reduce((sum, row) => sum + money(row.amount), 0)
  const stock = data.inventory.reduce((sum, row) => sum + row.quantity * money(row.product.costPrice), 0)
  const swapValue = data.swaps.reduce((sum, row) => sum + money(row.balanceAmount), 0)
  const owing = data.debtors.reduce((sum, row) => sum + money(row.currentBalance), 0)
  const lowStock = data.inventory.filter((row) => row.quantity <= lowStockLimit(row.minStock, settings.lowStockThreshold))

  const byShop = Object.values(
    data.sales.reduce<Record<string, { name: string; revenue: number; collected: number; tickets: number }>>((acc, sale) => {
      const key = sale.branch.id
      acc[key] = acc[key] ?? { name: sale.branch.name, revenue: 0, collected: 0, tickets: 0 }
      acc[key].revenue += money(sale.totalAmount)
      acc[key].collected += money(sale.paidAmount)
      acc[key].tickets += 1
      return acc
    }, {})
  ).sort((a, b) => b.revenue - a.revenue)

  const selectedBranch = branches.find((b) => b.id === selectedBranchId)
  const scope = selectedBranch ? `${selectedBranch.name} (${selectedBranch.code})` : "All shops together"

  const pack: ReportsPack = {
    company: {
      name: settings.companyName,
      product: settings.productName,
      phone: settings.companyPhone,
      address: settings.companyAddress,
      email: settings.companyEmail,
    },
    scope,
    preparedAt: new Date().toISOString(),
    preparedBy: user.name || user.email,
    statementRef: `RP-${selectedBranch ? selectedBranch.code : "ALL"}-${watDayKey().replaceAll("-", "")}`,
    totals: {
      revenue,
      collected,
      expenses: expense,
      stock,
      invoices: data.sales.length,
      owing,
      swaps: swapValue,
      returns: data.returns.length,
    },
    byShop,
    debtors: data.debtors.map((row) => ({
      id: row.id,
      name: row.name,
      shop: row.branch.code,
      amount: money(row.currentBalance),
    })),
    creditors: data.creditors.map((row) => ({
      id: row.id,
      invoice: row.invoiceNumber,
      supplier: row.supplier,
      shop: row.branch,
      owed: row.owed,
    })),
    lowStock: lowStock.map((row) => ({
      id: row.id,
      product: row.product.name,
      shop: row.branch.code,
      quantity: row.quantity,
      min: row.minStock,
    })),
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={`One paper on how the shops are doing: sales, money in, stock worth, spending, and who still owes you. As at ${formatLagosStamp()}.`}
      />
      <ReportsClientView
        pack={pack}
        sales={data.sales}
        expenses={data.expenses}
        inventory={data.inventory}
        branches={branches}
        selectedBranchId={selectedBranchId}
      />
    </div>
  )
}

