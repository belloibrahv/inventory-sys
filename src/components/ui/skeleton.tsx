import { cn } from "@/lib/utils"

/** A grey block standing in for content the shop system is still fetching. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} aria-hidden />
}
