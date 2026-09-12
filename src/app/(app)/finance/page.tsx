import { getFinance } from "@/app/actions/finance"
import { PageHeader } from "@/components/shared"
import { FinanceClientView } from "./finance-client-view"

export default async function FinancePage() {
  const data = await getFinance()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue & expenditure"
        description="What the shops earned, what they spent to run, and what went out to suppliers. Click Cash or Bank to see how each balance built up, day by day."
      />
      <FinanceClientView data={data} />
    </div>
  )
}

