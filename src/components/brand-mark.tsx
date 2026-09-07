import { cn } from "@/lib/utils"

export function BrandMark({
  className,
  size = 36,
}: {
  className?: string
  size?: number
}) {
  return (
    <img
      src="/brand/ab-mark.jpg"
      alt="Abu Twins"
      width={size}
      height={size}
      className={cn("rounded-full bg-[#001BCE] object-cover", className)}
    />
  )
}

export function BrandLockup({
  light = false,
  compact = false,
}: {
  light?: boolean
  compact?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={compact ? 36 : 44} />
      <div className="min-w-0">
        <p className={cn("font-semibold tracking-tight", compact ? "text-sm" : "text-base", light ? "text-white" : "text-foreground")}>
          abutwins
          <span className={cn("font-medium", light ? "text-white/80" : "text-primary")}> Softskills</span>
        </p>
        <p className="mt-0.5 inline-flex rounded-[3px] bg-brand px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.18em] text-brand-foreground">
          Investment
        </p>
      </div>
    </div>
  )
}
