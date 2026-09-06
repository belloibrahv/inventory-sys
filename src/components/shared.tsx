import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { statusLabel, statusTone } from "@/lib/status"
import { cn } from "@/lib/utils"

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
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function StatusBadge({ value }: { value: string }) {
  return <Badge variant={statusTone(value)}>{statusLabel(value)}</Badge>
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function KpiCard({
  label,
  value,
  trend,
  tone = "blue",
  icon,
}: {
  label: string
  value: string
  trend?: { value: string; up?: boolean }
  tone?: "violet" | "blue" | "cyan" | "green"
  icon: ReactNode
}) {
  const tones = {
    violet: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-100",
    blue: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-100",
    cyan: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-100",
    green: "bg-brand/10 text-brand dark:bg-brand/20 dark:text-green-100",
  }

  return (
    <div className="surface-card p-5">
      <div className={cn("mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl", tones[tone])}>
        {icon}
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {trend ? (
        <p className={cn("mt-2 text-xs font-medium", trend.up === false ? "text-rose-500" : "text-emerald-600")}>
          {trend.value} from last month
        </p>
      ) : null}
    </div>
  )
}
