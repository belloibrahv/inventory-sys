import Link from "next/link"
import { requireUser } from "@/lib/session"
import { getProducts } from "@/app/actions/catalog"
import { getPurchases, getSupplierReturnCandidates } from "@/app/actions/ops"
import { getBranches, getSuppliers } from "@/app/actions/parties"
import { PurchaseForm } from "@/app/(app)/purchases/purchase-form"
import { PageHeader, SectionCard, StatCard, StatGrid } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatCurrency, money } from "@/lib/utils"
import { isOpeningStockPurchase, purchaseBalance } from "@/lib/purchase-money"
import { PurchasesList } from "./purchases-list"
import { SupplierReturnForm } from "./supplier-return-form"

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireUser()
  const { q } = await searchParams
  const [purchases, suppliers, products, branches, returnUnits] = await Promise.all([
    getPurchases(q),
    getSuppliers(),
    getProducts(),
    getBranches(),
    getSupplierReturnCandidates(),
  ])

  const houses = suppliers.filter((row) => row.kind !== "NEIGHBOR" && row.name !== "Opening stock")
  const regularPurchases = purchases.filter((p) => !isOpeningStockPurchase(p))
  const openingPurchases = purchases.filter((p) => isOpeningStockPurchase(p))

  const expected = regularPurchases.reduce((sum, row) => sum + row.trace.expected, 0)
  const recorded = regularPurchases.reduce((sum, row) => sum + row.trace.recorded, 0)
  const sold = regularPurchases.reduce((sum, row) => sum + row.trace.sold, 0)
  const soldToday = regularPurchases.reduce((sum, row) => sum + row.trace.soldToday, 0)
  const inShop = regularPurchases.reduce((sum, row) => sum + row.trace.inShop, 0)
  const shortVsBill = regularPurchases.reduce((sum, row) => sum + row.trace.shortVsBill, 0)
  const billed = regularPurchases.reduce((sum, row) => sum + money(row.totalAmount), 0)
  const paid = regularPurchases.reduce((sum, row) => sum + money(row.paidAmount), 0)
  const balances = regularPurchases.map((row) => purchaseBalance(row.totalAmount, row.paidAmount, row.returnedAmount))
  const owed = balances.reduce((sum, row) => sum + row.owed, 0)
  const surplus = balances.reduce((sum, row) => sum + row.surplus, 0)
  const openingValue = openingPurchases.reduce((sum, row) => sum + money(row.totalAmount), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goods from supplier"
        description="Supplier procurement bills and vendor accounts payable. Track expected cartons, received stock, and vendor disbursements."
      />

      <form className="grid gap-2 md:grid-cols-[1fr_auto]">
        <Input name="q" defaultValue={q} placeholder="Find an IMEI, a bill number, a supplier, or a product" />
        <Button type="submit">Search</Button>
      </form>

      {openingPurchases.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary-soft p-4 text-sm text-foreground">
          <div className="space-y-0.5">
            <p className="font-semibold text-primary">Independent Opening Stock Valuation ({formatCurrency(openingValue)})</p>
            <p className="text-xs text-muted-foreground">
              Opening inventory stands independently as an asset valuation baseline. It requires no supplier payments and carries zero trade debt.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/opening-stock">View &amp; Audit Opening Stock &rarr;</Link>
          </Button>
        </div>
      ) : null}

      {/* The money first: what these bills came to, what we paid, what is left. */}
      <StatGrid>
        <StatCard
          label="Value of these bills"
          value={formatCurrency(billed)}
          hint={`${regularPurchases.length} supplier bill${regularPurchases.length === 1 ? "" : "s"}`}
        />
        <StatCard
          label="We have paid"
          value={formatCurrency(paid)}
          hint="Money we have already sent for these bills"
          tone="success"
        />
        <StatCard
          label="Still owed"
          value={formatCurrency(owed)}
          hint={surplus > 0 ? `They owe us ${formatCurrency(surplus)} after send-backs` : "It shows on Money in and out until we pay it"}
          tone={owed > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Never scanned in"
          value={String(shortVsBill)}
          hint="Units the supplier charged us for that never entered the shop record"
          tone={shortVsBill > 0 ? "danger" : "success"}
        />
      </StatGrid>

      <StatGrid>
        <StatCard label="On these bills" value={String(expected)} hint="Units the supplier put on the bill" />
        <StatCard label="Scanned into the shop" value={String(recorded)} hint="Phone numbers (IMEIs) or pieces booked in" />
        <StatCard
          label="Sold from these cartons"
          value={String(sold)}
          hint={soldToday ? `${soldToday} of them sold today (Lagos day)` : "Already on an invoice"}
        />
        <StatCard
          label="Still on our shelf"
          value={String(inShop)}
          hint="If the shelf has less, count the stock. Never type a new number by hand."
          href="/reconciliation"
        />
      </StatGrid>

      <div className="page-split">
        <PurchasesList purchases={purchases} search={q} />
        <div className="space-y-4">
          <SectionCard title="Book expected goods">
            <p className="mb-4 text-sm text-muted-foreground">
              This is a supplier carton, not a send from Iwo Road to Challenge. After you save, open the bill to book IMEIs as Coming, then confirm arrival when the boxes are on the counter. That bill is the trail if a unit later goes missing.
            </p>
            <PurchaseForm
              suppliers={houses.map((row) => ({
                id: row.id,
                name: row.name,
                country: row.country,
                city: row.city,
              }))}
              branches={branches.filter((row) => row.isActive).map((row) => ({ id: row.id, name: row.name }))}
              products={products.map((row) => ({ id: row.id, name: row.name }))}
              defaultBranchId={me.branchId}
            />
          </SectionCard>
          <SectionCard title="Send back to supplier">
            <p className="mb-4 text-sm text-muted-foreground">
              Scan each IMEI. The phone, the supplier, and the cost fill in from that number. Do not pick the house. Scan ten or twenty phones if they all go back to the same supplier in this one send-back. That cost comes off what we still owe. If we do not owe them, they owe us.
            </p>
            {returnUnits.length ? (
              <ul className="mb-4 space-y-1 text-sm">
                {returnUnits.slice(0, 8).map((row) => (
                  <li key={row.id}>
                    {row.imei1} · {row.productName} · {row.shop}
                    {row.supplierName ? ` · ${row.supplierName}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">No faulty phone and no returned phone is waiting to go back. You can still scan an In shop IMEI that must go back.</p>
            )}
            <SupplierReturnForm />
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
