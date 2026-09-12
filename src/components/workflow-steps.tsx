"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"

export type WorkflowStep = {
  label: string
  /** When set, the step is a filter/link, not just a picture. */
  href?: string
  /** Client-filter key when using `onSelect` instead of URLs. */
  key?: string
  count?: number
  /** Optional plain hint under the label. */
  hint?: string
}

/**
 * The life of a job, shown as numbered chips.
 *
 * When steps have `href`, they become URL filters. When `onSelect` is set and
 * a step has `key`, they become client filters. The active chip matches
 * `activeHref` or `activeKey`.
 */
export function WorkflowSteps({
  steps,
  current = 0,
  activeHref,
  activeKey,
  onSelect,
  className,
}: {
  steps: Array<string | WorkflowStep>
  current?: number
  activeHref?: string
  activeKey?: string
  onSelect?: (key: string) => void
  className?: string
}) {
  const normalized = steps.map((step) => (typeof step === "string" ? { label: step } : step))
  const clickable = Boolean(activeHref || onSelect)

  return (
    <ol className={cn("grid gap-2 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {normalized.map((step, index) => {
        const isActive = activeHref
          ? Boolean(step.href && urlsMatch(activeHref, step.href))
          : activeKey !== undefined
            ? step.key === activeKey
            : index === current
        const isDone = !clickable && index < current
        const state = isActive ? "active" : isDone ? "done" : "todo"
        const body = (
          <>
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  state === "done" && "bg-success/20 text-success",
                  state === "active" && "bg-primary/20 text-primary",
                  state === "todo" && "bg-muted text-muted-foreground"
                )}
              >
                {index + 1}
              </span>
              <span className="font-semibold leading-tight">{step.label}</span>
              {typeof step.count === "number" ? (
                <span className="ml-auto rounded-full bg-background/80 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                  {step.count}
                </span>
              ) : null}
            </span>
            {step.hint ? <span className="mt-1 block text-[11px] font-normal opacity-80">{step.hint}</span> : null}
            {step.href || (onSelect && step.key !== undefined) ? (
              <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide opacity-70">
                {isActive ? "Showing now" : "Tap to show"}
              </span>
            ) : null}
          </>
        )

        const classes = cn(
          "rounded-xl border px-3 py-2.5 text-left text-xs transition-all",
          state === "done" && "border-success/30 bg-success-soft text-success",
          state === "active" && "border-primary/40 bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20",
          state === "todo" && "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
          (step.href || (onSelect && step.key !== undefined)) &&
            "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        )

        return (
          <li key={`${index}-${step.key ?? step.label}`}>
            {step.href ? (
              <Link href={step.href} className={cn(classes, "block")} aria-current={isActive ? "page" : undefined}>
                {body}
              </Link>
            ) : onSelect && step.key !== undefined ? (
              <button
                type="button"
                className={cn(classes, "block w-full")}
                aria-pressed={isActive}
                onClick={() => onSelect(step.key!)}
              >
                {body}
              </button>
            ) : (
              <div className={classes}>{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function urlsMatch(current: string, href: string) {
  try {
    const a = new URL(current, "http://local")
    const b = new URL(href, "http://local")
    if (a.pathname !== b.pathname) return false
    // Active when every query on the chip is present on the current URL.
    for (const [key, value] of b.searchParams.entries()) {
      if (a.searchParams.get(key) !== value) return false
    }
    // And the chip is not "all" while the page has a tighter filter of the same key.
    if ([...b.searchParams.keys()].length === 0) {
      return [...a.searchParams.keys()].length === 0 || !a.searchParams.get("status")
    }
    return true
  } catch {
    return current === href
  }
}
