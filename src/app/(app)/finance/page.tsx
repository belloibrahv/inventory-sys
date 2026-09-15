import { getFinance } from "@/app/actions/finance"
import { PageHeader } from "@/components/shared"
import { FinanceClientView } from "./finance-client-view"

export default async function FinancePage() {
  const data = await getFinance()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Accounting & General Ledger"
        description="Comprehensive treasury overview, gross revenue, operating expenditures (OPEX), vendor disbursements, and real-time cash & bank ledgers."
      />
      <FinanceClientView data={data} />
    </div>
  )
}

