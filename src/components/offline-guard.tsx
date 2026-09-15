"use client"

import { useEffect, useMemo, useState } from "react"
import { Smartphone, Boxes, Receipt, Users, WifiOff } from "lucide-react"
import { ImeiTable } from "@/app/(app)/imei/imei-table"
import { Button } from "@/components/ui/button"
import { useNetworkStatus } from "@/lib/network-status"
import { formatLagosStamp } from "@/lib/lagos-day"
import { pageKeyForPath, readPageSnapshot, type PageSnapshot } from "@/lib/page-cache"
import { formatCurrency, money } from "@/lib/utils"

type Tab = "imei" | "inventory" | "sales" | "customers"

function tabForPath(pathname: string): Tab {
  const key = pageKeyForPath(pathname)
  if (key === "inventory" || key === "sales" || key === "customers" || key === "imei") return key
  return "imei"
}

function asDate(value: unknown) {
  return value ? new Date(String(value)) : new Date(0)
}

export function OfflineGuard() {
  const network = useNetworkStatus()
  const offline = network.state === "offline"
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>("imei")
  const [packs, setPacks] = useState<Partial<Record<Tab, PageSnapshot>>>({})

  useEffect(() => {
    if (!offline) {
      setOpen(false)
      return
    }
    void (async () => {
      const [imei, inventory, sales, customers] = await Promise.all([
        readPageSnapshot("imei"),
        readPageSnapshot("inventory"),
        readPageSnapshot("sales"),
        readPageSnapshot("customers"),
      ])
      setPacks({
        imei: imei ?? undefined,
        inventory: inventory ?? undefined,
        sales: sales ?? undefined,
        customers: customers ?? undefined,
      })
    })()
  }, [offline])

  useEffect(() => {
    if (!offline) return

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (event.button !== 0) return
      const anchor = (event.target as HTMLElement | null)?.closest("a")
      if (!anchor) return
      if (anchor.target && anchor.target !== "_self") return
      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return
      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (url.pathname.startsWith("/serwist/") || url.pathname.startsWith("/_next/")) return

      // Sell now and the offline page are served from the phone cache.
      if (url.pathname === "/offline" || url.pathname === "/pos" || url.pathname.startsWith("/pos/")) {
        event.preventDefault()
        event.stopPropagation()
        window.location.assign("/offline")
        return
      }

      event.preventDefault()
      event.stopPropagation()
      if (pageKeyForPath(url.pathname) && pageKeyForPath(url.pathname) === pageKeyForPath(window.location.pathname)) {
        return
      }
      setTab(tabForPath(url.pathname))
      setOpen(true)
    }

    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [offline])

  if (!offline || !open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700">
              <WifiOff className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">The line is down. This phone still has the last lists.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You can still sell. Phones, shop stock, sales and customers are the copy saved on this phone. New work waits here and goes in when the line comes back.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href="/offline">Sell now</a>
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Stay on this screen
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3">
          <TabButton icon={Smartphone} label="Phones" active={tab === "imei"} savedAt={packs.imei?.savedAt} onClick={() => setTab("imei")} />
          <TabButton icon={Boxes} label="Shop stock" active={tab === "inventory"} savedAt={packs.inventory?.savedAt} onClick={() => setTab("inventory")} />
          <TabButton icon={Receipt} label="Sales" active={tab === "sales"} savedAt={packs.sales?.savedAt} onClick={() => setTab("sales")} />
          <TabButton icon={Users} label="Customers" active={tab === "customers"} savedAt={packs.customers?.savedAt} onClick={() => setTab("customers")} />
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {tab === "imei" ? <ImeiCache pack={packs.imei} /> : null}
          {tab === "inventory" ? <InventoryCache pack={packs.inventory} /> : null}
          {tab === "sales" ? <SalesCache pack={packs.sales} /> : null}
          {tab === "customers" ? <CustomersCache pack={packs.customers} /> : null}
        </div>
      </div>
    </div>
  )
}

function TabButton({
  icon: Icon,
  label,
  active,
  savedAt,
  onClick,
}: {
  icon: typeof Smartphone
  label: string
  active: boolean
  savedAt?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {label}
        {savedAt ? <span className="text-[10px] opacity-80">{formatLagosStamp(new Date(savedAt))}</span> : null}
      </span>
    </button>
  )
}

function EmptyCopy({ label }: { label: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      No copy of {label} is on this phone yet. Open that screen once while the line is good. You can still sell from Sell now if that list was saved.
    </p>
  )
}

function ImeiCache({ pack }: { pack?: PageSnapshot }) {
  const records = useMemo(() => {
    const rows = Array.isArray((pack?.data as { records?: unknown[] } | undefined)?.records)
      ? ((pack?.data as { records: Array<Record<string, unknown>> }).records)
      : Array.isArray(pack?.data)
        ? (pack?.data as Array<Record<string, unknown>>)
        : []
    return rows.map((row) => ({
      id: String(row.id ?? ""),
      imei1: String(row.imei1 ?? ""),
      serialNumber: (row.serialNumber as string | null) ?? null,
      status: String(row.status ?? ""),
      createdAt: asDate(row.createdAt),
      updatedAt: asDate(row.updatedAt),
      product: {
        name: String((row.product as { name?: string } | undefined)?.name ?? ""),
        warrantyDays: Number((row.product as { warrantyDays?: number } | undefined)?.warrantyDays ?? 0),
      },
      branch: { code: String((row.branch as { code?: string } | undefined)?.code ?? "") },
      customer: (row.customer as { name: string } | null) ?? null,
      supplier: (row.supplier as { name: string } | null) ?? null,
      sale: row.sale ? { saleDate: asDate((row.sale as { saleDate?: unknown }).saleDate) } : null,
    }))
  }, [pack])

  if (!pack) return <EmptyCopy label="phones" />
  return <ImeiTable records={records} resetKey={pack.savedAt} />
}

function InventoryCache({ pack }: { pack?: PageSnapshot }) {
  const rows = Array.isArray(pack?.data) ? (pack.data as Array<Record<string, unknown>>) : []
  if (!pack) return <EmptyCopy label="shop stock" />
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-muted-foreground">
        <tr className="border-b border-border">
          <th className="py-2 pr-3">Item</th>
          <th className="py-2 pr-3">Shop</th>
          <th className="py-2 text-right">On shelf</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 200).map((row) => (
          <tr key={String(row.id)} className="border-b border-border/70">
            <td className="py-2 pr-3">{String((row.product as { name?: string } | undefined)?.name ?? "")}</td>
            <td className="py-2 pr-3">{String((row.branch as { code?: string } | undefined)?.code ?? "")}</td>
            <td className="py-2 text-right tabular-nums">{String(row.quantity ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SalesCache({ pack }: { pack?: PageSnapshot }) {
  const rows = Array.isArray(pack?.data) ? (pack.data as Array<Record<string, unknown>>) : []
  if (!pack) return <EmptyCopy label="sales" />
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-muted-foreground">
        <tr className="border-b border-border">
          <th className="py-2 pr-3">Invoice</th>
          <th className="py-2 pr-3">Buyer</th>
          <th className="py-2 pr-3">When</th>
          <th className="py-2 text-right">Paid</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 200).map((row) => (
          <tr key={String(row.id)} className="border-b border-border/70">
            <td className="py-2 pr-3 font-medium">{String(row.invoiceNumber ?? "")}</td>
            <td className="py-2 pr-3">{String((row.customer as { name?: string } | null)?.name ?? "Walk-in")}</td>
            <td className="py-2 pr-3">{formatLagosStamp(asDate(row.saleDate))}</td>
            <td className="py-2 text-right tabular-nums">{formatCurrency(money(row.paidAmount))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CustomersCache({ pack }: { pack?: PageSnapshot }) {
  const rows = Array.isArray(pack?.data) ? (pack.data as Array<Record<string, unknown>>) : []
  if (!pack) return <EmptyCopy label="customers" />
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-muted-foreground">
        <tr className="border-b border-border">
          <th className="py-2 pr-3">Name</th>
          <th className="py-2 pr-3">Phone</th>
          <th className="py-2 pr-3">Shop</th>
          <th className="py-2 text-right">Still owing</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 200).map((row) => (
          <tr key={String(row.id)} className="border-b border-border/70">
            <td className="py-2 pr-3 font-medium">{String(row.name ?? "")}</td>
            <td className="py-2 pr-3">{String(row.phone ?? "")}</td>
            <td className="py-2 pr-3">{String((row.branch as { code?: string } | undefined)?.code ?? "")}</td>
            <td className="py-2 text-right tabular-nums">{formatCurrency(money(row.currentBalance))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
