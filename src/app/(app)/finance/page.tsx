import { getFinance } from "@/app/actions/finance"
import { PageHeader } from "@/components/shared"
import { FinanceClientView } from "./finance-client-view"

export default async function FinancePage() {
  const data = await getFinance()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Money in & out"
        description="Money that came in from sales, money that went out for shop bills and suppliers, and people who still owe us. Use this page to follow credit sales."
      />
      <FinanceClientView data={data} />
    </div>
  )
}

