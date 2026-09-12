"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { statusLabel, statusTone } from "@/lib/status"
import { cn } from "@/lib/utils"

/**
 * The screen vocabulary.
 *
 * Every page is built from these few pieces so that a heading, a figure, a
 * table and a filter bar look identical wherever they appear. Before this, each
 * screen invented its own card padding, its own uppercase label size and its own
 * green, which is what made the app read as busy. Reach for a primitive here
 * before writing new markup.
 */

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info"

const toneText: Record<Tone, string> = {
  neutral: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
}

const toneIcon: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
}

/** Title, one line of plain-language explanation, and the page's own actions. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** A titled panel. Use instead of a bare `surface-card` whenever it has a heading. */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush = false,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  /** Drop body padding, for a panel whose body is a full-bleed table. */
  flush?: boolean
}) {
  return (
    <section className={cn("surface-card overflow-hidden", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold tracking-tight">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn(flush ? "" : "p-5", bodyClassName)}>{children}</div>
    </section>
  )
}

/**
 * One figure with its label. The only way a number should be put on a screen.
 *
 * Give it `href` or `onClick` and the whole card becomes the target, which is how
 * every headline figure drills through to the rows behind it.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  href,
  onClick,
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
  icon?: ReactNode
  href?: string
  onClick?: () => void
  className?: string
}) {
  const interactive = Boolean(href || onClick)

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">{label}</p>
        {icon ? (
          <span className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md", toneIcon[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
      <p className={cn("mt-2 text-[1.7rem] font-semibold leading-tight tracking-tight num", toneText[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      {interactive ? (
        <p className="mt-2 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          See the rows that make this number &rarr;
        </p>
      ) : null}
    </>
  )

  const classes = cn(
    interactive ? "surface-card-interactive group" : "surface-card",
    "block p-4",
    className
  )

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(classes, "w-full")}>
        {body}
      </button>
    )
  }
  return <div className={classes}>{body}</div>
}

/** Responsive row of StatCards. Keeps every page's figure row on the same grid. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>
}

/** The filter / search / export strip that sits above a table. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("surface-card flex flex-wrap items-center gap-2 p-3", className)}>{children}</div>
  )
}

export type Column = {
  label: ReactNode
  align?: "left" | "right" | "center"
  className?: string
}

/** A table in its panel: one header band, one row rhythm, one scroll container. */
export function TableShell({
  columns,
  children,
  caption,
  footer,
  className,
}: {
  columns: Column[]
  children: ReactNode
  caption?: ReactNode
  /** Pager or summary strip under the rows. */
  footer?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("surface-card overflow-hidden", className)}>
      {caption ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          {caption}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th
                  key={index}
                  className={cn(
                    column.align === "right" && "text-right",
                    column.align === "center" && "text-center",
                    column.className
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {footer ?? null}
    </div>
  )
}

/** The "nothing here" row inside a TableShell. */
export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr className="hover:bg-transparent">
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  )
}

export function StatusBadge({ value }: { value: string }) {
  return <Badge variant={statusTone(value)}>{statusLabel(value)}</Badge>
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

/**
 * A pill saying what state something is in, in the one shape used everywhere.
 * Prefer this over hand-written coloured spans.
 */
export function TonePill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const tones: Record<Tone, string> = {
    neutral: "bg-muted text-muted-foreground",
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
  }
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold", tones[tone])}>
      {children}
    </span>
  )
}

/** The small grey code tag used for a shop, e.g. `IWO`. */
export function ShopTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
      {children}
    </span>
  )
}

/** Kept for the home screen. Same box as StatCard, with its month-on-month line. */
export function KpiCard({
  label,
  value,
  trend,
  icon,
  href,
}: {
  label: string
  value: string
  trend?: { value: string; up?: boolean }
  icon: ReactNode
  href?: string
}) {
  return (
    <StatCard
      label={label}
      value={value}
      icon={icon}
      href={href}
      hint={
        trend ? (
          <span className={trend.up === false ? "font-medium text-danger" : "font-medium text-success"}>
            {trend.value} from last month
          </span>
        ) : undefined
      }
    />
  )
}
