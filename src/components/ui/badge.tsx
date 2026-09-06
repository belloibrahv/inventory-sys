import type { HTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        success: "border-transparent bg-brand/10 text-brand dark:bg-brand/15 dark:text-green-300",
        warning: "border-transparent bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
        danger: "border-transparent bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
        info: "border-transparent bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
        outline: "text-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
