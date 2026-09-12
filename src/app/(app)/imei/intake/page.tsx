import { getImeiStatusCounts } from "@/app/actions/imei"
import { getProducts } from "@/app/actions/catalog"
import { getBranches, getSuppliers } from "@/app/actions/parties"
import { ImeiIntakeForm } from "@/app/(app)/imei/intake-form"
import { PageHeader, SectionCard, StatCard, StatGrid } from "@/components/shared"

/**
 * Stock intake on its own screen.
 *
 * It used to be a narrow card beside the IMEI table, so the form was cramped and
 * the table was cramped, and the two had nothing to do with each other: one is
 * for looking a phone up, the other is for putting one on the shelf.
 */
export default async function ImeiIntakePage() {
  const [counts, branches, suppliers, products] = await Promise.all([
    getImeiStatusCounts(),
    getBranches(),
    getSuppliers(),
    getProducts(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock intake"
        description="Put a phone that is already in your hands onto the shelf. It goes in as In shop with today's Lagos time, and it shows on the phone list straight away."
      />

      <StatGrid>
        <StatCard label="In shop now" value={counts.byStatus.IN_STOCK ?? 0} tone="success" href="/imei?status=IN_STOCK" />
        <StatCard label="On the way" value={counts.byStatus.INCOMING ?? 0} tone="primary" href="/imei?status=INCOMING" />
        <StatCard label="Faulty" value={counts.byStatus.FAULTY ?? 0} tone="danger" href="/imei?status=FAULTY" />
        <StatCard label="Every phone ever" value={counts.total} href="/imei" />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <SectionCard title="Receive one phone">
          <ImeiIntakeForm
            products={products.map((product) => ({ id: product.id, name: product.name }))}
            branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
            suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
          />
        </SectionCard>

        <SectionCard title="When to use this instead of Upload stock">
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">One phone in your hand:</span> this screen. A swap device, a
              phone back from a repair, a single unit a supplier dropped off.
            </li>
            <li>
              <span className="font-medium text-foreground">A whole carton with a bill:</span> use{" "}
              <span className="font-medium text-foreground">Upload stock → Supplier bill</span>, so what you owe the
              supplier is recorded with it. This screen records no money.
            </li>
            <li>
              <span className="font-medium text-foreground">A phone that is already on the system:</span> nothing
              breaks. The record that is already there is left as it is.
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  )
}
