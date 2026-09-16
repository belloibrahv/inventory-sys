"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * Type the product name, pick from the list, and only that name fills the item
 * column. Condition, brand, and storage stay on their own fields.
 */
export function ItemNameSearch({
  names,
  value,
  onPick,
  disabled,
}: {
  names: string[]
  value: string
  onPick: (name: string) => void
  disabled?: boolean
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const needle = query.trim().toLowerCase()
  const matches = useMemo(() => {
    const filtered = needle
      ? names.filter((name) => name.toLowerCase().includes(needle))
      : names
    return filtered.slice(0, 80)
  }, [names, needle])

  const exact = names.some((name) => name.toLowerCase() === needle)
  const canUseTyped = needle.length >= 2 && !exact

  function pick(name: string) {
    onPick(name)
    setQuery(name)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          disabled={disabled}
          autoComplete="off"
          placeholder="Type the name of the item, then pick it"
          className="pl-9"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            if (!event.target.value.trim()) onPick("")
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false)
              return
            }
            if (event.key === "Enter") {
              event.preventDefault()
              if (matches[0]) pick(matches[0])
              else if (canUseTyped) pick(query.trim())
            }
          }}
        />
      </div>

      {open && !disabled ? (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
          {canUseTyped ? (
            <button
              type="button"
              className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(query.trim())}
            >
              Use this name: <span className="font-medium text-foreground">{query.trim()}</span>
            </button>
          ) : null}
          {matches.length ? (
            matches.map((name) => (
              <button
                type="button"
                key={name}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent",
                  name === value && "bg-accent font-medium"
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(name)}
              >
                {name}
              </button>
            ))
          ) : canUseTyped ? null : (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {names.length
                ? "No item name matches that search. Type a name and pick Use this name."
                : "No item is on the list yet. Type the product name yourself."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
