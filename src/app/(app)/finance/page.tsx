import { getFinance } from "@/app/actions/finance"
import { PageHeader } from "@/components/shared"
import { FinanceClientView } from "./finance-client-view"

export default async function FinancePage() {
  const data = await getFinance()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Money in & out"
        description="What the shops made, what they spent, and what went to suppliers. Tap Cash or Bank to see the money day by day."
      />
      <FinanceClientView data={data} />
    </div>
  )
}

