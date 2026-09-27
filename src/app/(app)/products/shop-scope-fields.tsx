"use client"

import { useState } from "react"
import { FormField } from "@/components/form-field"
import { Select } from "@/components/ui/select"

type Shop = { id: string; name: string; code: string }

export function ShopScopeFields({ shops }: { shops: Shop[] }) {
  const [scope, setScope] = useState<"all" | "one">("all")

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        label="Where this name should show"
        hint="All shops lets every shop pick it when they add stock. One shop only puts it on that shop first; other shops can still pick it later."
      >
        <Select
          name="shopScope"
          value={scope}
          onChange={(event) => setScope(event.target.value === "one" ? "one" : "all")}
        >
          <option value="all">All shops</option>
          <option value="one">One shop only</option>
        </Select>
      </FormField>
      {scope === "one" ? (
        <FormField label="Which shop">
          <Select name="branchId" required emptyLabel="There is no open shop to pick">
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name} ({shop.code})
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}
    </div>
  )
}
