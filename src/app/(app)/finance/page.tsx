import { getFinance } from "@/app/actions/finance"
import { PageHeader } from "@/components/shared"
import { FinanceClientView } from "./finance-client-view"

export default async function FinancePage() {
  const data = await getFinance()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Money in & out"
        description="Cash, banks, money in from sales, and money out."
      />
      <FinanceClientView data={data} />
    </div>
  )
}

