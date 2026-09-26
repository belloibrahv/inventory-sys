"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createCustomer } from "@/app/actions/parties"
import { createBankAccount } from "@/app/actions/finance"
import { approveTillPrice, checkoutSale, findInStockImei, searchTillStock } from "@/app/actions/sales"
import { TillLookup } from "@/components/till-lookup"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select } from "@/components/ui/select"
import { pushSaleQueue } from "@/lib/offline-sales"
import { requestParkedFlush } from "@/lib/flush-parked"
import { applyParkedToTillSnapshot, readTillSnapshot, saveTillSnapshot, type TillBankAccount, type TillBranch, type TillCustomer, type TillImei, type TillProduct, type TillSnapshot } from "@/lib/till-catalog"
import { formatCurrency, money } from "@/lib/utils"
import { belowCost, lineMargin, needsReason, openingPrice, resellerPrice, sellFloor } from "@/lib/pricing"
import { formatCondition } from "@/lib/status"
import { phoneLookLabel, isBlockedFromSell } from "@/lib/phone-look"
import { Trash2, RotateCcw, PlusCircle } from "lucide-react"
import { useDecision } from "@/hooks/use-decision"

function lookLabel(item: TillImei) {
  return phoneLookLabel(item.cosmeticGrade) || formatCondition(item.product.condition)
}

/**
 * Everything about what a line may be charged comes from one place, shared with
 * the shop system, so the till never promises a price the sale then refuses.
 */
type PriceSource = {
  sellingPrice: number
  minimumPrice: number
  costPrice: number
  resellerMarkup: number
}

function priceBasis(source: PriceSource) {
  return {
    costPrice: money(source.costPrice),
    minimumPrice: money(source.minimumPrice),
    sellingPrice: money(source.sellingPrice),
    resellerMarkup: money(source.resellerMarkup),
  }
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
  canSeeCost: serverCanSeeCost,
}: {
  products: TillProduct[]
  customers: TillCustomer[]
  imeis: TillImei[]
  branches: TillBranch[]
  bankAccounts?: TillBankAccount[]
  defaultBranchId?: string | null
  canOverrideFloor?: boolean
  canSeeCost?: boolean
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
  const canSeeCost = deviceList ? Boolean(deviceList.canSeeCost) : Boolean(serverCanSeeCost)
  const [query, setQuery] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [branchId, setBranchId] = useState(defaultBranchId || serverBranches[0]?.id || "")
  const [method, setMethod] = useState<"CASH" | "BANK" | "SPLIT" | "CREDIT">("CASH")
  // Money taken now, split between the till and the bank. Both a Split sale and
  // a Credit sale use these: the difference is whether anything is left owing.
  const [payCash, setPayCash] = useState(0)
  const [payBank, setPayBank] = useState(0)
  const [bankAccountId, setBankAccountId] = useState("")
  const [paid, setPaid] = useState(0)
  const [notes, setNotes] = useState("")
  const [wholesale, setWholesale] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [newBankName, setNewBankName] = useState("")
  const [newBankNumber, setNewBankNumber] = useState("")
  const [savingBank, setSavingBank] = useState(false)
  const [cart, setCart] = useState<
    Array<{
      productId: string
      imeiId?: string
      name: string
      imei?: string
      unitPrice: number
      /** The standard price, for showing what a discount actually gave away. */
      listPrice: number
      /** The lowest staff may charge. Under it needs the CEO and a reason. */
      minPrice: number
      /** What this unit cost us, so margin can be shown as the price is typed. */
      costPrice: number
      resellerMarkup: number
      sellingPrice: number
      minimumPrice: number
      /** Why this line left the standard price. Only asked for under the floor. */
      priceReason?: string
      quantity: number
      onHand?: number
      warrantyDays?: number
      storage?: string | null
      condition?: string | null
      color?: string | null
      category?: string | null
    }>
  >([])
  const [orderDiscount, setOrderDiscount] = useState(0)
  const [discountReason, setDiscountReason] = useState("")
  const [busy, setBusy] = useState(false)
  // The CEO or Super Admin's sign-off for a price this seller may not give
  // alone. It belongs to the deal it was given for: change a price, a quantity
  // or the discount and it no longer applies.
  const [approval, setApproval] = useState<{ token: string; name: string; key: string } | null>(null)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [approverEmail, setApproverEmail] = useState("")
  const [approverPassword, setApproverPassword] = useState("")
  const [approving, setApproving] = useState(false)
  const [remoteImeis, setRemoteImeis] = useState<TillImei[]>([])
  const [remoteAccessories, setRemoteAccessories] = useState<TillProduct[]>([])
  const [searchingRemote, setSearchingRemote] = useState(false)
  const { confirm } = useDecision()

  function resetSale() {
    setCart([])
    setPaid(0)
    setPayCash(0)
    setPayBank(0)
    setCustomerId("")
    setNotes("")
    setWholesale(false)
    setOrderDiscount(0)
    setDiscountReason("")
    setQuery("")
    setApproval(null)
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
      canSeeCost: serverCanSeeCost,
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
  }, [serverProducts, serverCustomers, serverImeis, serverBranches, serverBankAccounts, defaultBranchId, serverCanOverrideFloor, serverCanSeeCost])

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

  const grossTotal = useMemo(
    () =>
      cart.reduce((sum, line) => {
        const price = Number.isFinite(line.unitPrice) ? line.unitPrice : 0
        const qty = Number.isFinite(line.quantity) ? line.quantity : 0
        return sum + price * qty
      }, 0),
    [cart]
  )
  // The lowest this basket may go for, and what it cost us. Both are checked
  // again by the shop system; these are here so the cashier sees it while typing.
  const floorTotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.minPrice * (line.quantity || 1), 0),
    [cart]
  )
  const costTotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.costPrice * (line.quantity || 1), 0),
    [cart]
  )
  const maxDiscount = Math.max(0, grossTotal)
  const appliedDiscount = Math.min(Math.max(0, orderDiscount), maxDiscount)
  const total = Math.max(0, grossTotal - appliedDiscount)
  const discountGuard = Math.max(floorTotal, costTotal)
  const discountBreaksFloor = appliedDiscount > 0 && total < discountGuard
  const deal = useMemo(
    () => ({
      wholesale,
      orderDiscount: appliedDiscount,
      items: cart.map((line) => ({
        productId: line.productId,
        imeiId: line.imeiId,
        quantity: line.quantity,
        unitPrice: Number.isFinite(line.unitPrice) ? line.unitPrice : 0,
      })),
    }),
    [cart, wholesale, appliedDiscount]
  )
  const dealKey = useMemo(() => JSON.stringify(deal), [deal])
  const activeApproval = approval && approval.key === dealKey ? approval : null
  /** May this sale go under the floor or under cost, with a reason? */
  const mayGoUnder = canOverrideFloor || Boolean(activeApproval)
  const marginTotal = total - costTotal
  const customer = customers.find((row) => row.id === customerId)
  const shopBanks = useMemo(
    () => bankAccounts.filter((row) => row.branchId === branchId),
    [bankAccounts, branchId]
  )
  // Cash and Bank always pay the full sale total. Credit sales keep cash and/or bank
  // received now. That stops Amount paid from lagging behind a raised price.
  /** Cash and bank typed in by hand, for a Split or a Credit sale. */
  const handReceived = Math.max(0, payCash) + Math.max(0, payBank)
  const splitsTyped = method === "SPLIT" || method === "CREDIT"
  const effectivePaid = splitsTyped ? Math.min(handReceived, total) : total
  /** A Split sale is paid in full, so the two boxes have to reach the total. */
  const splitShortfall = method === "SPLIT" ? Math.max(0, total - handReceived) : 0
  const due = Math.max(0, total - effectivePaid)
  const nextDebt = (customer?.currentBalance ?? 0) + due
  const wantsBank =
    method === "BANK" || (splitsTyped && Math.max(0, payBank) > 0)

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
    if (!splitsTyped) setPaid(total)
  }, [method, total, splitsTyped])

  // A price edited after the split was typed would leave the two boxes short or
  // over. The bank side absorbs the change, since the cash side is what someone
  // physically counted out.
  useEffect(() => {
    if (method !== "SPLIT") return
    const cash = Math.min(payCash, total)
    const bank = Math.max(0, total - cash)
    if (cash !== payCash) setPayCash(cash)
    if (bank !== payBank) setPayBank(bank)
  }, [method, total])

  // Ticking Reseller re-quotes the basket off cost, and unticking puts the
  // standard prices back. A price typed by hand is replaced too — the tick is a
  // deliberate act, so the cashier is told what happened rather than left with a
  // mix of retail and reseller lines on one invoice.
  const resellerRef = useRef(wholesale)
  useEffect(() => {
    if (resellerRef.current === wholesale) return
    resellerRef.current = wholesale
    setCart((current) => {
      if (current.length === 0) return current
      let requoted = 0
      const next = current.map((line) => {
        const basis = priceBasis(line)
        const opening = openingPrice(basis, { reseller: wholesale })
        const floor = sellFloor(basis, { reseller: wholesale })
        if (opening !== line.unitPrice) requoted += 1
        return { ...line, unitPrice: opening, minPrice: floor, priceReason: "" }
      })
      if (requoted > 0) {
        toast.message(
          wholesale
            ? `${requoted} line${requoted === 1 ? "" : "s"} re-quoted at the reseller price.`
            : `${requoted} line${requoted === 1 ? "" : "s"} back at the standard price.`
        )
      }
      syncPaid(next)
      return next
    })
  }, [wholesale])

  // Keep cash + bank from exceeding the sale total while staff type.
  useEffect(() => {
    if (!splitsTyped || !(total > 0)) return
    if (payCash + payBank <= total) return
    const overflow = payCash + payBank - total
    if (payBank >= overflow) setPayBank(Math.max(0, payBank - overflow))
    else {
      const rest = overflow - payBank
      setPayBank(0)
      setPayCash(Math.max(0, payCash - rest))
    }
  }, [method, total, payCash, payBank])

  function setPaidTo(nextTotal: number) {
    if (!splitsTyped) setPaid(nextTotal)
  }

  /**
   * Add a shop bank account without leaving the till. Bank money has to land in
   * a named account, and a cashier who finds the list empty mid-sale used to be
   * sent to another screen and told to come back. Who may do this is unchanged:
   * the shop system refuses anyone the money screens would refuse.
   */
  async function saveBankAccount() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("You can only add a bank account when the network is good.")
      return
    }
    if (!newBankName.trim() || !newBankNumber.trim()) {
      toast.error("Type the bank name and the account number.")
      return
    }
    setSavingBank(true)
    const formData = new FormData()
    formData.set("branchId", branchId)
    formData.set("bankName", newBankName.trim())
    formData.set("accountNumber", newBankNumber.trim())
    // The money screens own opening balances. A bank added here starts at zero
    // and is topped up there, so the till cannot quietly declare money.
    formData.set("openingBalance", "0")
    const result = await createBankAccount(formData)
    setSavingBank(false)
    if ("error" in result && result.error) {
      toast.error(result.error)
      return
    }
    toast.success("Bank account saved for this shop.")
    if ("id" in result && result.id) setBankAccountId(result.id)
    setNewBankName("")
    setNewBankNumber("")
    router.refresh()
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
    const basis = priceBasis(item.product)
    const opening = openingPrice(basis, { reseller: wholesale })
    setCart((current) => {
      const next = [
        ...current,
        {
          productId: item.productId,
          imeiId: item.id,
          name: item.product.name,
          imei: item.imei1,
          unitPrice: opening,
          listPrice: money(item.product.sellingPrice),
          minPrice: sellFloor(basis, { reseller: wholesale }),
          costPrice: basis.costPrice,
          resellerMarkup: basis.resellerMarkup,
          sellingPrice: basis.sellingPrice,
          minimumPrice: basis.minimumPrice,
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

  function syncPaid(nextCart: typeof cart, discount = appliedDiscount) {
    const gross = nextCart.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0)
    setPaidTo(Math.max(0, gross - Math.min(Math.max(0, discount), Math.max(0, gross))))
  }

  function setLineQuantity(index: number, raw: number) {
    setCart((current) => {
      const next = current.map((row, i) => {
        if (i !== index) return row
        if (row.imeiId) return { ...row, quantity: 1 }
        // Any whole number from 1 up. Stock on hand is checked when the sale is completed.
        const quantity = Math.max(1, Math.floor(Number.isFinite(raw) ? raw : 1) || 1)
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
    const basis = priceBasis(product)
    const opening = openingPrice(basis, { reseller: wholesale })
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
            unitPrice: opening,
            listPrice: money(product.sellingPrice),
            minPrice: sellFloor(basis, { reseller: wholesale }),
            costPrice: basis.costPrice,
            resellerMarkup: basis.resellerMarkup,
            sellingPrice: basis.sellingPrice,
            minimumPrice: basis.minimumPrice,
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
    if (method === "SPLIT" && splitShortfall > 0) {
      toast.error(
        `Cash and bank together come to ${formatCurrency(handReceived)}, ${formatCurrency(splitShortfall)} short of ${formatCurrency(total)}. Add the rest, or use Credit sales if they are not paying it all today.`
      )
      return
    }
    if (method === "SPLIT" && handReceived > 0 && (payCash <= 0 || payBank <= 0)) {
      toast.error("A split needs money in both boxes. Use Cash or Bank on its own otherwise.")
      return
    }
    if (wantsBank && !bankAccountId) {
      toast.error("Pick which bank account received this money. Add banks under Money in and out if the list is empty.")
      return
    }
    const underFloor = cart.filter((line) => line.unitPrice < line.minPrice)
    const underCost = cart.filter((line) => belowCost(line.unitPrice, line.costPrice))
    const missingReason = cart.find(
      (line) =>
        needsReason({ unitPrice: line.unitPrice, floor: line.minPrice, costPrice: line.costPrice }) &&
        !String(line.priceReason || "").trim()
    )
    if (missingReason) {
      toast.error(`Say why ${missingReason.name} is going below the lowest allowed price.`)
      return
    }
    if (discountBreaksFloor && !discountReason.trim()) {
      toast.error("Say why this order is going below what the stock may be sold for.")
      return
    }
    // Any price is allowed, but going under the floor or under cost needs the
    // CEO or Super Admin. When the seller cannot do it alone, the CEO approves
    // this deal on this till with their own password.
    if ((underFloor.length > 0 || underCost.length > 0 || discountBreaksFloor) && !mayGoUnder) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        toast.error("The CEO's approval needs the network. Wait for it to come back, or raise the price.")
        return
      }
      setApproverPassword("")
      setApprovalOpen(true)
      return
    }
    // A price below cost is the one the shop feels straight away, so it is
    // confirmed out loud even when the person is allowed to do it.
    if (underCost.length > 0) {
      const ok = await confirm({
        title: "This sale loses money",
        description: `${underCost.length} line${underCost.length === 1 ? "" : "s"} on this sale go for less than we paid.`,
        tone: "danger",
        confirmLabel: "Yes, sell at a loss",
        cancelLabel: "Go back and change the price",
        impactItems: underCost.map(
          (line) =>
            `${line.name}: ${formatCurrency(line.unitPrice)} against ${formatCurrency(line.costPrice)} cost`
        ),
      })
      if (!ok) return
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
      method === "CASH" ? "CASH" : "TRANSFER"

    // Both a Split and a Credit sale can take cash and bank together, so the
    // tenders are built the same way. They differ in what the sale is called:
    // Credit stays Credit while anything is owed, Split is paid in full.
    const tenders: Array<{ method: "CASH" | "TRANSFER"; amount: number }> = []
    if (splitsTyped) {
      if (payCash > 0) tenders.push({ method: "CASH", amount: Math.max(0, payCash) })
      if (payBank > 0) tenders.push({ method: "TRANSFER", amount: Math.max(0, payBank) })
    }

    const checkoutMethod: "CASH" | "TRANSFER" | "CREDIT" | "SPLIT_PAYMENT" =
      method === "CREDIT"
        ? "CREDIT"
        : method === "SPLIT"
          ? tenders.length > 1
            ? "SPLIT_PAYMENT"
            : // One box left empty is not a split, it is that one channel.
              tenders[0]?.method ?? "CASH"
          : depositChannel

    const payload = {
      customerId: customerId || undefined,
      branchId,
      paymentMethod: checkoutMethod,
      paidAmount: effectivePaid,
      depositMethod:
        method === "CREDIT" && tenders.length === 1 ? tenders[0].method : undefined,
      splitTenders: tenders.length > 1 ? tenders : undefined,
      bankAccountId: wantsBank ? bankAccountId : undefined,
      notes,
      wholesale,
      orderDiscount: appliedDiscount,
      discountReason: discountReason.trim() || undefined,
      priceApproval: activeApproval?.token,
      items: cart.map((line) => ({
        productId: line.productId,
        imeiId: line.imeiId,
        quantity: line.quantity,
        unitPrice: Number.isFinite(line.unitPrice) ? line.unitPrice : 0,
        warrantyDays: line.warrantyDays ?? 0,
        priceReason: String(line.priceReason || "").trim() || undefined,
      })),
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
                const margin = lineMargin(line.unitPrice, line.costPrice, line.quantity)
                const isUnderCost = belowCost(line.unitPrice, line.costPrice)
                const quote = resellerPrice(priceBasis(line))
                const wantsReason = needsReason({
                  unitPrice: line.unitPrice,
                  floor: line.minPrice,
                  costPrice: line.costPrice,
                })
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
                    {line.unitPrice < line.minPrice ? (
                      <p className="text-xs text-danger">
                        Below the lowest allowed price {formatCurrency(line.minPrice)}
                        {canOverrideFloor
                          ? " · you may still sell at this price, with a reason"
                          : activeApproval
                            ? ` · approved by ${activeApproval.name}`
                            : " · the CEO or Super Admin approves it on this till when you tap Complete sale"}
                      </p>
                    ) : null}
                    {isUnderCost ? (
                      <p className="text-xs text-danger">
                        Under what we paid. The shop loses {formatCurrency(Math.abs(margin.amount))} on this line.
                      </p>
                    ) : null}
                    {line.unitPrice < line.listPrice && line.unitPrice >= line.minPrice ? (
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(line.listPrice - line.unitPrice)} off the standard{" "}
                        {formatCurrency(line.listPrice)}
                        {wholesale && quote > 0 ? " · reseller price" : ""}
                      </p>
                    ) : null}
                    {line.unitPrice > line.listPrice ? (
                      <p className="text-xs text-muted-foreground">
                        Raised above the standard {formatCurrency(line.listPrice)} for this buyer.
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
                          step={1}
                          className="h-9 w-24"
                          value={String(line.quantity)}
                          onChange={(event) => setLineQuantity(index, Number(event.target.value))}
                          aria-label={`Pieces of ${line.name}`}
                        />
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Type any amount from 1 up
                          {onHand > 0 ? ` · ${onHand} on hand in this shop` : ""}
                        </p>
                        {onHand > 0 && line.quantity > onHand ? (
                          <p className="mt-0.5 text-[10px] text-danger">
                            More than on hand. Complete sale will ask you to lower Pieces, or fix shop stock first.
                          </p>
                        ) : null}
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
                      Standard {formatCurrency(line.listPrice)}
                      {isPieceLine ? " · each" : ""} · lowest {formatCurrency(line.minPrice)}
                      {quote > 0 ? ` · reseller ${formatCurrency(quote)}` : ""}
                    </p>
                    {canSeeCost && margin.hasCost ? (
                      <p
                        className={`mt-0.5 text-[10px] tabular-nums ${
                          isUnderCost ? "font-medium text-danger" : "text-muted-foreground"
                        }`}
                      >
                        Cost {formatCurrency(line.costPrice)} · we keep{" "}
                        {formatCurrency(margin.amount)} ({margin.percent}%)
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-xs font-medium tabular-nums">
                      Line total {formatCurrency((Number.isFinite(line.unitPrice) ? line.unitPrice : 0) * line.quantity)}
                    </p>
                    {wantsReason ? (
                      <div className="mt-1">
                        <Input
                          className="h-8 w-full text-xs"
                          value={line.priceReason ?? ""}
                          onChange={(event) => {
                            const priceReason = event.target.value
                            setCart((current) =>
                              current.map((row, i) => (i === index ? { ...row, priceReason } : row))
                            )
                          }}
                          placeholder="Why this price?"
                          aria-label={`Reason for the price on ${line.name}`}
                        />
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Kept on the invoice and on the Price changes report.
                        </p>
                      </div>
                    ) : null}
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
                setPayCash(0)
                setPayBank(0)
              } else if (next === "SPLIT") {
                // Start the split at the whole sale in cash, so the cashier
                // moves one figure across rather than typing both.
                setPayCash(total)
                setPayBank(0)
                setPaid(total)
              } else {
                setPayCash(0)
                setPayBank(0)
                setPaid(total)
              }
            }}
          >
            <option value="CASH">Cash</option>
            <option value="BANK">Bank</option>
            <option value="SPLIT">Split — part cash, part bank</option>
            <option value="CREDIT">Credit sales</option>
          </Select>
        </label>
        {method === "CREDIT" ? (
          <p className="text-xs text-muted-foreground">
            Type money received now in cash, bank, or both. What is left is still Credit sales. The bill stays under Sales as Credit sales until it is paid in full. Check the books counts cash and bank separately.
          </p>
        ) : method === "SPLIT" ? (
          <p className="text-xs text-muted-foreground">
            The buyer settles the whole bill with two kinds of money — some in the till, the rest into
            a shop bank account. Both boxes together must reach {formatCurrency(total)}. If they are
            not paying it all today, use Credit sales instead.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Cash stays in the till. Bank means the full amount landed in one shop bank account (transfer, POS terminal, or USSD all count as Bank).
          </p>
        )}
        <div className="space-y-3">
          {splitsTyped ? (
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">
                  {method === "SPLIT" ? "Cash part" : "Cash received now"}
                </span>
                <Input
                  type="number"
                  min={0}
                  max={total || undefined}
                  value={payCash || ""}
                  placeholder="0"
                  onChange={(event) => {
                    const next = Math.max(0, Number(event.target.value) || 0)
                    if (method === "SPLIT") {
                      // The bill is settled in full, so whatever is not cash is
                      // bank. Moving one box moves the other.
                      const cash = Math.min(next, total)
                      setPayCash(cash)
                      setPayBank(Math.max(0, total - cash))
                      return
                    }
                    setPayCash(Math.min(next, Math.max(0, total - payBank)))
                  }}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">
                  {method === "SPLIT" ? "Bank part" : "Bank received now"}
                </span>
                <Input
                  type="number"
                  min={0}
                  max={total || undefined}
                  value={payBank || ""}
                  placeholder="0"
                  onChange={(event) => {
                    const next = Math.max(0, Number(event.target.value) || 0)
                    if (method === "SPLIT") {
                      const bank = Math.min(next, total)
                      setPayBank(bank)
                      setPayCash(Math.max(0, total - bank))
                      return
                    }
                    setPayBank(Math.min(next, Math.max(0, total - payCash)))
                  }}
                />
              </label>
              {method === "SPLIT" ? (
                <p
                  className={`text-xs ${splitShortfall > 0 ? "font-medium text-warning" : "text-success"}`}
                >
                  {splitShortfall > 0
                    ? `${formatCurrency(handReceived)} of ${formatCurrency(total)} — ${formatCurrency(splitShortfall)} still to place in a box.`
                    : `${formatCurrency(payCash)} cash + ${formatCurrency(payBank)} bank = ${formatCurrency(total)}. Paid in full.`}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Together cannot be more than the sale total ({formatCurrency(total)}). Received now{" "}
                  {formatCurrency(effectivePaid)}
                  {due > 0 ? ` · still owed ${formatCurrency(due)}` : " · paid in full today"}.
                </p>
              )}
            </>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">Amount paid</span>
              <Input
                type="number"
                readOnly
                tabIndex={-1}
                value={total || ""}
                className="bg-muted/40 font-semibold tabular-nums"
                aria-label="Amount paid equals the sale total for Cash or Bank"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Always matches the sale total when they pay Cash or Bank. Raise or lower a line price above and this figure updates with it.
              </p>
            </label>
          )}
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
                <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <p className="text-xs text-foreground">
                    No bank account is on the books for this shop yet. Add the one the money landed
                    in — GTBank, Access, OPay, Moniepoint — and it will be here for every sale after
                    this.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={newBankName}
                      onChange={(event) => setNewBankName(event.target.value)}
                      placeholder="Bank name"
                      aria-label="Bank name"
                    />
                    <Input
                      value={newBankNumber}
                      onChange={(event) => setNewBankNumber(event.target.value)}
                      placeholder="Account number"
                      aria-label="Bank account number"
                      inputMode="numeric"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={savingBank}
                    onClick={saveBankAccount}
                  >
                    {savingBank ? "Saving this bank account" : "Save bank account for this shop"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    It starts at zero. Set what is already in the account under Money in and out.
                  </p>
                </div>
              )}
            </label>
          ) : null}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={wholesale}
            onChange={(event) => setWholesale(event.target.checked)}
          />
          <span>
            Reseller / dealer sale
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Quotes every line off cost using the category markup. Tick it before you price the sale.
            </span>
          </span>
        </label>

        <div className="space-y-2 rounded-lg border border-border p-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Discount on the whole order</span>
            <Input
              type="number"
              min={0}
              step={1}
              value={orderDiscount ? String(orderDiscount) : ""}
              onChange={(event) => {
                const raw = Number(event.target.value)
                const next = Number.isFinite(raw) && raw > 0 ? Math.min(raw, maxDiscount) : 0
                setOrderDiscount(next)
                syncPaid(cart, next)
              }}
              placeholder="0"
              aria-label="Discount on the whole order"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[2.5, 5, 10].map((percent) => (
              <button
                key={percent}
                type="button"
                className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                onClick={() => {
                  const next = Math.round((grossTotal * percent) / 100)
                  setOrderDiscount(next)
                  syncPaid(cart, next)
                }}
                disabled={!(grossTotal > 0)}
              >
                {percent}%
              </button>
            ))}
            {appliedDiscount > 0 ? (
              <button
                type="button"
                className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                onClick={() => {
                  setOrderDiscount(0)
                  setDiscountReason("")
                  syncPaid(cart, 0)
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
          {discountBreaksFloor ? (
            <>
              <p className="text-xs text-danger">
                This takes the sale under the {formatCurrency(discountGuard)} this stock may go for.
                {mayGoUnder
                  ? " Say why below."
                  : " Say why below. The CEO or Super Admin approves it when you tap Complete sale."}
              </p>
              <Input
                className="h-9 text-xs"
                value={discountReason}
                onChange={(event) => setDiscountReason(event.target.value)}
                placeholder="Why this discount?"
                aria-label="Reason for this discount"
              />
            </>
          ) : appliedDiscount > 0 ? (
            <p className="text-xs text-muted-foreground">
              {formatCurrency(appliedDiscount)} off. Amount received follows this.
            </p>
          ) : null}
        </div>

        <Input placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        <div className="rounded-lg bg-muted p-4">
          <p className="text-sm text-muted-foreground">Sale total</p>
          <p className="text-3xl font-semibold tabular-nums">{formatCurrency(total)}</p>
          {appliedDiscount > 0 ? (
            <p className="mt-1 text-sm tabular-nums text-muted-foreground">
              {formatCurrency(grossTotal)} less {formatCurrency(appliedDiscount)} discount
            </p>
          ) : null}
          {canSeeCost && costTotal > 0 ? (
            <p
              className={`mt-1 text-sm tabular-nums ${
                marginTotal < 0 ? "font-medium text-danger" : "text-muted-foreground"
              }`}
            >
              {marginTotal < 0 ? "Loss on this sale " : "We keep "}
              {formatCurrency(Math.abs(marginTotal))}
              {total > 0 ? ` (${Math.round((marginTotal / total) * 1000) / 10}%)` : ""}
            </p>
          ) : null}
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            Amount paid {formatCurrency(effectivePaid)}
            {due > 0 ? ` · still owed ${formatCurrency(due)}` : " · paid in full"}
          </p>
          {customer && (method === "CREDIT" || due > 0) ? (
            <p className="mt-1 text-xs text-muted-foreground">After this sale they would owe {formatCurrency(nextDebt)}</p>
          ) : null}
        </div>
        {activeApproval ? (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
            Price approved by {activeApproval.name}. Change a price and it will need approving again.
          </p>
        ) : null}
        <Button className="min-h-12 w-full" disabled={!cart.length || busy} onClick={checkout}>
          {busy ? "Saving this sale" : "Complete sale"}
        </Button>
        <p className="text-xs text-muted-foreground">
          USB scanners work like a keyboard. Print the invoice after the sale. If a receipt printer is attached, printing can open the cash drawer.
        </p>
      </div>

      <Dialog open={approvalOpen} onOpenChange={(open) => !approving && setApprovalOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="pr-8">
            <DialogTitle>CEO approval for this price</DialogTitle>
            <DialogDescription>
              This sale goes under the lowest allowed price or under what we paid. The CEO or Super
              Admin types their own email and password to approve it. Their name is kept on the
              invoice and on Price changes.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 rounded-lg bg-muted p-3 text-xs">
            {cart
              .filter((line) => line.unitPrice < line.minPrice || belowCost(line.unitPrice, line.costPrice))
              .map((line, index) => (
                <li key={`${line.imeiId ?? line.productId}-${index}`}>
                  {line.name}: {formatCurrency(line.unitPrice)}
                  {line.listPrice > 0 ? ` (standard ${formatCurrency(line.listPrice)})` : ""}
                  {belowCost(line.unitPrice, line.costPrice) ? " · under cost" : ""}
                </li>
              ))}
            {discountBreaksFloor ? (
              <li>Order discount {formatCurrency(appliedDiscount)}, sale total {formatCurrency(total)}</li>
            ) : null}
          </ul>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault()
              setApproving(true)
              try {
                const result = await approveTillPrice({
                  email: approverEmail,
                  password: approverPassword,
                  branchId,
                  deal,
                })
                if ("error" in result && result.error) {
                  toast.error(result.error)
                  return
                }
                if ("approval" in result && result.approval) {
                  setApproval({ token: result.approval, name: result.approverName, key: dealKey })
                  setApprovalOpen(false)
                  toast.success(`Approved by ${result.approverName}. Tap Complete sale to finish.`)
                }
              } catch {
                toast.error("The shop system did not answer. Check the network and try again.")
              } finally {
                setApproverPassword("")
                setApproving(false)
              }
            }}
          >
            <Input
              type="email"
              autoComplete="off"
              placeholder="CEO or Super Admin email"
              value={approverEmail}
              onChange={(event) => setApproverEmail(event.target.value)}
              aria-label="Approver email"
              required
            />
            <PasswordInput
              autoComplete="off"
              placeholder="Their password"
              value={approverPassword}
              onChange={(event) => setApproverPassword(event.target.value)}
              aria-label="Approver password"
              required
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" disabled={approving} onClick={() => setApprovalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={approving}>
                {approving ? "Checking" : "Approve this price"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
