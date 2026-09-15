"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createCustomer } from "@/app/actions/parties"
import { checkoutSale } from "@/app/actions/sales"
import { ScanField } from "@/components/scan-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { pushSaleQueue } from "@/lib/offline-sales"
import { applyParkedToTillSnapshot, readTillSnapshot, saveTillSnapshot, type TillBranch, type TillCustomer, type TillImei, type TillProduct, type TillSellLock, type TillSnapshot } from "@/lib/till-catalog"
import { formatCurrency, money } from "@/lib/utils"
import { formatCondition } from "@/lib/status"
import { Trash2, RotateCcw, PlusCircle } from "lucide-react"
import { useDecision } from "@/hooks/use-decision"

export function PosClient({
  products: serverProducts,
  customers: serverCustomers,
  imeis: serverImeis,
  branches: serverBranches,
  defaultBranchId,
  canOverrideFloor: serverCanOverrideFloor,
  sellLocks: serverSellLocks,
}: {
  products: TillProduct[]
  customers: TillCustomer[]
  imeis: TillImei[]
  branches: TillBranch[]
  defaultBranchId?: string | null
  canOverrideFloor?: boolean
  sellLocks?: Record<string, TillSellLock>
}) {
  const router = useRouter()
  // The till reads the shop system while the line is up, and the last list
  // saved on this phone when it is down. Only the phone's own list is held in
  // state. The shop system's figures are read straight from props.
  //
  // They used to be copied into state on first load, which meant nothing sent
  // from the shop system afterwards ever arrived: a customer added at the till
  // a moment earlier was missing from the list, so the credit limit was checked
  // against nothing and the name looked unselected.
  const [deviceList, setDeviceList] = useState<TillSnapshot | null>(null)
  const [lineDown, setLineDown] = useState(false)

  const usingDeviceList = deviceList !== null
  const products = deviceList?.products ?? serverProducts
  const customers = deviceList?.customers ?? serverCustomers
  const imeis = deviceList?.imeis ?? serverImeis
  const branches = deviceList?.branches ?? serverBranches
  const canOverrideFloor = deviceList ? Boolean(deviceList.canOverrideFloor) : Boolean(serverCanOverrideFloor)
  const sellLocks = deviceList?.sellLocks ?? serverSellLocks
  const [query, setQuery] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [branchId, setBranchId] = useState(defaultBranchId || serverBranches[0]?.id || "")
  const [method, setMethod] = useState<"CASH" | "TRANSFER" | "POS" | "CREDIT" | "SPLIT_PAYMENT">("CASH")
  const [paid, setPaid] = useState(0)
  const [splitCash, setSplitCash] = useState(0)
  const [splitTransfer, setSplitTransfer] = useState(0)
  const [splitPos, setSplitPos] = useState(0)
  const [notes, setNotes] = useState("")
  const [wholesale, setWholesale] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [cart, setCart] = useState<
    Array<{
      productId: string
      imeiId?: string
      name: string
      imei?: string
      unitPrice: number
      minPrice: number
      quantity: number
      warrantyDays?: number
      storage?: string | null
      condition?: string | null
      color?: string | null
    }>
  >([])
  const [busy, setBusy] = useState(false)
  const { confirm } = useDecision()

  function resetSale() {
    setCart([])
    setPaid(0)
    setSplitCash(0)
    setSplitTransfer(0)
    setSplitPos(0)
    setCustomerId("")
    setNotes("")
    setWholesale(false)
    setQuery("")
  }

  const handleClearCart = async () => {
    if (cart.length === 0) {
      resetSale()
      toast.info("Register cleared. Ready for next transaction.")
      return
    }
    const ok = await confirm({
      title: "Start New Transaction / Discard Cart?",
      description: `You currently have ${cart.length} item(s) scanned in this transaction. Starting a new transaction will clear the active register and release scanned devices back to inventory.`,
      tone: "danger",
      confirmLabel: "Yes, Start New Transaction",
      cancelLabel: "Keep Cart",
      impactItems: [
        `${cart.length} item(s) will be cleared immediately`,
        "Scanned IMEIs and serial numbers will become available for other sales",
      ],
    })
    if (ok) {
      resetSale()
      toast.info("Register cleared. Ready for next customer.")
    }
  }

  const handleBranchChange = async (newBranchId: string) => {
    if (newBranchId === branchId) return
    if (cart.length > 0) {
      const ok = await confirm({
        title: "Switch Branch Location?",
        description: "Switching branches clears all items currently scanned in this cart because inventory records are branch-isolated.",
        tone: "warning",
        confirmLabel: "Yes, Switch & Clear",
        cancelLabel: "Cancel",
        impactItems: [
          `Active cart of ${cart.length} item(s) will be cleared`,
          "Items cannot be sold across different branch inventories simultaneously",
        ],
      })
      if (!ok) return
    }
    setBranchId(newBranchId)
    setCart([])
    setPaid(0)
    setCustomerId("")
  }

  useEffect(() => {
    const onLine = () => {
      const down = !navigator.onLine
      setLineDown(down)
      // When the line comes back, go back to the shop system's list and ask the
      // server for a fresh one. The till used to stay on the phone's saved list
      // for the rest of the shift, so a phone sold at the other till kept
      // showing as In shop here long after the line returned.
      if (!down) {
        setDeviceList((current) => {
          if (current) router.refresh()
          return null
        })
      }
    }
    onLine()
    window.addEventListener("online", onLine)
    window.addEventListener("offline", onLine)
    return () => {
      window.removeEventListener("online", onLine)
      window.removeEventListener("offline", onLine)
    }
  }, [router])

  useEffect(() => {
    let cancelled = false
    const snapshot = {
      products: serverProducts,
      customers: serverCustomers,
      imeis: serverImeis,
      branches: serverBranches,
      defaultBranchId,
      canOverrideFloor: serverCanOverrideFloor,
      sellLocks: serverSellLocks,
    }
    void (async () => {
      const online = navigator.onLine
      if (online && (serverImeis.length || serverCustomers.length || serverProducts.length)) {
        await saveTillSnapshot(snapshot)
        // Fresh figures have arrived, so the phone's older copy is no longer
        // what should be on screen.
        if (!cancelled) setDeviceList(null)
        return
      }
      const stored = await readTillSnapshot()
      if (cancelled) return
      if (stored) {
        setDeviceList(stored)
        if (stored.defaultBranchId && !branchId) setBranchId(stored.defaultBranchId)
        return
      }
      if (!online && (serverImeis.length || serverCustomers.length)) {
        await saveTillSnapshot(snapshot)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [serverProducts, serverCustomers, serverImeis, serverBranches, defaultBranchId, serverCanOverrideFloor, serverSellLocks])

  // What is In shop here and not already on this sale. Worked out once per
  // change rather than on every keystroke: this walks every phone in the shop
  // and, for each, the whole cart, so on a big shop it was enough work between
  // keypresses to make the search box feel stuck.
  const cartImeiIds = useMemo(
    () => new Set(cart.map((line) => line.imeiId).filter(Boolean) as string[]),
    [cart]
  )
  const branchImeis = useMemo(
    () => imeis.filter((item) => item.branchId === branchId && !cartImeiIds.has(item.id)),
    [imeis, branchId, cartImeiIds]
  )

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      q
        ? branchImeis.filter(
            (item) =>
              item.imei1.toLowerCase().includes(q) ||
              (item.serialNumber ?? "").toLowerCase().includes(q) ||
              item.product.name.toLowerCase().includes(q)
          )
        : [],
    [q, branchImeis]
  )
  const accessoryHits = useMemo(
    () =>
      q
        ? products.filter((product) => {
            if (product.serialized) return false
            const onHand = product.stock.find((row) => row.branchId === branchId)?.quantity ?? 0
            return onHand > 0 && (product.name.toLowerCase().includes(q) || product.sku.toLowerCase().includes(q))
          })
        : [],
    [q, products, branchId]
  )

  const total = useMemo(() => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [cart])
  const customer = customers.find((row) => row.id === customerId)
  const effectivePaid = method === "SPLIT_PAYMENT"
    ? (splitCash + splitTransfer + splitPos)
    : (method === "CREDIT" ? 0 : paid)
  const due = Math.max(0, total - effectivePaid)
  const nextDebt = (customer?.currentBalance ?? 0) + (method === "CREDIT" ? total : due)
  const sellLock = sellLocks?.[branchId]

  function setPaidTo(nextTotal: number) {
    if (method !== "CREDIT" && method !== "SPLIT_PAYMENT") setPaid(nextTotal)
  }

  async function saveCustomer() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("You can only add a new name when the network is good. Use a customer already saved on this phone.")
      return
    }
    if (!newName.trim() || !newPhone.trim()) {
      toast.error("A new customer needs a name and a phone number.")
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
    toast.success("Customer saved for this shop.")
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
    toast.error("That IMEI is not in this shop. Check Goods on the way, or check the shop.")
  }

  function addImei(item: TillImei) {
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
        warrantyDays: 0,
        storage: item.product.storage,
        condition: item.product.condition,
        color: item.product.color,
      },
    ])
    setPaidTo(total + price)
    setQuery("")
  }

  function addAccessory(product: TillProduct) {
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
          warrantyDays: 0,
          storage: product.storage,
          condition: product.condition,
          color: product.color,
        },
      ]
    })
    setPaidTo(total + price)
    setQuery("")
  }

  async function checkout() {
    if (method === "CREDIT" && !customerId) {
      toast.error("A credit sale needs a buyer name.")
      return
    }
    if (due > 0 && !customerId) {
      toast.error("A part payment needs a buyer name. A walk-in must pay everything now.")
      return
    }
    if (due > 0 && customerId) {
      const cust = customers.find((c) => c.id === customerId)
      const ok = await confirm({
        title: "Confirm Receivable / Balance Due",
        description: `This transaction leaves an unpaid balance of ${formatCurrency(due)} to be booked against ${cust?.name || "the customer"}.`,
        tone: "warning",
        confirmLabel: "Yes, Book Receivable",
        cancelLabel: "Adjust Payment Amount",
        impactItems: [
          `Immediate payment received: ${formatCurrency(effectivePaid)}`,
          `Remaining balance owed to shop: ${formatCurrency(due)}`,
          `Customer ledger: ${cust?.name || "Selected customer"}`,
        ],
      })
      if (!ok) return
    }
    if (!canOverrideFloor && cart.some((line) => line.unitPrice < line.minPrice)) {
      toast.error("One price is under the lowest price allowed. Raise it, or ask the main admin.")
      return
    }

    const splitTenders = method === "SPLIT_PAYMENT"
      ? [
          { method: "CASH" as const, amount: splitCash },
          { method: "TRANSFER" as const, amount: splitTransfer },
          { method: "POS" as const, amount: splitPos },
        ].filter((t) => t.amount > 0)
      : undefined

    const payload = {
      customerId: customerId || undefined,
      branchId,
      paymentMethod: method,
      paidAmount: effectivePaid,
      splitTenders,
      notes,
      wholesale,
      items: cart.map((line) => ({
        productId: line.productId,
        imeiId: line.imeiId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        warrantyDays: line.warrantyDays ?? 0,
      })),
    }
    if (sellLock?.locked) {
      toast.error(sellLock.message)
      return
    }
    setBusy(true)
    async function keepOnDevice() {
      await pushSaleQueue(payload)
      const next = await applyParkedToTillSnapshot(payload)
      if (next) setDeviceList(next)
      setBusy(false)
      setCart([])
      setPaid(0)
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await keepOnDevice()
      toast.message("Saved on this phone. Send it when the network comes back.")
      return
    }
    let result: Awaited<ReturnType<typeof checkoutSale>>
    try {
      result = await checkoutSale(payload)
    } catch {
      await keepOnDevice()
      toast.message("The shop system did not answer. This sale is waiting on this phone.")
      return
    }
    setBusy(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success("Sale saved. Nobody can change this invoice.")
    resetSale()
    // Straight to the receipt, printing itself, so the customer is handed it
    // before they leave the counter.
    router.push(`/sales/${result.saleId}?receipt=1`)
    router.refresh()
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      {usingDeviceList || lineDown ? (
        <div className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning xl:col-span-2">
          You are selling from the last shop list saved on this phone. You can only use names already on this phone. Phones still on the way are not here. The real invoice is created when the network comes back.
        </div>
      ) : null}
      {sellLock?.locked ? (
        <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger xl:col-span-2">
          <p>{sellLock.message}</p>
          <a href={sellLock.href} className="mt-2 inline-block font-medium text-primary">
            Count the till for {sellLock.dates[0]}
          </a>
        </div>
      ) : null}
      <div className="space-y-4">
        <div className="surface-card space-y-3 p-4">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Scan or Search Product
            </span>
            <button
              type="button"
              onClick={handleClearCart}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <PlusCircle className="h-3.5 w-3.5" /> Start New Sale / Reset
            </button>
          </div>
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
            placeholder="Or type an accessory name or device model"
          />
          {query ? (
            <div className="mt-3 space-y-2">
              {filtered.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  onClick={() => addImei(item)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-muted"
                >
                  <div>
                    <span className="block text-sm font-medium">{item.product.name}</span>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <span className="font-mono text-foreground font-semibold">{item.imei1}</span>
                      {item.serialNumber ? <span>· {item.serialNumber}</span> : null}
                      {item.product.storage ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 font-semibold text-[10px]">
                          {item.product.storage}
                        </span>
                      ) : null}
                      {item.product.condition ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 font-medium text-[10px]">
                          {formatCondition(item.product.condition)}
                        </span>
                      ) : null}
                      {item.product.color ? (
                        <span className="text-[11px] text-muted-foreground">· {item.product.color}</span>
                      ) : null}
                    </div>
                  </div>
                  <span className="text-sm font-semibold">{formatCurrency(money(item.product.sellingPrice))}</span>
                </button>
              ))}
              {accessoryHits.slice(0, 4).map((product) => (
                <button
                  key={product.id}
                  onClick={() => addAccessory(product)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-muted"
                >
                  <div>
                    <span className="block text-sm font-medium">{product.name}</span>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <span>Accessory · {product.stock.find((row) => row.branchId === branchId)?.quantity ?? 0} on hand</span>
                      {product.storage ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 font-semibold text-[10px]">
                          {product.storage}
                        </span>
                      ) : null}
                      {product.condition ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 font-medium text-[10px]">
                          {formatCondition(product.condition)}
                        </span>
                      ) : null}
                      {product.color ? <span className="text-[11px] text-muted-foreground">· {product.color}</span> : null}
                    </div>
                  </div>
                  <span className="text-sm font-semibold">{formatCurrency(money(product.sellingPrice))}</span>
                </button>
              ))}
              {filtered.length === 0 && accessoryHits.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">Nothing in this shop matches what you typed.</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Current Transaction Items ({cart.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearCart}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {cart.length > 0 ? "Clear Cart / New Sale" : "New Sale"}
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Device / Item</th>
                <th className="px-4 py-3">IMEI / Serial</th>
                <th className="px-4 py-3">Warranty</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line, index) => (
                <tr key={`${line.imeiId ?? line.productId}-${index}`} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium">{line.name}{line.quantity > 1 ? ` × ${line.quantity}` : ""}</p>
                    {(line.storage || line.condition || line.color) ? (
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {line.storage ? (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 font-semibold text-[10px]">
                            {line.storage}
                          </span>
                        ) : null}
                        {line.condition ? (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 font-medium text-[10px]">
                            {formatCondition(line.condition)}
                          </span>
                        ) : null}
                        {line.color ? (
                          <span className="text-[11px] text-muted-foreground">
                            · {line.color}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {line.unitPrice < line.minPrice ? (
                      <p className="text-xs text-danger">
                        Below lowest price {formatCurrency(line.minPrice)}
                        {canOverrideFloor ? " · The main admin can still sell this" : " · you cannot complete this sale"}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{line.imei ?? "-"}</td>
                  <td className="px-4 py-3">
                    <Select
                      value={String(line.warrantyDays ?? 0)}
                      onChange={(event) => {
                        const val = Math.max(0, Number(event.target.value) || 0)
                        setCart((current) =>
                          current.map((row, i) => (i === index ? { ...row, warrantyDays: val } : row))
                        )
                      }}
                      className="h-8 text-xs w-32"
                    >
                      <option value="0">0 days (No warranty)</option>
                      <option value="3">3 days testing</option>
                      <option value="7">7 days (1 week)</option>
                      <option value="14">14 days (2 weeks)</option>
                      <option value="21">21 days (3 weeks)</option>
                      <option value="30">30 days (1 month)</option>
                      <option value="60">60 days (2 months)</option>
                      <option value="90">90 days (3 months)</option>
                    </Select>
                  </td>
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
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
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
            onChange={(event) => void handleBranchChange(event.target.value)}
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
            <option value="">No name (must pay now)</option>
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
          ) : lineDown ? (
            <p className="mt-2 text-xs text-muted-foreground">
              You cannot save a new buyer while the network is down. Pick a name already on this phone, or take a walk-in who pays everything now.
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
          <span className="mb-1 block text-muted-foreground">Payment Method</span>
          <Select
            value={method}
            onChange={(event) => {
              const next = event.target.value as typeof method
              setMethod(next)
              if (next === "CREDIT") {
                setPaid(0)
              } else if (next === "SPLIT_PAYMENT") {
                setSplitCash(total)
                setSplitTransfer(0)
                setSplitPos(0)
              } else {
                setPaid(total)
              }
            }}
          >
            <option value="CASH">Cash</option>
            <option value="TRANSFER">Bank Transfer</option>
            <option value="POS">POS Terminal</option>
            <option value="SPLIT_PAYMENT">Split Payment (Multiple Tenders)</option>
            <option value="CREDIT">Credit / Account Due</option>
          </Select>
        </label>
        {method === "SPLIT_PAYMENT" ? (
          <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">Multi-Tender Breakdown</span>
              <span className="font-semibold text-primary">Invoice Total: {formatCurrency(total)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="mb-1 block text-xs text-muted-foreground">Cash (₦)</span>
                <Input
                  type="number"
                  min="0"
                  value={splitCash || ""}
                  placeholder="0"
                  onChange={(e) => setSplitCash(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div>
                <span className="mb-1 block text-xs text-muted-foreground">Transfer (₦)</span>
                <Input
                  type="number"
                  min="0"
                  value={splitTransfer || ""}
                  placeholder="0"
                  onChange={(e) => setSplitTransfer(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div>
                <span className="mb-1 block text-xs text-muted-foreground">POS (₦)</span>
                <Input
                  type="number"
                  min="0"
                  value={splitPos || ""}
                  placeholder="0"
                  onChange={(e) => setSplitPos(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
              <span className="text-muted-foreground">Combined Tenders:</span>
              <span className={`font-semibold ${splitCash + splitTransfer + splitPos === total ? "text-emerald-600" : "text-amber-600"}`}>
                {formatCurrency(splitCash + splitTransfer + splitPos)}
              </span>
            </div>
          </div>
        ) : (
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Amount paid</span>
            <Input
              type="number"
              value={method === "CREDIT" ? 0 : paid}
              disabled={method === "CREDIT"}
              onChange={(event) => setPaid(Number(event.target.value))}
            />
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={wholesale} onChange={(event) => setWholesale(event.target.checked)} />
          Wholesale / dealer sale
        </label>
        <Input placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        <div className="rounded-lg bg-muted p-4">
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
          {busy ? "Saving this sale" : sellLock?.locked ? "Close yesterday first" : "Complete sale"}
        </Button>
        <p className="text-xs text-muted-foreground">
          USB scanners work like a keyboard. Print the invoice after the sale. If a receipt printer is attached, printing can open the cash drawer.
        </p>
      </div>
    </div>
  )
}
