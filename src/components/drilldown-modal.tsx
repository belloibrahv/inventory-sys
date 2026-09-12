"use client"

import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The panel that opens when someone clicks a headline figure to see the rows
 * that add up to it.
 *
 * The client asked for every figure on Reports and Finance to be clickable, so
 * this is deliberately one component: the drill-down from "Stock at cost" must
 * look and close exactly like the drill-down from "Cash".
 */
export function DrilldownModal({
  open,
  onClose,
  eyebrow,
  title,
  summary,
  children,
  width = "wide",
}: {
  open: boolean
  onClose: () => void
  eyebrow?: string
  title: string
  summary?: ReactNode
  children: ReactNode
  width?: "wide" | "narrow"
}) {
  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "surface-card relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-b-none shadow-xl sm:rounded-lg",
          width === "wide" ? "max-w-5xl" : "max-w-2xl"
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {summary ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-2.5 text-xs text-muted-foreground">
            {summary}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">{children}</div>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
