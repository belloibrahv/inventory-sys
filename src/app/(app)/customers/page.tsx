import Link from "next/link"
import { Plus } from "lucide-react"
import { getBranches, getCustomers } from "@/app/actions/parties"
import { PageHeader } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { money } from "@/lib/utils"
import { CustomersClientView } from "./customers-client-view"
import { CachePageData } from "@/components/cache-page-data"

export default async function CustomersPage() {
  const [rawCustomers, branches] = await Promise.all([getCustomers(), getBranches()])

  const customers = rawCustomers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    currentBalance: money(c.currentBalance),
    creditLimit: money(c.creditLimit),
    branch: { id: c.branch.id, name: c.branch.name, code: c.branch.code },
    purchased: c.purchased,
    paid: c.paid,
    _count: c._count,
  }))

  const branchList = branches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name, code: b.code }))

  return (
    <div className="space-y-6">
      <CachePageData pageKey="customers" title="Customers & money owed" data={customers} />
      <PageHeader
        title="Customers & money owed"
        description="Who bought, what they paid, and what they still owe."
        actions={
          <Button asChild>
            <Link href="/customers/new">
              <Plus className="mr-1.5 h-4 w-4" /> Add a customer
            </Link>
          </Button>
        }
      />

      <CustomersClientView customers={customers} branches={branchList} />
    </div>
  )
}
