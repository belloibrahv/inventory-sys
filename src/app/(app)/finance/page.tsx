import { getFinance } from "@/app/actions/finance"
import { PageHeader } from "@/components/shared"
import { FinanceClientView } from "./finance-client-view"

export default async function FinancePage() {
  const data = await getFinance()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance & Cash Flow"
        description="Accounting ledger, Revenue, Operating Expenses, Supplier Payments, and Net Cash Flow."
      />
      <FinanceClientView data={data} />
    </div>
  )
}

