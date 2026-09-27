import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * One labelled field. Every form screen lays its fields out with these in a
 * grid, so labels sit above boxes in the same size and spacing everywhere
 * instead of each form choosing its own.
 */
export function FormField({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  /** Grid placement, e.g. "sm:col-span-2" for a field that needs the full row. */
  className?: string
}) {
  return (
    <label className={cn("block min-w-0 text-sm", className)}>
      <span className="mb-1.5 block font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs leading-snug text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

/** A titled group of fields inside a form screen. */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  )
}
