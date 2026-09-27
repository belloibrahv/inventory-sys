import { getFinance } from "@/app/actions/finance"
import { PageHeader } from "@/components/shared"
import { plainMoney } from "@/lib/plain"
import { FinanceClientView } from "./finance-client-view"

export default async function FinancePage() {
  // The expense rows and recent entries are for other screens; this one never shows them.
  const { expenses: _expenses, entries: _entries, ...rest } = await getFinance()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Money in & out"
        description="Cash, banks, money in from sales, and money out."
      />
      <FinanceClientView data={plainMoney(rest)} />
    </div>
  )
}

