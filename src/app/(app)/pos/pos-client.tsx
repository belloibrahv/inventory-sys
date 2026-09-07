"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createCustomer } from "@/app/actions/parties"
import { checkoutSale } from "@/app/actions/sales"
import { ScanField } from "@/components/scan-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { pushSaleQueue } from "@/lib/offline-sales"
import { formatCurrency, money } from "@/lib/utils"
import { Trash2 } from "lucide-react"

type Imei = {
  id: string
  imei1: string
  serialNumber: string | null
  productId: string
  branchId: string
  product: { name: string; sellingPrice: number; minimumPrice: number }
}

type Product = {
  id: string
  name: string
  sku: string
  sellingPrice: number
  minimumPrice: number
  serialized: boolean
  brand: { name: string }
  stock: Array<{ branchId: string; quantity: number }>
}

type Customer = { id: string; name: string; phone: string; branchId: string; creditLimit: number; currentBalance: number }
type Branch = { id: string; name: string; code: string }
type SellLock = { locked: boolean; dates: string[]; href: string; message: string }

export function PosClient({
  products,
  customers,
  imeis,
  branches,
  defaultBranchId,
  canOverrideFloor,
  sellLocks,
}: {
  products: Product[]
  customers: Customer[]
  imeis: Imei[]
  branches: Branch[]
  defaultBranchId?: string | null
  canOverrideFloor?: boolean
  sellLocks?: Record<string, SellLock>
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || "")
  const [method, setMethod] = useState<"CASH" | "TRANSFER" | "POS" | "CREDIT">("CASH")
  const [paid, setPaid] = useState(0)
  const [notes, setNotes] = useState("")
  const [wholesale, setWholesale] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [cart, setCart] = useState<Array<{ productId: string; imeiId?: string; name: string; imei?: string; unitPrice: number; minPrice: number; quantity: number }>>([])
  const [busy, setBusy] = useState(false)

  const branchImeis = imeis.filter((item) => item.branchId === branchId && !cart.some((line) => line.imeiId === item.id))
  const q = query.trim().toLowerCase()
  const filtered = q
    ? branchImeis.filter(
        (item) =>
          item.imei1.toLowerCase().includes(q) ||
          (item.serialNumber ?? "").toLowerCase().includes(q) ||
          item.product.name.toLowerCase().includes(q)
      )
    : []
  const accessoryHits = q
    ? products.filter((product) => {
        if (product.serialized) return false
        const onHand = product.stock.find((row) => row.branchId === branchId)?.quantity ?? 0
        return onHand > 0 && (product.name.toLowerCase().includes(q) || product.sku.toLowerCase().includes(q))
      })
    : []

  const total = useMemo(() => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [cart])
  const customer = customers.find((row) => row.id === customerId)
  const due = Math.max(0, total - (method === "CREDIT" ? 0 : paid))
  const nextDebt = (customer?.currentBalance ?? 0) + (method === "CREDIT" ? total : due)
  const sellLock = sellLocks?.[branchId]

  function setPaidTo(nextTotal: number) {
    if (method !== "CREDIT") setPaid(nextTotal)
  }

  async function saveCustomer() {
    if (!newName.trim() || !newPhone.trim()) {
      toast.error("Name and phone are required for a new customer.")
      return
    }
    setSavingCustomer(true)
    const formData = new FormData()
    formData.set("name", newName.trim())
    formData.set("phone", newPhone.trim())
    formData.set("branchId", branchId)
    const result = await createCustomer(formData)
    setSavingCustomer(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success("Customer saved for this branch.")
    if (result.id) setCustomerId(result.id)
    setNewName("")
    setNewPhone("")
    router.refresh()
  }

  function takeScan(code: string) {
    const exact = branchImeis.find(
      (item) => item.imei1 === code || item.serialNumber === code || item.imei1.endsWith(code)
    )
    if (exact) {
      addImei(exact)
      toast.success("Added to cart")
      return
    }
    setQuery(code)
    toast.error("That IMEI is not In shop here. Check Goods on the way or the shop.")
  }

  function addImei(item: Imei) {
    const price = money(item.product.sellingPrice)
    setCart((current) => [
      ...current,
      {
        productId: item.productId,
        imeiId: item.id,
        name: item.product.name,
        imei: item.imei1,
        unitPrice: price,
        minPrice: money(item.product.minimumPrice),
        quantity: 1,
      },
    ])
    setPaidTo(total + price)
    setQuery("")
  }

  function addAccessory(product: Product) {
    const price = money(product.sellingPrice)
    setCart((current) => {
      const existing = current.find((line) => !line.imeiId && line.productId === product.id)
      if (existing) {
        return current.map((line) =>
          line === existing ? { ...line, quantity: line.quantity + 1 } : line
        )
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          unitPrice: price,
          minPrice: money(product.minimumPrice),
          quantity: 1,
        },
      ]
    })
    setPaidTo(total + price)
    setQuery("")
  }

  async function checkout() {
    if (method === "CREDIT" && !customerId) {
      toast.error("Credit sale needs a customer name.")
      return
    }
    if (due > 0 && !customerId) {
      toast.error("Part payment needs a customer name. Walk-in must pay everything now.")
      return
    }
    if (!canOverrideFloor && cart.some((line) => line.unitPrice < line.minPrice)) {
      toast.error("One price is below the lowest allowed. Raise it, or ask Super Admin.")
      return
    }
    const payload = {
      customerId: customerId || undefined,
      branchId,
      paymentMethod: method,
      paidAmount: method === "CREDIT" ? 0 : paid,
      notes,
      wholesale,
      items: cart.map((line) => ({
        productId: line.productId,
        imeiId: line.imeiId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
    }
    if (sellLock?.locked) {
      toast.error(sellLock.message)
      return
    }
    setBusy(true)
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await pushSaleQueue(payload)
      setBusy(false)
      toast.message("Saved on this device. Send it when the line returns.")
      setCart([])
      setPaid(0)
      return
    }
    let result: Awaited<ReturnType<typeof checkoutSale>>
    try {
      result = await checkoutSale(payload)
    } catch {
      await pushSaleQueue(payload)
      setBusy(false)
      toast.message("The server did not answer. This sale is waiting on this device.")
      setCart([])
      setPaid(0)
      return
    }
    setBusy(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success("Sale saved. This invoice cannot be edited.")
    router.push(`/sales/${result.saleId}`)
    router.refresh()
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      {sellLock?.locked ? (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-950 xl:col-span-2 dark:bg-rose-500/10 dark:text-rose-100">
          <p>{sellLock.message}</p>
          <a href={sellLock.href} className="mt-2 inline-block font-medium text-primary">
            Count the till for {sellLock.dates[0]}
          </a>
        </div>
      ) : null}
      <div className="space-y-4">
        <div className="surface-card space-y-3 p-4">
          <ScanField onScan={takeScan} placeholder="Scan IMEI to sell, then Enter" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                takeScan(query)
              }
            }}
            placeholder="Or type an accessory name"
          />
          {query ? (
            <div className="mt-3 space-y-2">
              {filtered.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  onClick={() => addImei(item)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-muted"
                >
                  <span>
                    <span className="block text-sm font-medium">{item.product.name}</span>
                    <span className="text-xs text-muted-foreground">{item.imei1}{item.serialNumber ? ` · ${item.serialNumber}` : ""}</span>
                  </span>
                  <span className="text-sm">{formatCurrency(money(item.product.sellingPrice))}</span>
                </button>
              ))}
              {accessoryHits.slice(0, 4).map((product) => (
                <button
                  key={product.id}
                  onClick={() => addAccessory(product)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-muted"
                >
                  <span>
                    <span className="block text-sm">{product.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Accessory · {product.stock.find((row) => row.branchId === branchId)?.quantity ?? 0} on hand
                    </span>
                  </span>
                  <span className="text-sm">{formatCurrency(money(product.sellingPrice))}</span>
                </button>
              ))}
              {filtered.length === 0 && accessoryHits.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">Nothing in this shop matches that search.</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="surface-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">IMEI</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line, index) => (
                <tr key={`${line.imeiId ?? line.productId}-${index}`} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium">{line.name}{line.quantity > 1 ? ` × ${line.quantity}` : ""}</p>
                    {line.unitPrice < line.minPrice ? (
                      <p className="text-xs text-rose-600">
                        Below lowest price {formatCurrency(line.minPrice)}
                        {canOverrideFloor ? " · Super Admin can still sell this" : " · you cannot complete this sale"}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{line.imei ?? "-"}</td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      className="h-9 w-28"
                      value={line.unitPrice}
                      onChange={(event) => {
                        const unitPrice = Number(event.target.value)
                        setCart((current) => current.map((row, i) => (i === index ? { ...row, unitPrice } : row)))
                      }}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const next = cart.filter((_, i) => i !== index)
                        setCart(next)
                        setPaidTo(next.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0))
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Scan a phone IMEI. After you finish, this sale cannot be edited.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface-card space-y-4 p-5">
        <h3 className="font-semibold">Finish sale</h3>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Shop</span>
          <Select
            value={branchId}
            onChange={(event) => {
              setBranchId(event.target.value)
              setCart([])
              setPaid(0)
              setCustomerId("")
            }}
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Customer</span>
          <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">Walk-in (must pay now)</option>
            {customers
              .filter((row) => row.branchId === branchId && !row.name.toLowerCase().includes("walk-in"))
              .map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {row.phone}
              </option>
            ))}
          </Select>
          {customer ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Owing {formatCurrency(customer.currentBalance)}
              {customer.creditLimit > 0 ? ` · limit ${formatCurrency(customer.creditLimit)}` : ""}
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="New name" />
              <Input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="Phone" />
              <Button type="button" variant="outline" size="sm" className="col-span-2" disabled={savingCustomer} onClick={saveCustomer}>
                {savingCustomer ? "Saving this customer" : "Save customer for this shop"}
              </Button>
            </div>
          )}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Payment</span>
          <Select
            value={method}
            onChange={(event) => {
              const next = event.target.value as typeof method
              setMethod(next)
              setPaid(next === "CREDIT" ? 0 : total)
            }}
          >
            <option value="CASH">Cash</option>
            <option value="TRANSFER">Transfer</option>
            <option value="POS">POS</option>
            <option value="CREDIT">Credit / due</option>
          </Select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Amount paid</span>
          <Input
            type="number"
            value={method === "CREDIT" ? 0 : paid}
            disabled={method === "CREDIT"}
            onChange={(event) => setPaid(Number(event.target.value))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={wholesale} onChange={(event) => setWholesale(event.target.checked)} />
          Wholesale / dealer sale
        </label>
        <Input placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        <div className="rounded-2xl bg-muted p-4">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-3xl font-semibold">{formatCurrency(total)}</p>
          <p className="text-xs text-muted-foreground">
            Due now {formatCurrency(method === "CREDIT" ? total : Math.max(0, total - paid))}
          </p>
          {customer && (method === "CREDIT" || due > 0) ? (
            <p className="mt-1 text-xs text-muted-foreground">After this sale they would owe {formatCurrency(nextDebt)}</p>
          ) : null}
        </div>
        <Button className="min-h-12 w-full" disabled={!cart.length || busy || Boolean(sellLock?.locked)} onClick={checkout}>
          {busy ? "Posting this sale" : sellLock?.locked ? "Close yesterday first" : "Complete sale"}
        </Button>
        <p className="text-xs text-muted-foreground">
          USB scanners work like a keyboard. Print the invoice after the sale. If a receipt printer is attached, printing can open the cash drawer.
        </p>
      </div>
    </div>
  )
}
