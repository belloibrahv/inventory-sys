"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createTransfer } from "@/app/actions/ops"
import { getShopImeiSheet } from "@/app/actions/sales"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

type Branch = { id: string; name: string; code?: string }
type Product = {
  id: string
  name: string
  sku: string
  serialized: boolean
  stock: Array<{ branchId: string; quantity: number }>
}

type PhonePick = { imei: string; name: string; sku: string }

export function TransferForm({
  branches,
  products = [],
  defaultFromId,
}: {
  branches: Branch[]
  products?: Product[]
  imeis?: unknown
  defaultFromId?: string | null
}) {
  const router = useRouter()
  const [fromId, setFromId] = useState(defaultFromId || branches[0]?.id || "")
  const [toId, setToId] = useState(() => branches.find((row) => row.id !== (defaultFromId || branches[0]?.id))?.id || "")
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [phones, setPhones] = useState<PhonePick[]>([])
  const [phonesBusy, setPhonesBusy] = useState(false)
  const [pickedImeis, setPickedImeis] = useState<Record<string, boolean>>({})
  const [accessoryQty, setAccessoryQty] = useState<Record<string, string>>({})
  const [phoneQuery, setPhoneQuery] = useState("")

  const fromShop = branches.find((row) => row.id === fromId)
  const toOptions = branches.filter((row) => row.id !== fromId)

  const accessories = useMemo(
    () =>
      products
        .filter((product) => !product.serialized)
        .map((product) => ({
          ...product,
          onShelf: product.stock.find((row) => row.branchId === fromId)?.quantity ?? 0,
        }))
        .filter((product) => product.onShelf > 0),
    [products, fromId]
  )

  const visiblePhones = useMemo(() => {
    const q = phoneQuery.trim().toLowerCase()
    if (!q) return phones.slice(0, 80)
    return phones
      .filter(
        (row) =>
          row.imei.toLowerCase().includes(q) ||
          row.name.toLowerCase().includes(q) ||
          row.sku.toLowerCase().includes(q)
      )
      .slice(0, 80)
  }, [phones, phoneQuery])

  const pickedCount = Object.values(pickedImeis).filter(Boolean).length
  const accessoryCount = Object.entries(accessoryQty).reduce((sum, [, value]) => sum + (Number(value) || 0), 0)

  useEffect(() => {
    let cancelled = false
    setPhonesBusy(true)
    setPickedImeis({})
    setAccessoryQty({})
    void getShopImeiSheet(fromId).then((result) => {
      if (cancelled) return
      const header = result.rows[0] ?? []
      const imeiIdx = header.findIndex((col) => /imei/i.test(col))
      const nameIdx = header.findIndex((col) => /name/i.test(col))
      const skuIdx = header.findIndex((col) => /item_code|sku/i.test(col))
      const next: PhonePick[] = []
      for (const row of result.rows.slice(1)) {
        const imei = String(row[imeiIdx >= 0 ? imeiIdx : 0] || "").trim()
        if (!imei) continue
        next.push({
          imei,
          name: String(row[nameIdx >= 0 ? nameIdx : 3] || "").trim() || "Phone",
          sku: String(row[skuIdx >= 0 ? skuIdx : 2] || "").trim(),
        })
      }
      setPhones(next)
      setPhonesBusy(false)
    })
    return () => {
      cancelled = true
    }
  }, [fromId])

  useEffect(() => {
    if (!toOptions.some((row) => row.id === toId)) {
      setToId(toOptions[0]?.id || "")
    }
  }, [fromId, toId, toOptions])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const imeis = Object.entries(pickedImeis)
      .filter(([, on]) => on)
      .map(([imei]) => imei)
    const accessoryLines = Object.entries(accessoryQty)
      .map(([productId, quantity]) => ({ productId, quantity: Number(quantity) || 0 }))
      .filter((row) => row.quantity > 0)
    data.set("selectedImeis", imeis.join("\n"))
    data.set("accessoryLines", JSON.stringify(accessoryLines))
    setBusy(true)
    setErrors([])
    const outcome = await createTransfer(data)
    setBusy(false)
    if (outcome.error) {
      toast.error(outcome.error)
      setErrors(outcome.errors ?? [outcome.error])
      return
    }
    toast.success("Transfer submitted. Stock stays In shop until the other shop accepts.")
    setPickedImeis({})
    setAccessoryQty({})
    form.reset()
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">From (Branch)</label>
        <Select
          name="fromBranchId"
          value={fromId}
          onChange={(event) => setFromId(event.target.value)}
          required
        >
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">To (Pick the branch)</label>
        <Select name="toBranchId" value={toId} onChange={(event) => setToId(event.target.value)} required>
          {toOptions.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </Select>
      </div>

      <div className="space-y-3 rounded-xl border border-border p-3">
        <div>
          <p className="text-sm font-semibold">Select the items</p>
          <p className="text-xs text-muted-foreground">
            Tick phones In shop at {fromShop?.name ?? "the sending shop"}, or type piece counts for cords and other no-number items.
          </p>
        </div>

        <Input
          value={phoneQuery}
          onChange={(event) => setPhoneQuery(event.target.value)}
          placeholder="Find IMEI, item code, or name"
        />

        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2">
          {phonesBusy ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">Loading phones In shop at this branch</p>
          ) : visiblePhones.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">No phones In shop match this search at the sending branch.</p>
          ) : (
            visiblePhones.map((phone) => (
              <label key={phone.imei} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-card">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={Boolean(pickedImeis[phone.imei])}
                  onChange={(event) =>
                    setPickedImeis((current) => ({ ...current, [phone.imei]: event.target.checked }))
                  }
                />
                <span className="min-w-0 text-sm">
                  <span className="font-mono text-xs">{phone.imei}</span>
                  <span className="block text-muted-foreground">{phone.name}{phone.sku ? ` · ${phone.sku}` : ""}</span>
                </span>
              </label>
            ))
          )}
        </div>

        {accessories.length ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">No-number items</p>
            {accessories.map((product) => (
              <div key={product.id} className="grid grid-cols-[1fr_88px] items-center gap-2">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.onShelf} In shop · {product.sku}</p>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={product.onShelf}
                  step={1}
                  value={accessoryQty[product.id] ?? ""}
                  onChange={(event) =>
                    setAccessoryQty((current) => ({ ...current, [product.id]: event.target.value }))
                  }
                  placeholder="0"
                  aria-label={`Pieces of ${product.name}`}
                />
              </div>
            ))}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Selected now: {pickedCount} phone{pickedCount === 1 ? "" : "s"}
          {accessoryCount ? ` · ${accessoryCount} piece${accessoryCount === 1 ? "" : "s"}` : ""}.
        </p>
      </div>

      <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        After you submit, wait for the receiving branch to accept or reject. Stock stays on the sending branch In shop record until they accept.
      </div>

      <Button type="submit" disabled={busy || (!pickedCount && !accessoryCount)}>
        {busy ? "Submitting this transfer" : "Submit the transfer"}
      </Button>

      {errors.length ? (
        <ul className="list-disc pl-5 text-sm text-warning">
          {errors.slice(0, 12).map((error) => (
            <li key={error}>{error}</li>
          ))}
          {errors.length > 12 ? <li>And {errors.length - 12} more lines to fix.</li> : null}
        </ul>
      ) : null}
    </form>
  )
}
