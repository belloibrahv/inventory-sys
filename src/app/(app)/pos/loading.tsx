import { Skeleton } from "@/components/ui/skeleton"

/** The till's own shape while it loads: scan box and cart on the left, pay panel on the right. */
export default function Loading() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]" role="status" aria-busy aria-label="Opening the till">
      <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/10">
        <div className="brand-page-bar h-full w-1/3 rounded-full bg-primary" />
      </div>
      <div className="space-y-4">
        <div className="surface-card space-y-3 p-4 sm:p-5">
          <Skeleton className="h-4 w-32 rounded-md" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
        <div className="surface-card flex flex-col items-center gap-3 px-6 py-12">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-4 w-56 rounded-md" />
        </div>
      </div>
      <div className="surface-card space-y-4 p-5">
        <Skeleton className="h-3 w-20 rounded-md" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
      <span className="sr-only">Opening the till</span>
    </div>
  )
}
