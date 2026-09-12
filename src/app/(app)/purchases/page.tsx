import Link from "next/link"
import { requireUser } from "@/lib/session"
import { getProducts } from "@/app/actions/catalog"
import { getPurchases, getSupplierReturnCandidates, sendUnitsToSupplier } from "@/app/actions/ops"
import { getBranches, getSuppliers } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PurchaseForm } from "@/app/(app)/purchases/purchase-form"
import { EmptyState, PageHeader, SectionCard, StatCard, StatGrid, StatusBadge } from "@/components/shared"
import { ScanList } from "@/components/scan-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { formatCurrency, formatDate, money } from "@/lib/utils"

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

  const houses = suppliers.filter((row) => row.kind !== "NEIGHBOR")
  const expected = purchases.reduce((sum, row) => sum + row.trace.expected, 0)
  const recorded = purchases.reduce((sum, row) => sum + row.trace.recorded, 0)
  const sold = purchases.reduce((sum, row) => sum + row.trace.sold, 0)
  const soldToday = purchases.reduce((sum, row) => sum + row.trace.soldToday, 0)
  const inShop = purchases.reduce((sum, row) => sum + row.trace.inShop, 0)
  const shortVsBill = purchases.reduce((sum, row) => sum + row.trace.shortVsBill, 0)
  const billed = purchases.reduce((sum, row) => sum + money(row.totalAmount), 0)
  const paid = purchases.reduce((sum, row) => sum + money(row.paidAmount), 0)
  const owed = Math.max(0, billed - paid)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goods from supplier"
        description="Each supplier bill and the money on it. If the shelf has fewer phones than the system says, something may have left without a sale."
      />

      <form className="grid gap-2 md:grid-cols-[1fr_auto]">
        <Input name="q" defaultValue={q} placeholder="Find an IMEI, a bill number, a supplier, or a product" />
        <Button type="submit">Search</Button>
      </form>

      {/* The money first: what these bills came to, what we paid, what is left. */}
      <StatGrid>
        <StatCard
          label="Value of these bills"
          value={formatCurrency(billed)}
          hint={`${purchases.length} supplier bill${purchases.length === 1 ? "" : "s"}`}
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
          hint="It shows on Money in & out until we pay it"
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
        <div className="space-y-3">
          {purchases.length === 0 ? (
            <EmptyState
              title={q?.trim() ? "No supplier bill matches that search" : "No supplier goods booked yet"}
              hint={
                q?.trim()
                  ? "Try an IMEI, a bill number, a supplier name, or an item name."
                  : "Use the form on the right to book goods from China, Dubai, Lagos, or any supplier you have named."
              }
            />
          ) : null}
          {purchases.map((purchase) => {
            const item = purchase.items[0]
            const origin = [purchase.originCity || purchase.supplier.city, purchase.originCountry || purchase.supplier.country]
              .filter(Boolean)
              .join(", ")
            const comingLots = purchase.incomingLots.filter((lot) => lot.status === "COMING").length
            const { trace } = purchase
            const totalVal = money(purchase.totalAmount)
            const paidVal = money(purchase.paidAmount)
            const owedVal = Math.max(0, totalVal - paidVal)

            return (
              <Link key={purchase.id} href={`/purchases/${purchase.id}`} className="surface-card block p-5 hover:bg-muted/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{purchase.invoiceNumber}</p>
                    {purchase.source === "UPLOAD_STOCK" ? (
                      <p className="text-xs font-medium text-primary">Loaded on Upload stock</p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      {purchase.supplier.name}
                      {origin ? ` · from ${origin}` : ""}
                      {" · "}
                      {purchase.branch.name}
                    </p>
                    <p className="mt-1 text-sm">
                      {item?.product.name}
                      {" · on bill "}
                      {trace.expected}
                      {" · scanned in "}
                      {trace.recorded}
                      {" · sold "}
                      {trace.sold}
                      {trace.soldToday ? ` · sold today ${trace.soldToday}` : ""}
                      {" · still on shelf "}
                      {trace.inShop}
                    </p>
                    {trace.shortVsBill > 0 ? (
                      <p className="mt-1 text-sm text-warning">
                        {trace.shortVsBill} unit{trace.shortVsBill === 1 ? "" : "s"} on this bill were never put into the shop.
                      </p>
                    ) : null}
                    {purchase.expectedDate ? (
                      <p className="mt-1 text-sm text-muted-foreground">Due {formatDate(purchase.expectedDate)}</p>
                    ) : null}
                    {comingLots ? (
                      <p className="mt-1 text-sm text-warning">{comingLots} carton list booked as Coming. Not for sale yet.</p>
                    ) : null}
                  </div>
                  <StatusBadge value={purchase.status} />
                </div>
                <div className="mt-3 grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-3">
                  <span>
                    <span className="eyebrow block">Bill value</span>
                    <strong className="num">{formatCurrency(totalVal)}</strong>
                  </span>
                  <span>
                    <span className="eyebrow block">We have paid</span>
                    <strong className="num text-success">{formatCurrency(paidVal)}</strong>
                  </span>
                  <span>
                    <span className="eyebrow block">Still owed</span>
                    <strong className={`num ${owedVal > 0 ? "text-warning" : "text-success"}`}>
                      {formatCurrency(owedVal)}
                    </strong>
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
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
              Use this when a unit does not work, including a phone a customer returned to us. It leaves this shop and goes back to the supplier. It is not a shop-to-shop send.
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
              <p className="mb-4 text-sm text-muted-foreground">No faulty phone and no returned phone is waiting to go back.</p>
            )}
            <ActionForm action={sendUnitsToSupplier} submit="Send these IMEIs back to the supplier" className="space-y-3">
              <Select name="supplierId" defaultValue="">
                <option value="">Use the supplier already saved on each IMEI</option>
                {houses.map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </Select>
              <ScanList name="imeis" required />
            </ActionForm>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
