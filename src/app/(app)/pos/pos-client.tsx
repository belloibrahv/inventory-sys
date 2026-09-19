"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createCustomer } from "@/app/actions/parties"
import { checkoutSale, findInStockImei, searchTillStock } from "@/app/actions/sales"
import { TillLookup } from "@/components/till-lookup"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { pushSaleQueue } from "@/lib/offline-sales"
import { requestParkedFlush } from "@/lib/flush-parked"
import { applyParkedToTillSnapshot, readTillSnapshot, saveTillSnapshot, type TillBankAccount, type TillBranch, type TillCustomer, type TillImei, type TillProduct, type TillSellLock, type TillSnapshot } from "@/lib/till-catalog"
import { formatCurrency, money } from "@/lib/utils"
import { formatCondition } from "@/lib/status"
import { phoneLookLabel, isBlockedFromSell } from "@/lib/phone-look"
import { Trash2, RotateCcw, PlusCircle } from "lucide-react"
import { useDecision } from "@/hooks/use-decision"

function lookLabel(item: TillImei) {
  return phoneLookLabel(item.cosmeticGrade) || formatCondition(item.product.condition)
}

/** Uploaded initial sell price is the floor. Use the higher of sell and lowest. */
function initialSellFloor(sellingPrice: number, minimumPrice: number) {
  return Math.max(money(sellingPrice), money(minimumPrice))
}

function detailParts(storage?: string | null, condition?: string | null, color?: string | null, category?: string | null) {
  const look = formatCondition(condition) || phoneLookLabel(condition)
  return [storage, look, color, category].filter(Boolean) as string[]
}

function matchesTillQuery(
  q: string,
  fields: Array<string | null | undefined>
) {
  const hay = fields.filter(Boolean).join(" ").toLowerCase()
  return hay.includes(q)
}

export function PosClient({
  products: serverProducts,
  customers: serverCustomers,
  imeis: serverImeis,
  branches: serverBranches,
  bankAccounts: serverBankAccounts = [],
  defaultBranchId,
  canOverrideFloor: serverCanOverrideFloor,
  sellLocks: serverSellLocks,
}: {
  products: TillProduct[]
  customers: TillCustomer[]
  imeis: TillImei[]
  branches: TillBranch[]
  bankAccounts?: TillBankAccount[]
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
  const bankAccounts = deviceList?.bankAccounts ?? serverBankAccounts
  const canOverrideFloor = deviceList ? Boolean(deviceList.canOverrideFloor) : Boolean(serverCanOverrideFloor)
  const sellLocks = deviceList?.sellLocks ?? serverSellLocks
  const [query, setQuery] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [branchId, setBranchId] = useState(defaultBranchId || serverBranches[0]?.id || "")
  const [method, setMethod] = useState<"CASH" | "BANK" | "CREDIT">("CASH")
  const [creditTender, setCreditTender] = useState<"CASH" | "BANK">("BANK")
  const [bankAccountId, setBankAccountId] = useState("")
  const [paid, setPaid] = useState(0)
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
      listPrice: number
      minPrice: number
      quantity: number
      onHand?: number
      warrantyDays?: number
      storage?: string | null
      condition?: string | null
      color?: string | null
      category?: string | null
    }>
  >([])
  const [busy, setBusy] = useState(false)
  const [remoteImeis, setRemoteImeis] = useState<TillImei[]>([])
  const [remoteAccessories, setRemoteAccessories] = useState<TillProduct[]>([])
  const [searchingRemote, setSearchingRemote] = useState(false)
  const { confirm } = useDecision()

  function resetSale() {
    setCart([])
    setPaid(0)
    setCreditTender("BANK")
    setCustomerId("")
    setNotes("")
    setWholesale(false)
    setQuery("")
  }

  const handleClearCart = async () => {
    if (cart.length === 0) {
      resetSale()
      toast.info("Sale cleared. Ready for the next buyer.")
      return
    }
    const ok = await confirm({
      title: "Start a new sale?",
      description: `This sale has ${cart.length} item${cart.length === 1 ? "" : "s"} scanned. Starting a new sale clears them so another till can sell those phones.`,
      tone: "danger",
      confirmLabel: "Yes, start a new sale",
      cancelLabel: "Keep this sale",
      impactItems: [
        `${cart.length} item${cart.length === 1 ? "" : "s"} will leave this sale`,
        "Those IMEIs can be sold again",
      ],
    })
    if (ok) {
      resetSale()
      toast.info("Sale cleared. Ready for the next buyer.")
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
      bankAccounts: serverBankAccounts,
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
  }, [serverProducts, serverCustomers, serverImeis, serverBranches, serverBankAccounts, defaultBranchId, serverCanOverrideFloor, serverSellLocks])

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
  const filtered = useMemo(() => {
    const local = q
      ? branchImeis.filter((item) =>
          matchesTillQuery(q, [
            item.imei1,
            item.serialNumber,
            item.product.name,
            item.product.storage,
            item.product.color,
            item.product.brand,
            item.product.category,
            lookLabel(item),
            item.cosmeticGrade,
          ])
        )
      : []
    const localIds = new Set(local.map((row) => row.id))
    const extra = remoteImeis.filter(
      (item) => item.branchId === branchId && !cartImeiIds.has(item.id) && !localIds.has(item.id)
    )
    return [...local, ...extra]
  }, [q, branchImeis, remoteImeis, branchId, cartImeiIds])
  const accessoryHits = useMemo(() => {
    const local = q
      ? products.filter((product) => {
          if (product.serialized) return false
          const onHand = product.stock.find((row) => row.branchId === branchId)?.quantity ?? 0
          return (
            onHand > 0 &&
            matchesTillQuery(q, [
              product.name,
              product.sku,
              product.brand.name,
              product.category?.name,
              product.storage,
              product.color,
              formatCondition(product.condition),
            ])
          )
        })
      : []
    const localIds = new Set(local.map((row) => row.id))
    const extra = remoteAccessories.filter((product) => {
      if (product.serialized) return false
      if (localIds.has(product.id)) return false
      const onHand = product.stock.find((row) => row.branchId === branchId)?.quantity ?? 0
      return onHand > 0
    })
    return [...local, ...extra]
  }, [q, products, branchId, remoteAccessories])

  useEffect(() => {
    if (!q || q.length < 2) {
      setRemoteImeis([])
      setRemoteAccessories([])
      return
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSearchingRemote(true)
      const result = await searchTillStock(query.trim(), branchId)
      if (cancelled) return
      setSearchingRemote(false)
      if ("error" in result && result.error) {
        setRemoteImeis([])
        setRemoteAccessories([])
        return
      }
      setRemoteImeis(result.imeis ?? [])
      setRemoteAccessories((result.accessories ?? []) as TillProduct[])
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [q, query, branchId])

  const total = useMemo(
    () =>
      cart.reduce((sum, line) => {
        const price = Number.isFinite(line.unitPrice) ? line.unitPrice : 0
        const qty = Number.isFinite(line.quantity) ? line.quantity : 0
        return sum + price * qty
      }, 0),
    [cart]
  )
  const customer = customers.find((row) => row.id === customerId)
  const shopBanks = useMemo(
    () => bankAccounts.filter((row) => row.branchId === branchId),
    [bankAccounts, branchId]
  )
  // Cash and Bank always pay the full sale total. Only Credit sales keep a separate
  // "received now" figure. That stops Amount paid from lagging behind a raised price.
  const effectivePaid = method === "CREDIT" ? Math.min(Math.max(0, paid), total) : total
  const due = Math.max(0, total - effectivePaid)
  const nextDebt = (customer?.currentBalance ?? 0) + due
  const sellLock = sellLocks?.[branchId]
  const wantsBank =
    method === "BANK" || (method === "CREDIT" && effectivePaid > 0 && creditTender === "BANK")

  useEffect(() => {
    if (!shopBanks.length) {
      if (bankAccountId) setBankAccountId("")
      return
    }
    if (!shopBanks.some((row) => row.id === bankAccountId)) {
      setBankAccountId(shopBanks[0].id)
    }
  }, [shopBanks, bankAccountId])

  useEffect(() => {
    if (method !== "CREDIT") setPaid(total)
  }, [method, total])

  function setPaidTo(nextTotal: number) {
    if (method !== "CREDIT") setPaid(nextTotal)
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

  async function takeScan(code: string) {
    const cleaned = code.replace(/[\s-]/g, "").trim()
    const exact = branchImeis.find(
      (item) =>
        item.imei1 === cleaned ||
        item.serialNumber === cleaned ||
        item.imei1 === code.trim() ||
        item.serialNumber === code.trim() ||
        item.imei1.endsWith(cleaned)
    )
    if (exact) {
      addImei(exact)
      toast.success("Added to this sale")
      return
    }
    if (typeof navigator !== "undefined" && navigator.onLine) {
      const found = await findInStockImei(cleaned || code.trim(), branchId)
      if (found.imei) {
        addImei(found.imei)
        toast.success("Added to this sale")
        return
      }
      toast.error(found.error || "Nothing in this shop matches that scan. Check Goods on the way, or check the shop.")
      return
    }
    setQuery(code)
    toast.error("That number is not in the list saved on this phone. Scan from the last In shop list, or wait for the network.")
  }

  async function takeLookupCommit(raw: string) {
    const typed = raw.trim()
    if (!typed) return
    const cleaned = typed.replace(/[\s-]/g, "")
    const exactLocal = branchImeis.find(
      (item) =>
        item.imei1 === cleaned ||
        item.serialNumber === cleaned ||
        item.imei1 === typed ||
        item.serialNumber === typed ||
        (cleaned.length >= 8 && item.imei1.endsWith(cleaned))
    )
    if (exactLocal) {
      addImei(exactLocal)
      toast.success("Added to this sale")
      return
    }
    if (filtered[0]) {
      addImei(filtered[0])
      toast.success("Added to this sale")
      return
    }
    if (accessoryHits[0]) {
      addAccessory(accessoryHits[0])
      return
    }
    await takeScan(typed)
  }

  function addImei(item: TillImei) {
    if (isBlockedFromSell({ cosmeticGrade: item.cosmeticGrade, productCondition: item.product.condition })) {
      toast.error("That phone is Damaged. It cannot be sold. Open All phones and Set Good (sellable) if it is fixed.")
      return
    }
    const floor = initialSellFloor(item.product.sellingPrice, item.product.minimumPrice)
    setCart((current) => {
      const next = [
        ...current,
        {
          productId: item.productId,
          imeiId: item.id,
          name: item.product.name,
          imei: item.imei1,
          unitPrice: floor,
          listPrice: floor,
          minPrice: floor,
          quantity: 1,
          warrantyDays: 0,
          storage: item.product.storage,
          condition: item.cosmeticGrade || item.product.condition,
          color: item.product.color,
          category: item.product.category ?? null,
        },
      ]
      syncPaid(next)
      return next
    })
    setQuery("")
    setRemoteImeis([])
    setRemoteAccessories([])
  }

  function syncPaid(nextCart: typeof cart) {
    setPaidTo(nextCart.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0))
  }

  function setLineQuantity(index: number, raw: number) {
    setCart((current) => {
      const next = current.map((row, i) => {
        if (i !== index) return row
        if (row.imeiId) return { ...row, quantity: 1 }
        const max = row.onHand && row.onHand > 0 ? row.onHand : 9999
        const quantity = Math.max(1, Math.min(max, Math.floor(Number.isFinite(raw) ? raw : 1) || 1))
        return { ...row, quantity }
      })
      syncPaid(next)
      return next
    })
  }

  function addAccessory(product: TillProduct, pieces = 1) {
    if (isBlockedFromSell({ productCondition: product.condition })) {
      toast.error(`${product.name} is Damaged and cannot be sold.`)
      return
    }
    const onHand = product.stock.find((row) => row.branchId === branchId)?.quantity ?? 0
    if (onHand < 1) {
      toast.error(`${product.name} has no pieces left in this shop.`)
      return
    }
    const floor = initialSellFloor(product.sellingPrice, product.minimumPrice)
    const addQty = Math.max(1, Math.min(onHand, Math.floor(pieces) || 1))
    setCart((current) => {
      const existing = current.find((line) => !line.imeiId && line.productId === product.id)
      let next
      if (existing) {
        const quantity = Math.min(onHand, existing.quantity + addQty)
        if (quantity === existing.quantity) {
          toast.error(`Only ${onHand} piece${onHand === 1 ? "" : "s"} of ${product.name} left in this shop.`)
          return current
        }
        next = current.map((line) =>
          line === existing ? { ...line, quantity, onHand } : line
        )
        toast.success(`Pieces on this sale: ${quantity}`)
      } else {
        next = [
          ...current,
          {
            productId: product.id,
            name: product.name,
            unitPrice: floor,
            listPrice: floor,
            minPrice: floor,
            quantity: addQty,
            onHand,
            warrantyDays: 0,
            storage: product.storage,
            condition: product.condition,
            color: product.color,
            category: product.category?.name ?? null,
          },
        ]
        toast.success(
          addQty === 1
            ? "Added to this sale. Change Pieces if you need more."
            : `Added ${addQty} pieces to this sale.`
        )
      }
      syncPaid(next)
      return next
    })
    setQuery("")
    setRemoteImeis([])
    setRemoteAccessories([])
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
        title: "This buyer will still owe us",
        description: `${formatCurrency(due)} will stay owed by ${cust?.name || "this buyer"} after this sale.`,
        tone: "warning",
        confirmLabel: "Yes, they still owe us",
        cancelLabel: "Change the amount received",
        impactItems: [
          `Money received now: ${formatCurrency(effectivePaid)}`,
          `Still owed: ${formatCurrency(due)}`,
          `Buyer: ${cust?.name || "this buyer"}`,
        ],
      })
      if (!ok) return
    }
    if (wantsBank && !bankAccountId) {
      toast.error("Pick which bank account received this money. Add banks under Money in and out if the list is empty.")
      return
    }
    if (!canOverrideFloor && cart.some((line) => line.unitPrice < line.listPrice)) {
      toast.error("One price is under the initial sell price. Raise it for this buyer, or ask the CEO or Super Admin.")
      return
    }
    if (cart.some((line) => !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) {
      toast.error("Every line needs a valid sell price before you complete the sale.")
      return
    }
    if (!(total > 0) && cart.length > 0) {
      toast.error("Sale total cannot be zero. Check the prices on this sale.")
      return
    }
    for (const line of cart) {
      if (line.imeiId) continue
      const product = products.find((row) => row.id === line.productId)
      const onHand =
        line.onHand ??
        product?.stock.find((row) => row.branchId === branchId)?.quantity ??
        0
      if (line.quantity > onHand) {
        toast.error(
          `${line.name}: only ${onHand} piece${onHand === 1 ? "" : "s"} left in this shop. Lower Pieces on this sale.`
        )
        return
      }
    }

    const depositChannel: "CASH" | "TRANSFER" =
      method === "CREDIT"
        ? creditTender === "CASH"
          ? "CASH"
          : "TRANSFER"
        : method === "CASH"
          ? "CASH"
          : "TRANSFER"

    // Credit sales always send CREDIT. Cash / Bank send the tender and the full total.
    const checkoutMethod: "CASH" | "TRANSFER" | "CREDIT" =
      method === "CREDIT" ? "CREDIT" : depositChannel

    const payload = {
      customerId: customerId || undefined,
      branchId,
      paymentMethod: checkoutMethod,
      paidAmount: effectivePaid,
      depositMethod: method === "CREDIT" && effectivePaid > 0 ? depositChannel : undefined,
      bankAccountId: wantsBank ? bankAccountId : undefined,
      notes,
      wholesale,
      items: cart.map((line) => ({
        productId: line.productId,
        imeiId: line.imeiId,
        quantity: line.quantity,
        unitPrice: Number.isFinite(line.unitPrice) ? line.unitPrice : 0,
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
      await requestParkedFlush()
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
        <div className="surface-card space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Add to this sale</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Phones and piece items use the same box.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearCart}
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              <PlusCircle className="h-4 w-4" /> Start a new sale
            </button>
          </div>
          <TillLookup
            value={query}
            onChange={setQuery}
            onCommit={takeLookupCommit}
            searching={searchingRemote}
            disabled={Boolean(sellLock?.locked)}
          />
          {query ? (
            <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
              <div className="border-b border-border px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {searchingRemote ? "Looking across this shop stock" : "Matches in this shop"}
                </p>
              </div>
              <div className="divide-y divide-border">
              {filtered.slice(0, 8).map((item) => {
                const parts = detailParts(
                  item.product.storage,
                  item.cosmeticGrade || item.product.condition,
                  item.product.color,
                  item.product.category
                )
                return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addImei(item)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-background"
                >
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold">{item.product.name}</span>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="font-mono font-semibold text-foreground">{item.imei1}</span>
                      {item.serialNumber ? <span>· {item.serialNumber}</span> : null}
                      {parts.length ? (
                        <span className="text-foreground">{parts.join(" · ")}</span>
                      ) : (
                        <span>Details not set on this phone</span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(money(item.product.sellingPrice))}</span>
                </button>
              )})}
              {accessoryHits.slice(0, 6).map((product) => {
                const parts = detailParts(
                  product.storage,
                  product.condition,
                  product.color,
                  product.category?.name
                )
                const onHand = product.stock.find((row) => row.branchId === branchId)?.quantity ?? 0
                return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addAccessory(product)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-background"
                >
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold">{product.name}</span>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                      <span>
                        {onHand} on hand
                        {product.brand?.name ? ` · ${product.brand.name}` : ""}
                      </span>
                      {parts.length ? <span className="text-foreground">{parts.join(" · ")}</span> : null}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(money(product.sellingPrice))}</span>
                </button>
              )})}
              {filtered.length === 0 && accessoryHits.length === 0 && !searchingRemote ? (
                <p className="px-3 py-5 text-sm text-muted-foreground">
                  Nothing in this shop matches what you typed. Check the spelling, or scan the IMEI or serial.
                </p>
              ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <div className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              This sale ({cart.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearCart}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {cart.length > 0 ? "Clear this sale" : "New sale"}
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Device / Item</th>
                <th className="px-4 py-3">IMEI / Serial</th>
                <th className="px-4 py-3">Pieces</th>
                <th className="px-4 py-3">Warranty</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line, index) => {
                const parts = detailParts(line.storage, line.condition, line.color, line.category)
                const isPieceLine = !line.imeiId
                const onHand =
                  line.onHand ??
                  products.find((row) => row.id === line.productId)?.stock.find((row) => row.branchId === branchId)
                    ?.quantity ??
                  0
                return (
                <tr key={`${line.imeiId ?? line.productId}-${index}`} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium">{line.name}</p>
                    {parts.length ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{parts.join(" · ")}</p>
                    ) : isPieceLine ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">Sold by pieces</p>
                    ) : (
                      <p className="mt-0.5 text-xs text-danger">
                        Storage and how the phone looks are missing. Fix on Phones and items or Upload stock.
                      </p>
                    )}
                    {line.unitPrice < line.listPrice ? (
                      <p className="text-xs text-danger">
                        Below initial sell price {formatCurrency(line.listPrice)}
                        {canOverrideFloor
                          ? " · CEO or Super Admin can still sell this"
                          : " · raise the price, or ask the CEO or Super Admin"}
                      </p>
                    ) : null}
                    {line.unitPrice > line.listPrice ? (
                      <p className="text-xs text-muted-foreground">
                        Raised above initial {formatCurrency(line.listPrice)} for this buyer. Amount received updates with this price.
                      </p>
                    ) : line.unitPrice === line.listPrice ? (
                      <p className="text-xs text-muted-foreground">
                        Starts at the initial sell price. You may raise it for a walk-in buyer.
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{line.imei ?? "Piece item"}</td>
                  <td className="px-4 py-3">
                    {isPieceLine ? (
                      <div>
                        <Input
                          type="number"
                          min={1}
                          max={onHand > 0 ? onHand : undefined}
                          step={1}
                          className="h-9 w-24"
                          value={String(line.quantity)}
                          onChange={(event) => setLineQuantity(index, Number(event.target.value))}
                          aria-label={`Pieces of ${line.name}`}
                        />
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {onHand > 0 ? `${onHand} on hand in this shop` : "On hand not known"}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm font-medium">1</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      className="h-8 w-28"
                      value={String(line.warrantyDays ?? 0)}
                      onChange={(event) => {
                        const val = Math.max(0, Number(event.target.value) || 0)
                        setCart((current) =>
                          current.map((row, i) => (i === index ? { ...row, warrantyDays: val } : row))
                        )
                      }}
                      aria-label={`Warranty days for ${line.name}`}
                      placeholder="0"
                    />
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Days of cover. Starts at 0.</p>
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      className="h-9 w-28"
                      value={Number.isFinite(line.unitPrice) ? line.unitPrice : ""}
                      onChange={(event) => {
                        const raw = event.target.value
                        const unitPrice = raw === "" ? 0 : Number(raw)
                        if (!Number.isFinite(unitPrice) || unitPrice < 0) return
                        setCart((current) => {
                          const next = current.map((row, i) => (i === index ? { ...row, unitPrice } : row))
                          syncPaid(next)
                          return next
                        })
                      }}
                      aria-label={`Sell price for ${line.name}`}
                    />
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Initial {formatCurrency(line.listPrice)}
                      {isPieceLine ? " · each" : ""} · raise for walk-in; not under without CEO or Super Admin
                    </p>
                    <p className="mt-0.5 text-xs font-medium tabular-nums">
                      Line total {formatCurrency((Number.isFinite(line.unitPrice) ? line.unitPrice : 0) * line.quantity)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const next = cart.filter((_, i) => i !== index)
                        setCart(next)
                        syncPaid(next)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              )})}
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Scan or type in the box above. IMEI, serial, phone name, brand, category, pouch, or charger cord all work in the same place.
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
          {branches.length <= 1 ? (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium">
              {branches[0]?.name || "Your shop"}
            </p>
          ) : (
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
          )}
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
          <span className="mb-1 block text-muted-foreground">How they paid</span>
          <Select
            value={method}
            onChange={(event) => {
              const next = event.target.value as typeof method
              setMethod(next)
              if (next === "CREDIT") {
                setPaid(0)
              } else {
                setPaid(total)
              }
            }}
          >
            <option value="CASH">Cash</option>
            <option value="BANK">Bank</option>
            <option value="CREDIT">Credit sales</option>
          </Select>
        </label>
        {method === "CREDIT" ? (
          <p className="text-xs text-muted-foreground">
            Type any money received now. What is left is credit sales. If they paid nothing today, leave the amount at zero. Money today is either all cash or all bank into one named account.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Cash stays in the till. Bank means the full amount landed in one shop bank account (transfer, POS terminal, or USSD all count as Bank).
          </p>
        )}
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">
              {method === "CREDIT" ? "Amount received now" : "Amount paid"}
            </span>
            {method === "CREDIT" ? (
              <Input
                type="number"
                min={0}
                max={total || undefined}
                value={paid || ""}
                placeholder="0"
                onChange={(event) => {
                  const next = Math.max(0, Number(event.target.value) || 0)
                  setPaid(Math.min(next, total || next))
                }}
              />
            ) : (
              <Input
                type="number"
                readOnly
                tabIndex={-1}
                value={total || ""}
                className="bg-muted/40 font-semibold tabular-nums"
                aria-label="Amount paid equals the sale total for Cash or Bank"
              />
            )}
          </label>
          {method === "CREDIT" ? (
            <p className="text-xs text-muted-foreground">
              Cannot be more than the sale total ({formatCurrency(total)}). What is left is still owed.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Always matches the sale total when they pay Cash or Bank. Raise or lower a line price above and this figure updates with it.
            </p>
          )}
          {method === "CREDIT" && paid > 0 ? (
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">How they paid this amount</span>
              <Select
                value={creditTender}
                onChange={(event) => setCreditTender(event.target.value as "CASH" | "BANK")}
              >
                <option value="BANK">Bank</option>
                <option value="CASH">Cash</option>
              </Select>
            </label>
          ) : null}
          {wantsBank ? (
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Bank account that received it</span>
              {shopBanks.length ? (
                <Select value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)}>
                  {shopBanks.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.bankName} · {row.accountNumber}
                      {row.accountName ? ` · ${row.accountName}` : ""}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
                  No bank account is on the books for this shop yet. Add GTBank, Access, or OPay under Money in and out, then come back to Sell now.
                </p>
              )}
            </label>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={wholesale} onChange={(event) => setWholesale(event.target.checked)} />
          Wholesale / dealer sale
        </label>
        <Input placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        <div className="rounded-lg bg-muted p-4">
          <p className="text-sm text-muted-foreground">Sale total</p>
          <p className="text-3xl font-semibold tabular-nums">{formatCurrency(total)}</p>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            Amount paid {formatCurrency(effectivePaid)}
            {due > 0 ? ` · still owed ${formatCurrency(due)}` : " · paid in full"}
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
