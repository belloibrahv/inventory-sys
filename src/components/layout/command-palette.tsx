"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useUI } from "@/store/ui"
import { globalSearch } from "@/app/actions/search"
import { navGroups } from "@/components/layout/nav"

type Result = {
  kind: string
  id: string
  title: string
  href: string
  hint?: string
}

export function CommandPalette({ allowedHrefs = [] }: { allowedHrefs?: string[] }) {
  const router = useRouter()
  const open = useUI((state) => state.commandOpen)
  const setOpen = useUI((state) => state.setCommandOpen)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Result[]>([])
  const [pending, start] = useTransition()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, setOpen])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const handle = setTimeout(() => {
      start(async () => {
        const found = await globalSearch(query)
        setResults(found)
      })
    }, 180)
    return () => clearTimeout(handle)
  }, [query])

  const go = (href: string) => {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  const pages = navGroups.flatMap((group) => group.items).filter((item) =>
    allowedHrefs.includes(item.href) && item.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
        <div className="border-b border-border p-3">
          <Input
            autoFocus
            placeholder="Find IMEI, invoice, supplier bill, or customer..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {pages.length > 0 && query ? (
            <div className="mb-2">
              <p className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">Pages</p>
              {pages.map((item) => (
                <button
                  key={item.href}
                  onClick={() => go(item.href)}
                  className="flex w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  {item.name}
                </button>
              ))}
            </div>
          ) : null}
          {results.map((result) => (
            <button
              key={`${result.kind}-${result.id}`}
              onClick={() => go(result.href)}
              className="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-muted"
            >
              <span className="text-sm font-medium">{result.title}</span>
              <span className="text-xs text-muted-foreground">
                {result.kind}
                {result.hint ? ` · ${result.hint}` : ""}
              </span>
            </button>
          ))}
          {!pending && query && results.length === 0 && pages.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matches</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
