"use client"

import { useTransition } from "react"
import { Store } from "lucide-react"
import { setViewShop } from "@/app/actions/view-shop"

/**
 * Lets head office look at one shop on its own, or all three together.
 *
 * Only rendered for a role that may see every shop. Shop staff never see it,
 * and the server ignores the choice for them either way.
 */
export function ShopSwitch({
  branches,
  active,
}: {
  branches: Array<{ id: string; name: string; code: string }>
  active: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <label
      className="hidden items-center gap-1.5 rounded-lg border border-input bg-card pl-2.5 sm:inline-flex"
      title="Which shop are you looking at?"
    >
      <span className="sr-only">Which shop are you looking at?</span>
      <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <select
        value={active}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value
          startTransition(async () => {
            await setViewShop(next)
          })
        }}
        className="h-9 rounded-lg border-0 bg-transparent pl-0 pr-2 text-[13px] font-medium text-foreground focus-visible:outline-none disabled:opacity-60"
      >
        <option value="ALL">All shops together</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </label>
  )
}
