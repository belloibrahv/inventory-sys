import { cn } from "@/lib/utils"

/** A grey block standing in for content the shop system is still fetching. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("motion-skeleton rounded-xl bg-muted", className)} aria-hidden />
}
