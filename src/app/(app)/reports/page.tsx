import { getReportData } from "@/app/actions/finance"
import { getOpeningReport } from "@/app/actions/opening-stock"
import { getBranches } from "@/app/actions/parties"
import { PageHeader } from "@/components/shared"
import { formatWatLong, watDayKey, type ShopRange } from "@/lib/lagos-day"
import type { ReportsPack } from "@/lib/reports-pack"
import { getAppSettings, lowStockLimit } from "@/lib/settings"
import { requireUser } from "@/lib/session"
import { money } from "@/lib/utils"
import { saleTenders } from "@/lib/sale-money"
import { plainMoney } from "@/lib/plain"
import { ReportsClientView } from "./reports-client-view"

function shopOf(branch: { name: string; code: string }) {
  return { name: branch.name, code: branch.code }
}

function asRange(value?: string): ShopRange {
  return value === "week" || value === "day" ? value : "month"
}

function periodLabel(range: ShopRange, from: string, to: string) {
  if (range === "day") return formatWatLong(from)
  return `${formatWatLong(from)} to ${formatWatLong(to)}`
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string; range?: string; date?: string }>
}) {
  const params = await searchParams
  const selectedBranchId = params.branchId || undefined
  const range = asRange(params.range)
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : watDayKey()

  const [data, settings, user, branches, opening] = await Promise.all([
    getReportData(selectedBranchId, range, date),
    getAppSettings(),
    requireUser(),
    getBranches(),
    getOpeningReport(selectedBranchId),
  ])

  const revenue = data.sales.reduce((sum, sale) => sum + money(sale.totalAmount), 0)
  const collected = data.sales.reduce((sum, sale) => sum + saleTenders(sale).received, 0)
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
      acc[key].collected += saleTenders(sale).received
      acc[key].tickets += 1
      return acc
    }, {})
  ).sort((a, b) => b.revenue - a.revenue)

  const selectedBranch = branches.find((b) => b.id === selectedBranchId)
  const scope = selectedBranch ? `${selectedBranch.name} (${selectedBranch.code})` : "All shops together"
  const label = periodLabel(range, data.period.from, data.period.to)

  const pack: ReportsPack = {
    company: {
      name: settings.companyName,
      product: settings.productName,
      phone: settings.companyPhone,
      address: settings.companyAddress,
      email: settings.companyEmail,
      logo: settings.companyLogo,
      footer: settings.companyFooter,
    },
    scope,
    preparedAt: new Date().toISOString(),
    preparedBy: user.name || user.email,
    statementRef: `RP-${selectedBranch ? selectedBranch.code : "ALL"}-${range.toUpperCase()}-${data.period.from.replaceAll("-", "")}`,
    periodLabel: label,
    range,
    from: data.period.from,
    to: data.period.to,
    compare: data.prior,
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
    supplierCredits: (data.supplierCredits ?? []).map((row) => ({
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
        description={`Sales, money in, stock, and who still owes for ${label}.`}
      />
      <ReportsClientView
        pack={pack}
        // Only the fields the report reads. The rows arrive with their line
        // items, payments and full shop and customer records attached, which
        // made a month's report several megabytes on a phone.
        sales={data.sales.map((row) => ({
          id: row.id,
          invoiceNumber: row.invoiceNumber,
          totalAmount: money(row.totalAmount),
          paidAmount: money(row.paidAmount),
          saleDate: row.saleDate,
          customer: row.customer ? { name: row.customer.name } : null,
          branch: shopOf(row.branch),
        }))}
        expenses={data.expenses.map((row) => ({
          id: row.id,
          expenseNumber: row.expenseNumber,
          category: row.category,
          amount: money(row.amount),
          description: row.description,
          date: row.date,
          branch: shopOf(row.branch),
        }))}
        inventory={data.inventory.map((row) => ({
          id: row.id,
          quantity: row.quantity,
          product: { name: row.product.name, costPrice: money(row.product.costPrice), sellingPrice: money(row.product.sellingPrice) },
          branch: shopOf(row.branch),
        }))}
        swaps={data.swaps.map((row) => ({
          id: row.id,
          swapNumber: row.swapNumber,
          tradeValue: money(row.tradeValue),
          balanceAmount: money(row.balanceAmount),
          newProductPrice: money(row.newProductPrice),
          createdAt: row.createdAt,
          customer: row.customer ? { name: row.customer.name } : null,
          newProduct: row.newProduct ? { name: row.newProduct.name } : null,
          branch: shopOf(row.branch),
        }))}
        returns={data.returns.map((row) => ({
          id: row.id,
          returnNumber: row.returnNumber,
          reason: row.reason,
          outcome: row.outcome,
          faultClass: row.faultClass,
          status: row.status,
          refundAmount: money(row.refundAmount),
          createdAt: row.createdAt,
          customer: row.customer ? { name: row.customer.name } : null,
          branch: shopOf(row.branch),
          imei: row.imei ? { imei1: row.imei.imei1, product: { name: row.imei.product.name } } : null,
        }))}
        opening={plainMoney(opening)}
        branches={branches.map(({ id, name, code }) => ({ id, name, code }))}
        selectedBranchId={selectedBranchId}
        range={range}
        date={date}
      />
    </div>
  )
}

