"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronDown, Coins, HandCoins, Undo2, Users, Wallet } from "lucide-react"
import { StatCard, StatGrid, StatusBadge, TableEmpty, TableShell, TonePill } from "@/components/shared"
import { TablePager, usePagedRows } from "@/components/table-pager"
import { groupByPartyIdentity } from "@/lib/party-key"
import { purchaseBalance } from "@/lib/purchase-money"
import { formatCurrency, formatDate } from "@/lib/utils"

export type SupplierBillRow = {
  id: string
  invoiceNumber: string
  totalAmount: number
  paidAmount: number
  returnedAmount?: number
  status: string
  createdAt: string
  branchCode: string
  branchName: string
}

export type SupplierRow = {
  id: string
  name: string
  kind: string
  phone: string
  city: string | null
  country: string | null
  purchases: SupplierBillRow[]
  creditBalance?: number
}

type HouseFilter = "all" | "bought" | "paid" | "owing" | "credit"

type House = {
  key: string
  name: string
  kind: string
  phone: string
  from: string
  copies: SupplierRow[]
  bills: SupplierBillRow[]
  purchased: number
  paid: number
  sentBack: number
  extraCredit: number
  owed: number
  surplus: number
  openHref: string
}

function buildHouses(suppliers: SupplierRow[]): House[] {
  return groupByPartyIdentity(suppliers)
    .map((copies) => {
      const ranked = [...copies].sort((a, b) => {
        const aValue = a.purchases.reduce((sum, row) => sum + row.totalAmount, 0)
        const bValue = b.purchases.reduce((sum, row) => sum + row.totalAmount, 0)
        if (bValue !== aValue) return bValue - aValue
        return b.purchases.length - a.purchases.length
      })
      const primary = ranked[0]
      const bills = copies
        .flatMap((copy) => copy.purchases)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      const purchased = bills.reduce((sum, row) => sum + row.totalAmount, 0)
      const paid = bills.reduce((sum, row) => sum + row.paidAmount, 0)
      const sentBack = bills.reduce((sum, row) => sum + (row.returnedAmount ?? 0), 0)
      const extraCredit = copies.reduce((sum, copy) => sum + (copy.creditBalance ?? 0), 0)
      let net = 0
      for (const bill of bills) {
        const bal = purchaseBalance(bill.totalAmount, bill.paidAmount, bill.returnedAmount)
        net += bal.remaining - bal.paid
      }
      net -= extraCredit
      const from =
        copies
          .map((copy) => [copy.city, copy.country].filter(Boolean).join(", "))
          .find((place) => place) || "Not recorded"
      return {
        key: primary.id,
        name: primary.name,
        kind: primary.kind,
        phone: primary.phone,
        from,
        copies: ranked,
        bills,
        purchased,
        paid,
        sentBack,
        extraCredit,
        owed: Math.max(0, net),
        surplus: Math.max(0, -net),
        openHref: `/suppliers/${primary.id}`,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

const FILTER_LABEL: Record<HouseFilter, string> = {
  all: "Every house",
  bought: "Houses we bought from",
  paid: "Houses we have paid",
  owing: "Houses we still owe",
  credit: "Houses who owe us",
}

export function SuppliersList({ suppliers }: { suppliers: SupplierRow[] }) {
  const houses = useMemo(() => buildHouses(suppliers), [suppliers])
  const [filter, setFilter] = useState<HouseFilter>("all")
  const [openKey, setOpenKey] = useState<string | null>(null)

  const totalInvoiced = houses.reduce((sum, house) => sum + house.purchased, 0)
  const totalPaid = houses.reduce((sum, house) => sum + house.paid, 0)
  const totalOwed = houses.reduce((sum, house) => sum + house.owed, 0)
  const totalSurplus = houses.reduce((sum, house) => sum + house.surplus, 0)
  const owingCount = houses.filter((house) => house.owed > 0).length

  const filtered = useMemo(() => {
    return houses.filter((house) => {
      if (filter === "bought") return house.purchased > 0
      if (filter === "paid") return house.paid > 0
      if (filter === "owing") return house.owed > 0
      if (filter === "credit") return house.surplus > 0
      return true
    })
  }, [houses, filter])

  const pager = usePagedRows(filtered, filter)

  function pickFilter(next: HouseFilter) {
    setFilter(next)
    setOpenKey(null)
    requestAnimationFrame(() => {
      document.getElementById("supplier-houses")?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  return (
    <div className="space-y-5">
      <StatGrid>
        <StatCard
          label="Suppliers on the books"
          value={String(houses.length)}
          hint={owingCount > 0 ? `${owingCount} we still owe` : undefined}
          icon={<Users className="h-4 w-4" />}
          onClick={() => pickFilter("all")}
        />
        <StatCard
          label="Bought from them, all time"
          value={formatCurrency(totalInvoiced)}
          icon={<Coins className="h-4 w-4" />}
          tone="primary"
          onClick={() => pickFilter("bought")}
        />
        <StatCard
          label="We have paid them"
          value={formatCurrency(totalPaid)}
          icon={<HandCoins className="h-4 w-4" />}
          tone="success"
          onClick={() => pickFilter("paid")}
        />
        <StatCard
          label="We still owe"
          value={formatCurrency(totalOwed)}
          icon={<Wallet className="h-4 w-4" />}
          tone={totalOwed > 0 ? "warning" : "neutral"}
          onClick={() => pickFilter("owing")}
        />
        <StatCard
          label="They owe us"
          value={formatCurrency(totalSurplus)}
          icon={<Undo2 className="h-4 w-4" />}
          tone={totalSurplus > 0 ? "success" : "neutral"}
          onClick={() => pickFilter("credit")}
        />
      </StatGrid>

      <TableShell
        className="scroll-mt-4"
        caption={
          <p id="supplier-houses" className="text-sm text-muted-foreground">
            {FILTER_LABEL[filter]}
          </p>
        }
        columns={[
          { label: "Supplier" },
          { label: "From" },
          { label: "Bought from them", align: "right" },
          { label: "We have paid", align: "right" },
          { label: "Balance", align: "right" },
          { label: "", align: "center" },
        ]}
        footer={
          <TablePager
            page={pager.page}
            pageCount={pager.pageCount}
            pageSize={pager.pageSize}
            total={pager.total}
            start={pager.start}
            end={pager.end}
            onPageChange={pager.setPage}
            onPageSizeChange={pager.setPageSize}
            noun="houses"
          />
        }
      >
        {pager.pageRows.map((house) => {
          const expanded = openKey === house.key
          return (
            <HouseRows
              key={house.key}
              house={house}
              expanded={expanded}
              onToggle={() => setOpenKey(expanded ? null : house.key)}
            />
          )
        })}
        {filtered.length === 0 ? (
          <TableEmpty colSpan={6}>
            {houses.length === 0
              ? "No suppliers on the books yet. Add one on the right."
              : "No house matches that box. Click Suppliers on the books to see every house."}
          </TableEmpty>
        ) : null}
      </TableShell>
    </div>
  )
}

function HouseRows({
  house,
  expanded,
  onToggle,
}: {
  house: House
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        className="cursor-pointer"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onToggle()
          }
        }}
        tabIndex={0}
        aria-expanded={expanded}
      >
        <td>
          <div className="flex items-start gap-2">
            <ChevronDown
              className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`}
              aria-hidden
            />
            <div>
              <p className="font-medium">{house.name}</p>
              <p className="text-xs text-muted-foreground">
                {house.kind === "NEIGHBOR" ? "Neighbouring shop" : "Carton supplier"} · {house.phone}
                {house.copies.length > 1 ? ` · ${house.copies.length} copies on the books` : ""}
                {house.bills.length
                  ? ` · ${house.bills.length} bill${house.bills.length === 1 ? "" : "s"}`
                  : " · no bill yet"}
              </p>
            </div>
          </div>
        </td>
        <td className="text-xs text-muted-foreground">{house.from}</td>
        <td className="text-right num font-medium">{formatCurrency(house.purchased)}</td>
        <td className="text-right num text-success">{formatCurrency(house.paid)}</td>
        <td className="text-right num font-semibold">
          {house.surplus > 0 ? formatCurrency(house.surplus) : formatCurrency(house.owed)}
        </td>
        <td className="text-center">
          {house.surplus > 0 ? (
            <TonePill tone="success">They owe us</TonePill>
          ) : house.owed === 0 ? (
            <TonePill tone="success">Settled</TonePill>
          ) : (
            <TonePill tone="warning">Owing</TonePill>
          )}
        </td>
      </tr>
      {expanded ? (
        <tr className="hover:bg-transparent">
          <td colSpan={6} className="bg-muted/30 p-4">
            <HouseBreakdown house={house} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

function HouseBreakdown({ house }: { house: House }) {
  return (
    <div className="space-y-4" onClick={(event) => event.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">What makes up {house.name}</p>
        <Link href={house.openHref} className="text-sm font-medium text-primary hover:underline">
          Open the full {house.name} page
        </Link>
      </div>

      {house.copies.length > 1 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            This house was saved more than once. New copies are refused. Use one name going forward.
          </p>
          <ul className="space-y-1 text-sm">
            {house.copies.map((copy) => (
              <li key={copy.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-card px-3 py-2">
                <span>
                  {copy.name} · {copy.phone}
                  {copy.city || copy.country
                    ? ` · ${[copy.city, copy.country].filter(Boolean).join(", ")}`
                    : ""}
                </span>
                <Link href={`/suppliers/${copy.id}`} className="font-medium text-primary hover:underline">
                  Open this copy
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {house.bills.length ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Bill</th>
                <th className="px-3 py-2 font-medium">Shop</th>
                <th className="px-3 py-2 text-right font-medium">Bill value</th>
                <th className="px-3 py-2 text-right font-medium">We have paid</th>
                <th className="px-3 py-2 text-right font-medium">Sent back</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {house.bills.map((bill) => {
                const bal = purchaseBalance(bill.totalAmount, bill.paidAmount, bill.returnedAmount)
                return (
                  <tr key={bill.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link href={`/purchases/${bill.id}`} className="font-medium text-primary hover:underline">
                        {bill.invoiceNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground">{formatDate(bill.createdAt)}</p>
                    </td>
                    <td className="px-3 py-2">{bill.branchName || bill.branchCode || "Not recorded"}</td>
                    <td className="px-3 py-2 text-right num">{formatCurrency(bill.totalAmount)}</td>
                    <td className="px-3 py-2 text-right num text-success">{formatCurrency(bill.paidAmount)}</td>
                    <td className="px-3 py-2 text-right num">{formatCurrency(bal.sentBack)}</td>
                    <td className="px-3 py-2 text-right num font-semibold">
                      {bal.surplus > 0 ? `They owe us ${formatCurrency(bal.surplus)}` : formatCurrency(bal.owed)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge value={bill.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No supplier bill yet for this house.</p>
      )}
      {house.extraCredit > 0 ? (
        <p className="text-sm text-muted-foreground">
          Extra send-back credit not on a bill: {formatCurrency(house.extraCredit)}.
        </p>
      ) : null}
    </div>
  )
}
