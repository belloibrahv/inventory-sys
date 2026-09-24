"use client"

import { useState } from "react"
import { Select } from "@/components/ui/select"

type Shop = { id: string; name: string; code: string }

export function ShopScopeFields({ shops }: { shops: Shop[] }) {
  const [scope, setScope] = useState<"all" | "one">("all")

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Where this name should show</p>
      <Select
        name="shopScope"
        value={scope}
        onChange={(event) => setScope(event.target.value === "one" ? "one" : "all")}
      >
        <option value="all">All shops</option>
        <option value="one">One shop only</option>
      </Select>
      {scope === "one" ? (
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Which shop</span>
          <Select name="branchId" required emptyLabel="There is no open shop to pick">
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name} ({shop.code})
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      <p className="text-sm text-muted-foreground">
        All shops puts the name on every Abu Twins shop so staff can pick it when they add stock. One shop only puts the name on that shop first. You can still pick the same name later when you add stock at another shop.
      </p>
    </div>
  )
}
