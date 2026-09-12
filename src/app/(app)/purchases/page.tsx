import Link from "next/link"
import { requireUser } from "@/lib/session"
import { getProducts } from "@/app/actions/catalog"
import { getPurchases, getSupplierReturnCandidates, sendUnitsToSupplier } from "@/app/actions/ops"
import { getBranches, getSuppliers } from "@/app/actions/parties"
import { ActionForm } from "@/components/action-form"
import { PurchaseForm } from "@/app/(app)/purchases/purchase-form"
import { PageHeader, StatusBadge } from "@/components/shared"
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
  const owed = purchases.reduce((sum, row) => sum + money(row.totalAmount) - money(row.paidAmount), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goods from supplier"
        description="This is the carton record. Expected is what the supplier sent. Recorded is what was scanned onto the system. Sold on the system is every unit from those cartons that already has an invoice. If the shelf is short of Still in shop, a unit may have left without a sale. Shop to shop and Neighbor shop fill are different pages."
      />
      <form className="grid gap-2 md:grid-cols-[1fr_auto]">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Find IMEI, supplier bill, supplier name, or product"
        />
        <Button type="submit">Search supplier goods</Button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Expected on these bills</p>
          <p className="text-2xl font-semibold">{expected}</p>
          <p className="text-sm text-muted-foreground">Units the supplier was supposed to send.</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Recorded on the system</p>
          <p className="text-2xl font-semibold">{recorded}</p>
          <p className="text-sm text-muted-foreground">IMEIs or pieces actually booked from these bills.</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Never scanned versus the bill</p>
          <p className="text-2xl font-semibold">{shortVsBill}</p>
          <p className="text-sm text-muted-foreground">Expected minus recorded. These numbers never entered the shop record.</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Sold on the system</p>
          <p className="text-2xl font-semibold">{sold}</p>
          <p className="text-sm text-muted-foreground">From these cartons and already on an invoice.</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Sold today (Lagos day)</p>
          <p className="text-2xl font-semibold">{soldToday}</p>
          <p className="text-sm text-muted-foreground">Check this before Close the day.</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-sm text-muted-foreground">Still in shop on the system</p>
          <p className="text-2xl font-semibold">{inShop}</p>
          <p className="text-sm text-muted-foreground">If the shelf has fewer, count stock. Do not type a new number by hand.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="surface-card p-5">
          <p className="text-xs font-medium uppercase text-muted-foreground">Total Paid to Suppliers</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCurrency(purchases.reduce((sum, row) => sum + money(row.paidAmount), 0))}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Disbursements recorded on these bills</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs font-medium uppercase text-muted-foreground">Still Owed to Suppliers</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(owed)}</p>
          <p className="text-xs text-muted-foreground mt-1">Outstanding supplier payables</p>
        </div>
      </div>
      <div className="page-split">
        <div className="space-y-3">
          {purchases.length === 0 ? (
            <div className="surface-card p-5 text-sm text-muted-foreground">
              {q?.trim()
                ? "No supplier bill matches that search. Try an IMEI, a bill number, a supplier name, or a product name."
                : "No expected supplier goods yet. Add a shipment from China, Dubai, Lagos, or any named supplier on the right."}
            </div>
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
                      {" · expected "}
                      {trace.expected}
                      {" · recorded "}
                      {trace.recorded}
                      {" · sold "}
                      {trace.sold}
                      {trace.soldToday ? ` · sold today ${trace.soldToday}` : ""}
                      {" · still in shop "}
                      {trace.inShop}
                    </p>
                    {trace.shortVsBill > 0 ? (
                      <p className="mt-1 text-sm text-amber-800">
                        {trace.shortVsBill} unit{trace.shortVsBill === 1 ? "" : "s"} on this bill never scanned onto the system.
                      </p>
                    ) : null}
                    {purchase.expectedDate ? (
                      <p className="mt-1 text-sm text-muted-foreground">Due {formatDate(purchase.expectedDate)}</p>
                    ) : null}
                    {comingLots ? (
                      <p className="mt-1 text-sm text-amber-700">{comingLots} carton list booked as Coming. Not for sale yet.</p>
                    ) : null}
                  </div>
                  <StatusBadge value={purchase.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm pt-2 border-t border-border/60">
                  <span>Bill Total: <strong className="font-mono">{formatCurrency(totalVal)}</strong></span>
                  <span>Amount Paid: <strong className="font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(paidVal)}</strong></span>
                  <span>Still Owed: <strong className="font-mono text-amber-600 dark:text-amber-400">{formatCurrency(owedVal)}</strong></span>
                </div>
              </Link>
            )
          })}
        </div>
        <div className="space-y-4">
          <div className="surface-card p-5">
            <h3 className="mb-2 font-semibold">Book expected goods</h3>
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
          </div>
          <div className="surface-card p-5">
            <h3 className="mb-2 font-semibold">Send back to supplier</h3>
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
              <p className="mb-4 text-sm text-muted-foreground">No faulty or customer-returned IMEIs waiting to go back.</p>
            )}
            <ActionForm action={sendUnitsToSupplier} submit="Send these IMEIs back to the supplier" className="space-y-3">
              <Select name="supplierId" defaultValue="">
                <option value="">Use the supplier already on each IMEI</option>
                {houses.map((row) => (
                  <option key={row.id} value={row.id}>{row.name}</option>
                ))}
              </Select>
              <ScanList name="imeis" required />
            </ActionForm>
          </div>
        </div>
      </div>
    </div>
  )
}
